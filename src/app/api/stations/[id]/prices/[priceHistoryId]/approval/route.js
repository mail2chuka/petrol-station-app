import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/db';
import Station from '@/models/Station';
import PriceHistory from '@/models/PriceHistory';
import DayShift from '@/models/DayShift';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES, DAY_STATUS } from '@/lib/constants';
import { autoCloseExpiredInProgressShifts } from '@/lib/dayShiftLifecycle';

const approvalSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  adminNote: z.string().min(3, 'Admin note must be at least 3 characters'),
});

// PATCH /api/stations/[id]/prices/[priceHistoryId]/approval
export async function PATCH(request, { params }) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (currentUser.role !== ROLES.ADMIN) {
      return NextResponse.json(
        { error: 'Only administrators can approve or reject price changes' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = approvalSchema.parse(body);

    const station = await Station.findById(params.id).session(session);
    if (!station) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Station not found' },
        { status: 404 }
      );
    }

    await autoCloseExpiredInProgressShifts({ stationId: station._id, session });

    const activeDay = await DayShift.findOne({
      stationId: station._id,
      status: DAY_STATUS.IN_PROGRESS,
    }).session(session);

    if (!activeDay) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'A day shift must be started before price changes can be approved or rejected' },
        { status: 400 }
      );
    }

    const priceRequest = await PriceHistory.findOne({
      _id: params.priceHistoryId,
      stationId: station._id,
    }).session(session);

    if (!priceRequest) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Price change request not found' },
        { status: 404 }
      );
    }

    if (priceRequest.approvalStatus !== 'pending') {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Only pending requests can be approved or rejected' },
        { status: 400 }
      );
    }

    priceRequest.approvalStatus = validatedData.status;
    priceRequest.adminNote = validatedData.adminNote;
    priceRequest.approvedBy = currentUser.id;
    priceRequest.approvedByName = currentUser.name;
    priceRequest.approvedAt = new Date();

    if (validatedData.status === 'approved') {
      station.currentPrices[priceRequest.fuelType] = priceRequest.newPrice;
      await station.save({ session });
      // Effective time is the approval time so downstream sales can apply it correctly.
      priceRequest.effectiveDate = new Date();
    }

    await priceRequest.save({ session });

    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.ADJUST_PRICE,
      resource: AUDIT_RESOURCES.PRICE,
      resourceId: priceRequest._id.toString(),
      stationId: station._id,
      stationName: station.name,
      details: {
        requestId: priceRequest._id,
        fuelType: priceRequest.fuelType,
        previousPrice: priceRequest.previousPrice,
        requestedPrice: priceRequest.newPrice,
        approvalStatus: validatedData.status,
        adminNote: validatedData.adminNote,
      },
    });

    await session.commitTransaction();

    return NextResponse.json({
      station,
      priceRequest,
      message:
        validatedData.status === 'approved'
          ? 'Price change approved and applied'
          : 'Price change rejected',
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error processing price change approval:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to process price change approval' },
      { status: 500 }
    );
  } finally {
    session.endSession();
  }
}
