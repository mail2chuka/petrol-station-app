import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import DayShift from '@/models/DayShift';
import Station from '@/models/Station';
import User from '@/models/User';
import { requireAuth } from '@/lib/auth';
import { beginDaySchema } from '@/lib/validation';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES, DAY_STATUS } from '@/lib/constants';

// POST /api/day-shifts/begin - Begin a new day
export async function POST(request) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const currentUser = await requireAuth();
    await connectDB();

    // Only managers can begin a day
    if (![ROLES.ADMIN, ROLES.MANAGER].includes(currentUser.role)) {
      return NextResponse.json(
        { error: 'Only managers can begin the day' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = beginDaySchema.parse(body);

    // Managers can only manage their own station
    if (currentUser.role === ROLES.MANAGER && currentUser.stationId !== validatedData.stationId) {
      return NextResponse.json(
        { error: 'Access denied to this station' },
        { status: 403 }
      );
    }

    const station = await Station.findById(validatedData.stationId).session(session);
    if (!station) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Station not found' },
        { status: 404 }
      );
    }

    // Check if there's already an active day
    const existingActiveDay = await DayShift.findOne({
      stationId: validatedData.stationId,
      status: DAY_STATUS.IN_PROGRESS,
    }).session(session);

    if (existingActiveDay) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'There is already an active day. Please end it first.' },
        { status: 400 }
      );
    }

    // Validate dispensers and get attendant names
    const dispenserAssignments = [];
    for (const assignment of validatedData.dispensers) {
      const dispenser = station.dispensers.find(
        d => d.dispenserId === assignment.dispenserId && d.isActive
      );

      if (!dispenser) {
        await session.abortTransaction();
        return NextResponse.json(
          { error: `Dispenser ${assignment.dispenserId} not found or inactive` },
          { status: 400 }
        );
      }

      const attendant = await User.findById(assignment.attendantId).session(session);
      if (!attendant || attendant.role !== ROLES.ATTENDANT || !attendant.isActive) {
        await session.abortTransaction();
        return NextResponse.json(
          { error: `Invalid attendant for dispenser ${assignment.dispenserId}` },
          { status: 400 }
        );
      }

      dispenserAssignments.push({
        dispenserId: assignment.dispenserId,
        dispenserName: dispenser.name,
        fuelType: dispenser.fuelType,
        attendantId: assignment.attendantId,
        attendantName: attendant.name,
        initialReading: assignment.initialReading,
        totalLiters: 0,
      });
    }

    // Create day shift
    const dayShift = await DayShift.create([{
      stationId: validatedData.stationId,
      stationName: station.name,
      date: new Date(validatedData.date),
      status: DAY_STATUS.IN_PROGRESS,
      startedBy: currentUser.id,
      startedByName: currentUser.name,
      startTime: new Date(),
      dispenserAssignments,
      pricesAtStart: {
        PMS: station.currentPrices.PMS,
        AGO: station.currentPrices.AGO,
      },
    }], { session });

    // Create audit log
    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.BEGIN_DAY,
      resource: AUDIT_RESOURCES.DAY_SHIFT,
      resourceId: dayShift[0]._id.toString(),
      stationId: station._id,
      stationName: station.name,
      details: {
        date: validatedData.date,
        dispenserCount: dispenserAssignments.length,
      },
    });

    await session.commitTransaction();

    return NextResponse.json({ dayShift: dayShift[0] }, { status: 201 });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error beginning day:', error);
    
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to begin day' },
      { status: 500 }
    );
  } finally {
    session.endSession();
  }
}
