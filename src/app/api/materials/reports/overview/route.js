import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getOrderModel } from '@/models/materials/Order';
import { getTopUpModel } from '@/models/materials/TopUp';
import { getCustomerModel } from '@/models/materials/Customer';
import { requireBusinessRole } from '@/lib/auth';

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfNextDay(value) {
  const date = startOfDay(value);
  date.setDate(date.getDate() + 1);
  return date;
}

function resolveRange(searchParams) {
  const view = searchParams.get('view') || 'monthly';
  const today = new Date();

  if (view === 'daily') {
    const dateValue = searchParams.get('date') || today.toISOString().slice(0, 10);
    const start = startOfDay(dateValue);
    return {
      view,
      start,
      end: startOfNextDay(dateValue),
      label: dateValue,
    };
  }

  if (view === 'custom') {
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!from || !to) {
      throw new Error('From and to dates are required for custom view');
    }

    return {
      view,
      start: startOfDay(from),
      end: startOfNextDay(to),
      label: `${from} to ${to}`,
    };
  }

  const monthValue = searchParams.get('month') || today.toISOString().slice(0, 7);
  const start = new Date(`${monthValue}-01T00:00:00`);

  if (Number.isNaN(start.getTime())) {
    throw new Error('Invalid month supplied');
  }

  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  return {
    view: 'monthly',
    start,
    end,
    label: monthValue,
  };
}

