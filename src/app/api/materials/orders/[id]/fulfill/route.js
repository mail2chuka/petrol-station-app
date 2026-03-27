import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getOrderModel } from '@/models/materials/Order';
import { getCustomerModel } from '@/models/materials/Customer';
import { getTransactionModel } from '@/models/materials/Transaction';
import { getProductUnitModel } from '@/models/materials/ProductUnit';
import { requireBusinessRole } from '@/lib/auth';

// POST /api/materials/orders/[id]/fulfill
// Deducts balance from customer and marks order fulfilled
export async function POST(request, { params }) {
  try {
    const currentUser = await requireBusinessRole('materials', ['admin', 'staff']);
    const conn = await connectMaterialsDB();
    const Order = getOrderModel(conn);
    const Customer = getCustomerModel(conn);
    const Transaction = getTransactionModel(conn);
    const ProductUnit = getProductUnitModel(conn);

    const { id } = await params;
    const order = await Order.findById(id);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (order.status !== 'pending') {
      return NextResponse.json(
        { error: `Order is already ${order.status}` },
        { status: 400 }
      );
    }

    const customer = await Customer.findById(order.customerId);
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    // Validate and deduct inventory at fulfillment time.
    for (const item of order.items || []) {
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

    for (const item of order.items || []) {
      const unit = await ProductUnit.findById(item.unitId);
      unit.stockQuantity = Math.max(0, Number(unit.stockQuantity || 0) - Number(item.quantity || 0));
      await unit.save();
    }

    // Deduct from customer balance
    const balanceBefore = Number(customer.balance || 0);
    const availableBalance = Math.max(balanceBefore, 0);
    const deduction = Math.min(availableBalance, order.totalAmount);
    customer.balance = balanceBefore - order.totalAmount;
    await customer.save();

    order.status = 'fulfilled';
    order.balanceDeducted = deduction;
    order.amountOwed = order.totalAmount - deduction;
    order.fulfilledBy = currentUser.id;
    order.fulfilledByName = currentUser.name;
    order.fulfilledAt = new Date();
    await order.save();

    // Record transaction
    await Transaction.create({
      customerId: customer._id,
      customerName: customer.name,
      type: 'order',
      amount: -order.totalAmount,
      balanceBefore,
      balanceAfter: customer.balance,
      referenceType: 'Order',
      referenceId: order._id,
      description: `Order #${order._id.toString().slice(-6).toUpperCase()} fulfilled for ${order.items?.length || 0} item(s)${order.notes ? ` - ${order.notes}` : ''}`,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
    });

    return NextResponse.json({ order, customer });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fulfill order' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
