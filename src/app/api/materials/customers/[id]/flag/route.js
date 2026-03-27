import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getCustomerModel } from '@/models/materials/Customer';
import { requireBusinessRole } from '@/lib/auth';

// POST /api/materials/customers/[id]/flag
export async function POST(request, { params }) {
  try {
    const currentUser = await requireBusinessRole('materials', ['admin', 'auditor']);
    const conn = await connectMaterialsDB();
    const Customer = getCustomerModel(conn);
    const { id } = await params;

    const { flag, reason } = await request.json();

    const customer = await Customer.findById(id);
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    if (flag && (!reason || reason.trim().length < 5)) {
      return NextResponse.json(
        { error: 'A reason is required when flagging a customer (min 5 characters)' },
        { status: 400 }
      );
    }

    customer.isFlagged = Boolean(flag);
    customer.flagReason = flag ? reason.trim() : undefined;
    await customer.save();

    return NextResponse.json({ customer });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to update flag status' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
