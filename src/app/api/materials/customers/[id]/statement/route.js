import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getCustomerModel } from '@/models/materials/Customer';
import { getTransactionModel } from '@/models/materials/Transaction';
import { getOrderModel } from '@/models/materials/Order';
import { getTopUpModel } from '@/models/materials/TopUp';
import { requireBusinessRole } from '@/lib/auth';

// GET /api/materials/customers/[id]/statement
export async function GET(request, { params }) {
  try {
    await requireBusinessRole('materials', ['admin', 'staff', 'auditor']);
    const conn = await connectMaterialsDB();
    const Customer = getCustomerModel(conn);
    const Transaction = getTransactionModel(conn);
    const Order = getOrderModel(conn);
    const TopUp = getTopUpModel(conn);
    const { id } = await params;

    const customer = await Customer.findById(id);
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') ? new Date(searchParams.get('from')) : null;
    const to = searchParams.get('to') ? new Date(searchParams.get('to')) : null;

    const dateFilter = {};
    if (from) dateFilter.$gte = from;
    if (to) dateFilter.$lte = to;

    const txQuery = { customerId: customer._id };
    if (from || to) txQuery.createdAt = dateFilter;

    const [transactions, orders, topups] = await Promise.all([
      Transaction.find(txQuery).sort({ createdAt: -1 }),
      Order.find({ customerId: customer._id, ...(from || to ? { createdAt: dateFilter } : {}) }).sort({ createdAt: -1 }),
      TopUp.find({ customerId: customer._id, status: 'completed', ...(from || to ? { createdAt: dateFilter } : {}) }).sort({ createdAt: -1 }),
    ]);

    return NextResponse.json({
      customer,
      transactions,
      orders,
      topups,
      summary: {
        totalTopups: topups.reduce((s, t) => s + t.amount, 0),
        totalOrders: orders.filter(o => o.status === 'fulfilled').reduce((s, o) => s + o.totalAmount, 0),
        currentBalance: customer.balance,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch statement' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