function safeNumber(value) {
  return Number(value || 0);
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getScopedOrder(order, productId) {
  const scopedItems = productId
    ? (order.items || []).filter((item) => String(item.productId) === String(productId))
    : (order.items || []);

  if (!scopedItems.length) {
    return null;
  }

  const quantity = scopedItems.reduce((sum, item) => sum + safeNumber(item.quantity), 0);
  const subtotal = scopedItems.reduce((sum, item) => sum + safeNumber(item.subtotal), 0);
  const ratio = safeNumber(order.totalAmount) > 0 ? subtotal / safeNumber(order.totalAmount) : 0;

  return {
    items: scopedItems,
    quantity,
    subtotal,
    balanceApplied: roundCurrency(safeNumber(order.balanceDeducted) * ratio),
    debtIncurred: roundCurrency(safeNumber(order.amountOwed) * ratio),
  };
}

function getPeriodKey(date, view) {
  const current = new Date(date);
  if (view === 'daily') {
    return `${String(current.getHours()).padStart(2, '0')}:00`;
  }

  return current.toISOString().slice(0, 10);
}

// GET /api/materials/reports/overview
export async function GET(request) {
  try {
    const currentUser = await requireBusinessRole('materials', ['admin', 'staff', 'auditor']);
    const conn = await connectMaterialsDB();
    const Order = getOrderModel(conn);
    const TopUp = getTopUpModel(conn);
    const Customer = getCustomerModel(conn);

    const { searchParams } = new URL(request.url);
    const { view, start, end, label } = resolveRange(searchParams);
    const customerId = searchParams.get('customerId');
    const productId = searchParams.get('productId');

    const orderQuery = {
      status: 'fulfilled',
      createdAt: { $gte: start, $lt: end },
    };

    if (customerId) {
      orderQuery.customerId = customerId;
    }

    if (productId) {
      orderQuery['items.productId'] = productId;
    }

    const topUpQuery = {
      status: 'completed',
      createdAt: { $gte: start, $lt: end },
    };

    if (customerId) {
      topUpQuery.customerId = customerId;
    }

    const shouldLoadDebtors = currentUser.role !== 'staff' && !productId;

    const [orders, topUps, debtCustomers] = await Promise.all([
      Order.find(orderQuery).sort({ createdAt: -1 }).lean(),
      TopUp.find(topUpQuery).sort({ createdAt: -1 }).lean(),
      shouldLoadDebtors
        ? Customer.find({
            isActive: true,
            ...(customerId ? { _id: customerId } : {}),
          })
            .select('name balance')
            .sort({ balance: 1 })
            .lean()
        : Promise.resolve([]),
    ]);

    const summary = {
      orderCount: 0,
      quantitySold: 0,
      totalSalesAmount: 0,
      balanceApplied: 0,
      debtIncurred: 0,
      uniqueCustomers: 0,
      uniqueProducts: 0,
    };

    const productMap = new Map();
    const customerMap = new Map();
    const periodMap = new Map();
    const uniqueCustomers = new Set();
    const uniqueProducts = new Set();

    const orderRows = [];

    for (const order of orders) {
      const scoped = getScopedOrder(order, productId);
      if (!scoped) continue;

      summary.orderCount += 1;
      summary.quantitySold += scoped.quantity;
      summary.totalSalesAmount += scoped.subtotal;
      summary.balanceApplied += scoped.balanceApplied;
      summary.debtIncurred += scoped.debtIncurred;
      uniqueCustomers.add(String(order.customerId));

      const productNames = [];
      for (const item of scoped.items) {
        const productKey = String(item.productId || item.productName);
        uniqueProducts.add(productKey);
        productNames.push(item.productName);

        if (!productMap.has(productKey)) {
          productMap.set(productKey, {
            productId: item.productId,
            productName: item.productName,
            quantitySold: 0,
            totalSalesAmount: 0,
            orderCount: 0,
          });
        }

        const productEntry = productMap.get(productKey);
        productEntry.quantitySold += safeNumber(item.quantity);
        productEntry.totalSalesAmount += safeNumber(item.subtotal);
        productEntry.orderCount += 1;
      }

      const customerKey = String(order.customerId);
      if (!customerMap.has(customerKey)) {
        customerMap.set(customerKey, {
          customerId: order.customerId,
          customerName: order.customerName || 'Unknown customer',
          orderCount: 0,
          quantitySold: 0,
          totalSalesAmount: 0,
          debtIncurred: 0,
        });
      }

      const customerEntry = customerMap.get(customerKey);
      customerEntry.orderCount += 1;
      customerEntry.quantitySold += scoped.quantity;
      customerEntry.totalSalesAmount += scoped.subtotal;
      customerEntry.debtIncurred += scoped.debtIncurred;

      const periodKey = getPeriodKey(order.createdAt, view);
      if (!periodMap.has(periodKey)) {
        periodMap.set(periodKey, {
          period: periodKey,
          orderCount: 0,
          quantitySold: 0,
          totalSalesAmount: 0,
          debtIncurred: 0,
        });
      }

      const periodEntry = periodMap.get(periodKey);
      periodEntry.orderCount += 1;
      periodEntry.quantitySold += scoped.quantity;
      periodEntry.totalSalesAmount += scoped.subtotal;
      periodEntry.debtIncurred += scoped.debtIncurred;

      orderRows.push({
        _id: order._id,
        createdAt: order.createdAt,
        customerName: order.customerName || 'Unknown customer',
        itemSummary: scoped.items
          .map((item) => `${item.quantity} × ${item.unitName} of ${item.productName}`)
          .join(', '),
        quantitySold: scoped.quantity,
        totalSalesAmount: scoped.subtotal,
        balanceApplied: scoped.balanceApplied,
        debtIncurred: scoped.debtIncurred,
        productCount: new Set(productNames).size,
      });
    }

    summary.totalSalesAmount = roundCurrency(summary.totalSalesAmount);
    summary.balanceApplied = roundCurrency(summary.balanceApplied);
    summary.debtIncurred = roundCurrency(summary.debtIncurred);
    summary.uniqueCustomers = uniqueCustomers.size;
    summary.uniqueProducts = uniqueProducts.size;

    const topUpInflow = productId
      ? null
      : roundCurrency(topUps.reduce((sum, entry) => sum + safeNumber(entry.amount), 0));

    const debtorRows = (debtCustomers || [])
      .filter((customer) => safeNumber(customer.balance) < 0)
      .map((customer) => ({
        customerId: customer._id,
        customerName: customer.name,
        currentDebt: Math.abs(safeNumber(customer.balance)),
      }))
      .sort((left, right) => right.currentDebt - left.currentDebt);

    const currentOutstandingDebt = roundCurrency(
      debtorRows.reduce((sum, customer) => sum + safeNumber(customer.currentDebt), 0)
    );

    const canSeeAmounts = currentUser.role !== 'staff';
    const canSeeDebt = currentUser.role !== 'staff';

    const redactedSummary = {
      ...summary,
      totalSalesAmount: canSeeAmounts ? summary.totalSalesAmount : null,
      balanceApplied: canSeeAmounts ? summary.balanceApplied : null,
      debtIncurred: canSeeDebt ? summary.debtIncurred : null,
      topUpInflow: canSeeAmounts ? topUpInflow : null,
      topUpCount: canSeeAmounts ? (productId ? null : topUps.length) : null,
      currentOutstandingDebt: canSeeDebt ? currentOutstandingDebt : null,
    };

    const productBreakdown = Array.from(productMap.values())
      .map((entry) => ({
        productId: entry.productId,
        productName: entry.productName,
        quantitySold: entry.quantitySold,
        orderCount: entry.orderCount,
        ...(canSeeAmounts ? { totalSalesAmount: roundCurrency(entry.totalSalesAmount) } : {}),
      }))
      .sort((left, right) => right.quantitySold - left.quantitySold);

    const customerBreakdown = Array.from(customerMap.values())
      .map((entry) => ({
        customerId: entry.customerId,
        customerName: entry.customerName,
        orderCount: entry.orderCount,
        quantitySold: entry.quantitySold,
        ...(canSeeAmounts ? { totalSalesAmount: roundCurrency(entry.totalSalesAmount) } : {}),
        ...(canSeeDebt ? { debtIncurred: roundCurrency(entry.debtIncurred) } : {}),
      }))
      .sort((left, right) => right.orderCount - left.orderCount);

    const timeline = Array.from(periodMap.values())
      .map((entry) => ({
        period: entry.period,
        orderCount: entry.orderCount,
        quantitySold: entry.quantitySold,
        ...(canSeeAmounts ? { totalSalesAmount: roundCurrency(entry.totalSalesAmount) } : {}),
        ...(canSeeDebt ? { debtIncurred: roundCurrency(entry.debtIncurred) } : {}),
      }))
      .sort((left, right) => left.period.localeCompare(right.period));

    const sanitizedOrderRows = orderRows.map((row) => ({
      _id: row._id,
      createdAt: row.createdAt,
      customerName: row.customerName,
      itemSummary: row.itemSummary,
      quantitySold: row.quantitySold,
      productCount: row.productCount,
      ...(canSeeAmounts
        ? {
            totalSalesAmount: row.totalSalesAmount,
            balanceApplied: row.balanceApplied,
          }
        : {}),
      ...(canSeeDebt ? { debtIncurred: row.debtIncurred } : {}),
    }));

    return NextResponse.json({
      permissions: {
        canSeeAmounts,
        canSeeDebt,
      },
      filters: {
        view,
        label,
        customerId: customerId || '',
        productId: productId || '',
      },
      summary: redactedSummary,
      notes: {
        topUpsAreNotProductScoped: Boolean(productId),
      },
      productBreakdown,
      customerBreakdown,
      timeline,
      orderRows: sanitizedOrderRows,
      cashFlow: {
        salesValue: canSeeAmounts ? summary.totalSalesAmount : null,
        balanceApplied: canSeeAmounts ? summary.balanceApplied : null,
        topUpInflow: canSeeAmounts ? topUpInflow : null,
        debtIncurred: canSeeDebt ? summary.debtIncurred : null,
        currentOutstandingDebt: canSeeDebt ? currentOutstandingDebt : null,
      },
      debtors: canSeeDebt ? debtorRows : [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to load materials report overview' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}