import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getOrderModel } from '@/models/materials/Order';
import { getCustomerModel } from '@/models/materials/Customer';
import { getProductUnitModel } from '@/models/materials/ProductUnit';
import { getTransactionModel } from '@/models/materials/Transaction';
import { requireBusinessRole } from '@/lib/auth';

async function getModels() {
  const conn = await connectMaterialsDB();
  return {
    Order: getOrderModel(conn),
    Customer: getCustomerModel(conn),
    ProductUnit: getProductUnitModel(conn),
    Transaction: getTransactionModel(conn),
  };
}

// GET /api/materials/orders
export async function GET(request) {
  try {
    const currentUser = await requireBusinessRole('materials', ['admin', 'staff', 'auditor', 'customer']);
    const { Order } = await getModels();
    const { searchParams } = new URL(request.url);

    const query = {};
    if (currentUser.role === 'customer') {
      // Customers can only see their own orders
      query.customerId = currentUser.customerId;
    } else {
      const customerId = searchParams.get('customerId');
      const status = searchParams.get('status');
      if (customerId) query.customerId = customerId;
      if (status) query.status = status;
    }

    const orders = await Order.find(query).sort({ createdAt: -1 }).limit(200);
    return NextResponse.json({ orders });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch orders' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// POST /api/materials/orders
export async function POST(request) {
  try {
    const currentUser = await requireBusinessRole('materials', ['admin', 'staff', 'customer']);
    const { Order, Customer, ProductUnit, Transaction } = await getModels();

    const body = await request.json();
    const { customerId, items, notes, confirmOrder = false } = body;

    const effectiveCustomerId =
      currentUser.role === 'customer' ? currentUser.customerId : customerId;

    if (!effectiveCustomerId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Valid customer context and at least one item are required' }, { status: 400 });
    }

    const customer = await Customer.findById(effectiveCustomerId);
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    if (customer.isFlagged) {
      return NextResponse.json(
        { error: 'Cannot create order for a flagged customer' },
        { status: 400 }
      );
    }

    // Validate and price each item
    const resolvedItems = [];
    let totalAmount = 0;

    for (const item of items) {
      const unit = await ProductUnit.findById(item.unitId);
      if (!unit) {
        return NextResponse.json(
          { error: `Product unit not found: ${item.unitId}` },
          { status: 404 }
        );
      }
      if (Number(item.quantity) > Number(unit.stockQuantity || 0)) {
        return NextResponse.json(
          { error: `Insufficient stock for ${unit.productName} - ${unit.name}` },
          { status: 400 }
        );
      }
      const subtotal = unit.pricePerUnit * Number(item.quantity);
      resolvedItems.push({
        productId: unit.productId,
        productName: unit.productName,
        unitId: unit._id,
        unitName: unit.name,
        quantity: Number(item.quantity),
        pricePerUnit: unit.pricePerUnit,
        subtotal,
      });
      totalAmount += subtotal;
    }

    const balanceBefore = Number(customer.balance || 0);
    const availableBalance = Math.max(balanceBefore, 0);
    const balanceDeducted = Math.min(availableBalance, totalAmount);
    const amountOwed = totalAmount - balanceDeducted;

    if (currentUser.role === 'customer' && balanceBefore < totalAmount) {
      return NextResponse.json(
        { error: 'Insufficient balance. Please contact staff or top up your account before placing this order.' },
        { status: 400 }
      );
    }

    const order = await Order.create({
      customerId: customer._id,
      customerName: customer.name,
      items: resolvedItems,
      totalAmount,
      balanceDeducted,
      amountOwed,
      status: confirmOrder ? 'fulfilled' : 'pending',
      notes,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      ...(confirmOrder
        ? {
            fulfilledBy: currentUser.id,
            fulfilledByName: currentUser.name,
            fulfilledAt: new Date(),
          }
        : {}),
    });

    if (confirmOrder) {
      for (const item of resolvedItems) {
        const unit = await ProductUnit.findById(item.unitId);
        if (!unit) {
          return NextResponse.json({ error: `Inventory unit not found for ${item.unitName}` }, { status: 404 });
        }
        if (Number(unit.stockQuantity || 0) < Number(item.quantity || 0)) {
          return NextResponse.json(
            { error: `Insufficient stock for ${item.productName} - ${item.unitName}` },
            { status: 400 }
          );
        }
      }

      for (const item of resolvedItems) {
        const unit = await ProductUnit.findById(item.unitId);
        unit.stockQuantity = Number(unit.stockQuantity || 0) - Number(item.quantity || 0);
        await unit.save();
      }

      customer.balance = balanceBefore - totalAmount;
      await customer.save();

      await Transaction.create({
        customerId: customer._id,
        customerName: customer.name,
        type: 'order',
        amount: -totalAmount,
        balanceBefore,
        balanceAfter: customer.balance,
        referenceType: 'Order',
        referenceId: order._id,
        description: `Order #${order._id.toString().slice(-6).toUpperCase()} confirmed for ${resolvedItems.length} item(s)${notes ? ` - ${notes}` : ''}`,
        createdBy: currentUser.id,
        createdByName: currentUser.name,
      });
    }

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to create order' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
