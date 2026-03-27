import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getOrderModel } from '@/models/materials/Order';
import { getCustomerModel } from '@/models/materials/Customer';
import { getTransactionModel } from '@/models/materials/Transaction';
import { requireBusinessRole } from '@/lib/auth';

// POST /api/materials/orders/[id]/cancel
export async function POST(request, { params }) {
  try {
    const currentUser = await requireBusinessRole('materials', ['admin', 'staff']);
    const conn = await connectMaterialsDB();
    const Order = getOrderModel(conn);
    const Customer = getCustomerModel(conn);
    const Transaction = getTransactionModel(conn);
    const { id } = await params;

    const { reason } = await request.json();
    if (!reason || reason.trim().length < 5) {
      return NextResponse.json(
        { error: 'A reason is required when cancelling an order (min 5 characters)' },
        { status: 400 }
      );
    }

    const order = await Order.findById(id);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (order.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot cancel an order that is already ${order.status}` },
        { status: 400 }
      );
    }

    order.status = 'cancelled';
    order.cancelledBy = currentUser.id;
    order.cancelledByName = currentUser.name;
    order.cancelledAt = new Date();
    order.cancelReason = reason.trim();
    await order.save();

    // Refund balance if any was deducted
    if (order.balanceDeducted > 0) {
      const customer = await Customer.findById(order.customerId);
      if (customer) {
        const balanceBefore = customer.balance;
        customer.balance += order.balanceDeducted;
        await customer.save();

        await Transaction.create({
          customerId: customer._id,
          customerName: customer.name,
          type: 'refund',
          amount: order.balanceDeducted,
          balanceBefore,
          balanceAfter: customer.balance,
          referenceType: 'Order',
          referenceId: order._id,
          description: `Refund for cancelled order #${order._id.toString().slice(-6).toUpperCase()}`,
          createdBy: currentUser.id,
          createdByName: currentUser.name,
        });
      }
    }

    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to cancel order' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
