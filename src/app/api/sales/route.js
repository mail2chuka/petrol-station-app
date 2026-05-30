import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import SalesEntry from '@/models/SalesEntry';
import DayShift from '@/models/DayShift';
import PriceHistory from '@/models/PriceHistory';
import { requireAuth } from '@/lib/auth';
import { salesEntrySchema } from '@/lib/validation';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES, DAY_STATUS } from '@/lib/constants';
import { autoCloseExpiredInProgressShifts } from '@/lib/dayShiftLifecycle';

// POST /api/sales - Create a sales entry
export async function POST(request) {
  let session = null;

  try {
    const currentUser = await requireAuth();
    await connectDB();

    // Only supervisors can record sales
    if (currentUser.role !== ROLES.SUPERVISOR) {
      return NextResponse.json(
        { error: 'Only supervisors can record sales' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = salesEntrySchema.parse(body);

    session = await mongoose.startSession();
    session.startTransaction();

    let dayShift = await DayShift.findById(validatedData.dayShiftId).session(session);
    if (!dayShift) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Day shift not found' },
        { status: 404 }
      );
    }

    await autoCloseExpiredInProgressShifts({ stationId: dayShift.stationId, session });
    dayShift = await DayShift.findById(validatedData.dayShiftId).session(session);

    if (dayShift.status !== DAY_STATUS.IN_PROGRESS) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Day is not in progress' },
        { status: 400 }
      );
    }

    const assignment = dayShift.dispenserAssignments.find(
      d => d.dispenserId === validatedData.dispenserId
    );

    if (!assignment) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Dispenser not found in day shift' },
        { status: 404 }
      );
    }

    // Fallback to day-start price when no approved intra-day change exists.
    const effectiveApprovedPrice = await PriceHistory.findOne({
      stationId: dayShift.stationId,
      fuelType: assignment.fuelType,
      approvalStatus: 'approved',
      effectiveDate: { $lte: new Date() },
    })
      .sort({ effectiveDate: -1, createdAt: -1 })
      .session(session);

    const startPrice = dayShift.pricesAtStart instanceof Map
      ? dayShift.pricesAtStart.get(assignment.fuelType)
      : dayShift.pricesAtStart?.[assignment.fuelType];
    const pricePerLiter = effectiveApprovedPrice?.newPrice ?? startPrice ?? 0;
    const expectedAmount = validatedData.liters * pricePerLiter;
    const totalAmount = validatedData.cashAmount + validatedData.posAmount;
    const discrepancy = totalAmount - expectedAmount;

    // Upsert: one entry per supervisor+dispenser+dayShift
    const salesEntry = await SalesEntry.findOneAndUpdate(
      {
        dayShiftId: dayShift._id,
        dispenserId: validatedData.dispenserId,
        supervisorId: currentUser.id,
      },
      {
        dayShiftId: dayShift._id,
        stationId: dayShift.stationId,
        stationName: dayShift.stationName,
        date: dayShift.date,
        supervisorId: currentUser.id,
        supervisorName: currentUser.name,
        dispenserId: validatedData.dispenserId,
        dispenserName: assignment.dispenserName,
        fuelType: assignment.fuelType,
        liters: validatedData.liters,
        pricePerLiter,
        expectedAmount,
        cashAmount: validatedData.cashAmount,
        posAmount: validatedData.posAmount,
        totalAmount,
        discrepancy,
        enteredBy: currentUser.id,
        enteredByName: currentUser.name,
      },
      { new: true, upsert: true, runValidators: true, session }
    );

    await session.commitTransaction();

    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.RECORD_SALE,
      resource: AUDIT_RESOURCES.SALES_ENTRY,
      resourceId: salesEntry._id.toString(),
      stationId: dayShift.stationId,
      stationName: dayShift.stationName,
      details: {
        dispenserId: validatedData.dispenserId,
        fuelType: assignment.fuelType,
        liters: validatedData.liters,
        expectedAmount,
        totalAmount,
        discrepancy,
      },
    });

    return NextResponse.json({ salesEntry }, { status: 201 });
  } catch (error) {
    if (session) {
      try { await session.abortTransaction(); } catch {}
    }
    console.error('Error creating sales entry:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error: ' + error.errors.map(e => e.message).join(', ') },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create sales entry' },
      { status: 500 }
    );
  } finally {
    if (session) {
      try { session.endSession(); } catch {}
    }
  }
}

// GET /api/sales - Get sales entries
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const dayShiftId = searchParams.get('dayShiftId');
    const stationId = searchParams.get('stationId');
    const supervisorId = searchParams.get('supervisorId');

    let query = {};

    if (dayShiftId) {
      query.dayShiftId = dayShiftId;
    }

    if (stationId) {
      query.stationId = stationId;
    }

    if (supervisorId) {
      query.supervisorId = supervisorId;
    }

    // Supervisors can only see their own sales
    if (currentUser.role === ROLES.SUPERVISOR) {
      query.supervisorId = currentUser.id;
    }

    // Non-admin users can only see their station
    if (currentUser.role !== ROLES.ADMIN && currentUser.stationId) {
      query.stationId = currentUser.stationId;
    }

    const salesEntries = await SalesEntry.find(query)
      .sort({ createdAt: -1 })
      .limit(100);

    return NextResponse.json({ salesEntries });
  } catch (error) {
    console.error('Error fetching sales entries:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch sales entries' },
      { status: 500 }
    );
  }
}
