import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import PaymentRecord from '@/models/PaymentRecord';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

const reviewSchema = z.object({
  action: z.enum(['approve', 'query']),
  note: z.string().min(2),
});

// PATCH /api/payments/[id]/review
export async function PATCH(request, { params }) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (![ROLES.MANAGER, ROLES.ADMIN].includes(currentUser.role)) {
      return NextResponse.json(
        { error: 'Only manager/admin can review payment records' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const payload = reviewSchema.parse(await request.json());
    const record = await PaymentRecord.findById(id);

    if (!record) {
      return NextResponse.json({ error: 'Payment record not found' }, { status: 404 });
    }

    if (currentUser.role === ROLES.MANAGER && currentUser.stationId !== record.stationId.toString()) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    record.managerReviewStatus = payload.action === 'approve' ? 'approved' : 'queried';
    record.managerReviewNote = payload.note;
    record.reviewedByManagerId = currentUser.id;
    record.reviewedByManagerName = currentUser.name;
    record.reviewedAt = new Date();

    await record.save();
    return NextResponse.json({ record });
  } catch (error) {
    console.error('Error reviewing payment record:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    return NextResponse.json(
      { error: error.message || 'Failed to review payment record' },
      { status: 500 }
    );
  }
}
