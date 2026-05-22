import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import PaymentRecord from '@/models/PaymentRecord';
import DayShift from '@/models/DayShift';
import User from '@/models/User';
import { requireAuth } from '@/lib/auth';
import { paymentRecordSchema } from '@/lib/validation';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES, DAY_STATUS } from '@/lib/constants';
import { autoCloseExpiredInProgressShifts } from '@/lib/dayShiftLifecycle';

// POST /api/payments - Create a payment record
export async function POST(request) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const currentUser = await requireAuth();
    await connectDB();

    // Only accountants can record payments
    if (currentUser.role !== ROLES.ACCOUNTANT) {
      return NextResponse.json(
        { error: 'Only accountants can record payments' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = paymentRecordSchema.parse(body);

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

    // Verify accountant belongs to the same station
    if (currentUser.stationId !== dayShift.stationId.toString()) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Access denied to this station' },
        { status: 403 }
      );
    }

    // Get supervisor name
    const supervisor = await User.findById(validatedData.supervisorId).session(session);
    if (!supervisor) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Supervisor not found' },
        { status: 404 }
      );
    }

    const totalReceived = validatedData.cashReceived + validatedData.posReceived;

    // Create payment record
    const paymentRecord = await PaymentRecord.create([{
      dayShiftId: dayShift._id,
      stationId: dayShift.stationId,
      stationName: dayShift.stationName,
      date: dayShift.date,
      supervisorId: validatedData.supervisorId,
      supervisorName: supervisor.name,
      cashReceived: validatedData.cashReceived,
      posReceived: validatedData.posReceived,
      totalReceived,
      recordedBy: currentUser.id,
      recordedByName: currentUser.name,
      notes: body.notes || '',
    }], { session, ordered: true });

    // Create audit log
    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.RECORD_PAYMENT,
      resource: AUDIT_RESOURCES.PAYMENT_RECORD,
      resourceId: paymentRecord[0]._id.toString(),
      stationId: dayShift.stationId,
      stationName: dayShift.stationName,
      details: {
        supervisorId: validatedData.supervisorId,
        supervisorName: supervisor.name,
        cashReceived: validatedData.cashReceived,
        posReceived: validatedData.posReceived,
        totalReceived,
      },
    });

    await session.commitTransaction();

    return NextResponse.json({ paymentRecord: paymentRecord[0] }, { status: 201 });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error creating payment record:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create payment record' },
      { status: 500 }
    );
  } finally {
    session.endSession();
  }
}

// GET /api/payments - Get payment records
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

    // Non-admin users can only see their station
    if (currentUser.role !== ROLES.ADMIN && currentUser.stationId) {
      query.stationId = currentUser.stationId;
    }

    const paymentRecords = await PaymentRecord.find(query)
      .sort({ createdAt: -1 })
      .limit(100);

    return NextResponse.json({ paymentRecords });
  } catch (error) {
    console.error('Error fetching payment records:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch payment records' },
      { status: 500 }
    );
  }
}
