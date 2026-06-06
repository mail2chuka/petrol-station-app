import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import PaymentRecord from '@/models/PaymentRecord';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// PATCH /api/payments/[id] - Admin correction of cash/POS amounts
export async function PATCH(request, { params }) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (currentUser.role !== ROLES.ADMIN) {
      return NextResponse.json({ error: 'Only admins can correct payment records' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const record = await PaymentRecord.findById(id);
    if (!record) {
      return NextResponse.json({ error: 'Payment record not found' }, { status: 404 });
    }

    if (body.cashReceived !== undefined) record.cashReceived = parseFloat(body.cashReceived) || 0;
    if (body.posReceived !== undefined) record.posReceived = parseFloat(body.posReceived) || 0;
    record.totalReceived = (record.cashReceived || 0) + (record.posReceived || 0);
    record.adminCorrectedBy = currentUser.name;
    record.adminCorrectedAt = new Date();

    await record.save();
    return NextResponse.json({ record });
  } catch (error) {
    console.error('Error correcting payment record:', error);
    return NextResponse.json({ error: error.message || 'Failed to update payment record' }, { status: 500 });
  }
}
