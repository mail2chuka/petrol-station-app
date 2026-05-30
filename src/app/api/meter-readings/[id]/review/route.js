import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import MeterReading from '@/models/MeterReading';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { notifySupervisorMeterReview } from '@/lib/notifications';

const reviewSchema = z.object({
  action: z.enum(['approve', 'query']),
  note: z.string().min(2),
});

// PATCH /api/meter-readings/[id]/review
export async function PATCH(request, { params }) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (![ROLES.MANAGER, ROLES.ADMIN].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Only manager/admin can review supervisor entries' }, { status: 403 });
    }

    const { id } = await params;
    const payload = reviewSchema.parse(await request.json());
    const reading = await MeterReading.findById(id);

    if (!reading) {
      return NextResponse.json({ error: 'Meter reading not found' }, { status: 404 });
    }

    if (currentUser.role === ROLES.MANAGER && currentUser.stationId !== reading.stationId.toString()) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    reading.managerReviewStatus = payload.action === 'approve' ? 'approved' : 'query';
    reading.managerReviewNote = payload.note;
    reading.reviewedByManagerId = currentUser.id;
    reading.reviewedByManagerName = currentUser.name;
    reading.reviewedAt = new Date();

    await reading.save();

    // Notify the supervisor of the review result
    await notifySupervisorMeterReview({
      supervisorId: reading.supervisorId,
      stationId: reading.stationId,
      stationName: reading.stationName,
      managerName: currentUser.name,
      pumpLabel: reading.pumpLabel || reading.pumpId,
      action: payload.action,
      note: payload.note,
      readingId: reading._id,
    });

    return NextResponse.json({ reading });
  } catch (error) {
    console.error('Error reviewing meter reading:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Failed to review meter reading' }, { status: 500 });
  }
}
