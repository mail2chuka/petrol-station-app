import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import PaymentRecord from '@/models/PaymentRecord';
import DayShift from '@/models/DayShift';
import SalesEntry from '@/models/SalesEntry';
import { requireAuth } from '@/lib/auth';
import { paymentRecordSchema } from '@/lib/validation';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES, DAY_STATUS } from '@/lib/constants';

// POST /api/payments - Create a payment record
export async function POST(request) {
  let session = null;

  try {
    const currentUser = await requireAuth();
    await connectDB();

    // Only cashiers can record payments
    if (currentUser.role !== ROLES.CASHIER) {
      return NextResponse.json(
        { error: 'Only cashiers can record payments' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = paymentRecordSchema.parse(body);

    session = await mongoose.startSession();
    session.startTransaction();

    const dayShift = await DayShift.findById(validatedData.dayShiftId).session(session);
    if (!dayShift) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Day shift not found' },
        { status: 404 }
      );
    }

    // A cashier may add a settlement to an ended shift, but may never record
    // a collection against a shift that was not opened.
    if (![DAY_STATUS.IN_PROGRESS, DAY_STATUS.ENDED].includes(dayShift.status)) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Collections can only be recorded for an in-progress or ended shift' },
        { status: 400 }
      );
    }

    // Verify cashier belongs to the same station
    if (currentUser.stationId !== dayShift.stationId.toString()) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Access denied to this station' },
        { status: 403 }
      );
    }

    // Look up the pump (dispenser assignment) to derive supervisor info
    const assignment = dayShift.dispenserAssignments.find(
      d => d.dispenserId === validatedData.dispenserId
    );
    if (!assignment) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Pump not found in day shift' },
        { status: 404 }
      );
    }

    // posEntries: [{ bank, amount, terminalId? }]
    const posEntries = (body.posEntries || [])
      .filter(e => e.bank && Number(e.amount) > 0)
      .map(e => ({ bank: e.bank.trim(), amount: Number(e.amount), terminalId: e.terminalId?.trim() || null }));

    const posReceived = posEntries.reduce((s, e) => s + e.amount, 0);
    const totalReceived = validatedData.cashReceived + posReceived;

    // Do not let a zero-value row be used to satisfy the end-of-shift
    // collection safeguard. The UI already enforces this; the API must too.
    if (totalReceived <= 0) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Enter a cash or POS amount greater than zero.' },
        { status: 400 }
      );
    }

    // Cashiers reconcile the litres/value entered by a supervisor. A payment
    // therefore cannot be attached to an unsold pump or used to enter sales.
    const pumpSales = await SalesEntry.find({
      dayShiftId: dayShift._id,
      dispenserId: validatedData.dispenserId,
    }).session(session);
    if (pumpSales.length === 0) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'No supervisor sale has been recorded for this pump. Only a supervisor can enter litres sold.' },
        { status: 400 }
      );
    }

    const expectedForPump = pumpSales.reduce((sum, sale) => sum + (Number(sale.expectedAmount) || 0), 0);
    const allPayments = await PaymentRecord.find({ dayShiftId: dayShift._id }).session(session);
    const alreadyCollectedForPump = allPayments
      .filter(payment => payment.dispenserId === validatedData.dispenserId)
      .reduce((sum, payment) => sum + (Number(payment.totalReceived) || 0), 0);
    const outstandingAfter = Math.max(0, expectedForPump - alreadyCollectedForPump - totalReceived);

    // If supervisor not yet assigned to this pump (no meter reading submitted yet),
    // fall back to the SalesEntry to get who actually sold on this pump today.
    let supervisorId = assignment.supervisorId;
    let supervisorName = assignment.supervisorName;
    if (!supervisorId) {
      const salesEntry = await SalesEntry.findOne({
        dayShiftId: dayShift._id,
        dispenserId: validatedData.dispenserId,
      }).session(session);
      if (salesEntry) {
        supervisorId = salesEntry.supervisorId;
        supervisorName = salesEntry.supervisorName;
      }
    }

    // Create payment record
    const paymentRecord = await PaymentRecord.create([{
      dayShiftId: dayShift._id,
      stationId: dayShift.stationId,
      stationName: dayShift.stationName,
      date: dayShift.date,
      dispenserId: validatedData.dispenserId,
      dispenserName: assignment.dispenserName,
      fuelType: assignment.fuelType,
      supervisorId,
      supervisorName,
      cashReceived: validatedData.cashReceived,
      posEntries,
      posReceived,
      totalReceived,
      expectedAmount: expectedForPump,
      outstandingAfter,
      collectionType: dayShift.status === DAY_STATUS.ENDED
        ? 'post_close_settlement'
        : alreadyCollectedForPump > 0 ? 'supplemental' : 'initial',
      recordedBy: currentUser.id,
      recordedByName: currentUser.name,
      notes: body.notes || '',
    }], { session, ordered: true });

    // Keep the closed shift's reconciliation summary current when a cashier
    // settles a shortfall on a later day. Records remain append-only for audit.
    const allSales = await SalesEntry.find({ dayShiftId: dayShift._id }).session(session);
    const expectedTotal = allSales.reduce((sum, sale) => sum + (Number(sale.expectedAmount) || 0), 0);
    const priorCash = allPayments.reduce((sum, payment) => sum + (Number(payment.cashReceived) || 0), 0);
    const priorPos = allPayments.reduce((sum, payment) => sum + (Number(payment.posReceived) || 0), 0);
    const actualAmount = priorCash + priorPos + validatedData.cashReceived + posReceived;
    dayShift.totalPayments = { cash: priorCash + validatedData.cashReceived, pos: priorPos + posReceived };
    dayShift.expectedAmount = expectedTotal;
    dayShift.actualAmount = actualAmount;
    dayShift.discrepancy = actualAmount - expectedTotal;
    dayShift.collectionOutstanding = Math.max(0, expectedTotal - actualAmount);
    dayShift.collectionStatus = dayShift.collectionOutstanding > 0 ? 'pending' : 'settled';
    await dayShift.save({ session });

    await session.commitTransaction();

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
        dispenserId: validatedData.dispenserId,
        dispenserName: assignment.dispenserName,
        fuelType: assignment.fuelType,
        supervisorId: assignment.supervisorId,
        supervisorName: assignment.supervisorName,
        cashReceived: validatedData.cashReceived,
        posReceived,
        totalReceived,
        expectedForPump,
        outstandingAfter,
        collectionType: paymentRecord[0].collectionType,
      },
    });

    return NextResponse.json({ paymentRecord: paymentRecord[0] }, { status: 201 });
  } catch (error) {
    if (session) {
      try { await session.abortTransaction(); } catch {}
    }
    console.error('Error creating payment record:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error: ' + error.errors.map(e => e.message).join(', ') },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create payment record' },
      { status: 500 }
    );
  } finally {
    if (session) {
      try { session.endSession(); } catch {}
    }
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
    const date = searchParams.get('date');
    const limit = Math.min(Number(searchParams.get('limit') || 500), 1000);

    let query = {};

    if (dayShiftId) query.dayShiftId = dayShiftId;
    if (stationId) query.stationId = stationId;
    if (supervisorId) query.supervisorId = supervisorId;

    const month = searchParams.get('month'); // YYYY-MM
    if (month) {
      const [y, m] = month.split('-').map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0, 23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    } else if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }

    // Non-admin users without global access can only see their station
    const globalRoles = [ROLES.ADMIN, ROLES.DAILY_AUDITOR, ROLES.EXTERNAL_AUDITOR];
    if (!globalRoles.includes(currentUser.role) && currentUser.stationId) {
      query.stationId = currentUser.stationId;
    }

    const paymentRecords = await PaymentRecord.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);

    return NextResponse.json({ paymentRecords });
  } catch (error) {
    console.error('Error fetching payment records:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch payment records' },
      { status: 500 }
    );
  }
}
