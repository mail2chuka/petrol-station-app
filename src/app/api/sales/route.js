import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import SalesEntry from '@/models/SalesEntry';
import DayShift from '@/models/DayShift';
import { requireAuth } from '@/lib/auth';
import { salesEntrySchema } from '@/lib/validation';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES, DAY_STATUS } from '@/lib/constants';

// POST /api/sales - Create a sales entry
export async function POST(request) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const currentUser = await requireAuth();
    await connectDB();

    // Only attendants can record sales
    if (currentUser.role !== ROLES.ATTENDANT) {
      return NextResponse.json(
        { error: 'Only attendants can record sales' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = salesEntrySchema.parse(body);

    const dayShift = await DayShift.findById(validatedData.dayShiftId).session(session);
    if (!dayShift) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Day shift not found' },
        { status: 404 }
      );
    }

    if (dayShift.status !== DAY_STATUS.IN_PROGRESS) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Day is not in progress' },
        { status: 400 }
      );
    }

    // Find the dispenser assignment
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

    // Verify attendant is assigned to this dispenser
    if (assignment.attendantId.toString() !== currentUser.id) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'You are not assigned to this dispenser' },
        { status: 403 }
      );
    }

    // Calculate expected amount
    const pricePerLiter = dayShift.pricesAtStart[assignment.fuelType];
    const expectedAmount = validatedData.liters * pricePerLiter;
    const totalAmount = validatedData.cashAmount + validatedData.posAmount;
    const discrepancy = totalAmount - expectedAmount;

    // Create sales entry
    const salesEntry = await SalesEntry.create([{
      dayShiftId: dayShift._id,
      stationId: dayShift.stationId,
      stationName: dayShift.stationName,
      date: dayShift.date,
      attendantId: currentUser.id,
      attendantName: currentUser.name,
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
    }], { session });

    // Create audit log
    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.RECORD_SALE,
      resource: AUDIT_RESOURCES.SALES_ENTRY,
      resourceId: salesEntry[0]._id.toString(),
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

    await session.commitTransaction();

    return NextResponse.json({ salesEntry: salesEntry[0] }, { status: 201 });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error creating sales entry:', error);
    
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to create sales entry' },
      { status: 500 }
    );
  } finally {
    session.endSession();
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
    const attendantId = searchParams.get('attendantId');

    let query = {};

    if (dayShiftId) {
      query.dayShiftId = dayShiftId;
    }

    if (stationId) {
      query.stationId = stationId;
    }

    if (attendantId) {
      query.attendantId = attendantId;
    }

    // Attendants can only see their own sales
    if (currentUser.role === ROLES.ATTENDANT) {
      query.attendantId = currentUser.id;
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
