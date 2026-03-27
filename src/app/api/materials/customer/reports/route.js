import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getCustomerModel } from '@/models/materials/Customer';
import { getOrderModel } from '@/models/materials/Order';
import { getTopUpModel } from '@/models/materials/TopUp';
import { getTransactionModel } from '@/models/materials/Transaction';
import { requireBusinessRole } from '@/lib/auth';

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function formatMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

// GET /api/materials/customer/reports
export async function GET(request) {
  try {
    const currentUser = await requireBusinessRole('materials', ['customer']);
    const conn = await connectMaterialsDB();
    const Customer = getCustomerModel(conn);
    const Order = getOrderModel(conn);
    const TopUp = getTopUpModel(conn);
    const Transaction = getTransactionModel(conn);

    const customer = await Customer.findById(currentUser.customerId).lean();
    if (!customer) {
      return NextResponse.json({ error: 'Customer account not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const status = searchParams.get('status');

    const dateQuery = {};
    if (from) dateQuery.$gte = startOfDay(from);
    if (to) dateQuery.$lte = endOfDay(to);
    const hasDateQuery = from || to;

    const orderQuery = { customerId: customer._id };
    if (hasDateQuery) orderQuery.createdAt = dateQuery;
    if (status && status !== 'all') orderQuery.status = status;

    const transactionQuery = { customerId: customer._id };
    if (hasDateQuery) transactionQuery.createdAt = dateQuery;

    const [orders, transactions, priorTransaction] = await Promise.all([
      Order.find(orderQuery).sort({ createdAt: -1 }).lean(),
      Transaction.find(transactionQuery).sort({ createdAt: -1 }).lean(),
      from
        ? Transaction.findOne({ customerId: customer._id, createdAt: { $lt: startOfDay(from) } })
            .sort({ createdAt: -1 })
            .lean()
        : Promise.resolve(null),
    ]);

    const topupIds = transactions
      .filter((entry) => entry.referenceType === 'TopUp' && entry.referenceId)
      .map((entry) => entry.referenceId);
    const orderIds = transactions
      .filter((entry) => entry.referenceType === 'Order' && entry.referenceId)
      .map((entry) => entry.referenceId);

    const [topups, referencedOrders] = await Promise.all([
      topupIds.length ? TopUp.find({ _id: { $in: topupIds } }).lean() : Promise.resolve([]),
      orderIds.length ? Order.find({ _id: { $in: orderIds } }).lean() : Promise.resolve([]),
    ]);

    const topupsById = Object.fromEntries(topups.map((entry) => [String(entry._id), entry]));
    const ordersById = Object.fromEntries(referencedOrders.map((entry) => [String(entry._id), entry]));

    const salesOrders = orders.map((order) => ({
      _id: order._id,
      createdAt: order.createdAt,
      status: order.status,
      itemCount: order.items?.length || 0,
      itemSummary: (order.items || [])
        .map((item) => `${item.quantity} × ${item.unitName} of ${item.productName}`)
        .join(', '),
      totalAmount: formatMoney(order.totalAmount),
      paidAmount: formatMoney(order.balanceDeducted),
      owedAmount: formatMoney(order.amountOwed),
      notes: order.notes || '',
    }));

    const statementEntries = transactions.map((entry) => {
      const topup = entry.referenceType === 'TopUp' ? topupsById[String(entry.referenceId)] : null;
      const order = entry.referenceType === 'Order' ? ordersById[String(entry.referenceId)] : null;
      const amount = formatMoney(entry.amount);
      const credit = amount > 0 ? amount : 0;
      const debit = amount < 0 ? Math.abs(amount) : 0;

      let description = entry.description || 'Account activity';
      if (topup?.notes && !description.includes(topup.notes)) {
        description = `${description} - ${topup.notes}`;
      }
      if (order?.notes && !description.includes(order.notes)) {
        description = `${description} - ${order.notes}`;
      }

      return {
        _id: entry._id,
        createdAt: entry.createdAt,
        type: entry.type,
        description,
        credit,
        debit,
        amount,
        balanceBefore: formatMoney(entry.balanceBefore),
        balanceAfter: formatMoney(entry.balanceAfter),
        referenceLabel:
          entry.referenceType === 'Order'
            ? `Order #${String(entry.referenceId).slice(-6).toUpperCase()}`
            : entry.referenceType === 'TopUp'
              ? `Top-up #${String(entry.referenceId).slice(-6).toUpperCase()}`
              : 'Manual entry',
      };
    });

    const transactionsAsc = [...statementEntries].sort(
      (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    );

    const openingBalance = from
      ? formatMoney(priorTransaction?.balanceAfter ?? transactionsAsc[0]?.balanceBefore ?? customer.balance)
      : formatMoney(transactionsAsc[0]?.balanceBefore ?? customer.balance);
    const closingBalance = formatMoney(transactionsAsc[transactionsAsc.length - 1]?.balanceAfter ?? customer.balance);

    const salesSummary = {
      totalOrders: salesOrders.length,
      fulfilledOrders: salesOrders.filter((order) => order.status === 'fulfilled').length,
      pendingOrders: salesOrders.filter((order) => order.status === 'pending').length,
      cancelledOrders: salesOrders.filter((order) => order.status === 'cancelled').length,
      totalOrderAmount: formatMoney(salesOrders.reduce((sum, order) => sum + order.totalAmount, 0)),
      totalPaidAmount: formatMoney(salesOrders.reduce((sum, order) => sum + order.paidAmount, 0)),
      totalOutstandingAmount: formatMoney(salesOrders.reduce((sum, order) => sum + order.owedAmount, 0)),
    };

    const accountSummary = {
      openingBalance,
      closingBalance,
      currentBalance: formatMoney(customer.balance),
      totalCredits: formatMoney(statementEntries.reduce((sum, entry) => sum + entry.credit, 0)),
      totalDebits: formatMoney(statementEntries.reduce((sum, entry) => sum + entry.debit, 0)),
    };

    return NextResponse.json({
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        balance: formatMoney(customer.balance),
      },
      filters: {
        from: from || '',
        to: to || '',
        status: status || 'all',
      },
      salesSummary,
      accountSummary,
      salesOrders,
      statementEntries,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to load customer reports' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}