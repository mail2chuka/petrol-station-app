import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import DayShift from '@/models/DayShift';
import Station from '@/models/Station';
import SalesEntry from '@/models/SalesEntry';
import PaymentRecord from '@/models/PaymentRecord';
import StockMovement from '@/models/StockMovement';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES, DAY_STATUS } from '@/lib/constants';

// POST /api/day-shifts/[id]/end - End the day
export async function POST(request, { params }) {
  let session = null;

  try {
    const currentUser = await requireAuth();
    await connectDB();

    // Only managers can end a day
    if (![ROLES.ADMIN, ROLES.MANAGER].includes(currentUser.role)) {
      return NextResponse.json(
        { error: 'Only managers can end the day' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { finalReadings } = body; // Array of { dispenserId, finalReading }

    session = await mongoose.startSession();
    session.startTransaction();

    const dayShift = await DayShift.findById(params.id).session(session);
    if (!dayShift) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Day shift not found' },
        { status: 404 }
      );
    }

    // Managers can only manage their own station
    if (currentUser.role === ROLES.MANAGER && currentUser.stationId !== dayShift.stationId.toString()) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Access denied to this station' },
        { status: 403 }
      );
    }

    if (dayShift.status !== DAY_STATUS.IN_PROGRESS) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Day is not in progress' },
        { status: 400 }
      );
    }

    // Get sales and payment data
    const salesEntries = await SalesEntry.find({ 
      dayShiftId: dayShift._id 
    }).session(session);

    const paymentRecords = await PaymentRecord.find({ 
      dayShiftId: dayShift._id 
    }).session(session);

    // Calculate totals
    const totalSales = {
      PMS: { liters: 0, amount: 0 },
      AGO: { liters: 0, amount: 0 },
    };

    salesEntries.forEach(sale => {
      totalSales[sale.fuelType].liters += sale.liters;
      totalSales[sale.fuelType].amount += sale.expectedAmount;
    });

    const totalPayments = {
      cash: paymentRecords.reduce((sum, p) => sum + p.cashReceived, 0),
      pos: paymentRecords.reduce((sum, p) => sum + p.posReceived, 0),
    };

    const expectedAmount = totalSales.PMS.amount + totalSales.AGO.amount;
    const actualAmount = totalPayments.cash + totalPayments.pos;
    const discrepancy = actualAmount - expectedAmount;

    // Update dispenser final readings
    if (finalReadings && Array.isArray(finalReadings)) {
      for (const reading of finalReadings) {
        const assignment = dayShift.dispenserAssignments.find(
          d => d.dispenserId === reading.dispenserId
        );
        if (assignment) {
          assignment.finalReading = reading.finalReading;
          assignment.totalLiters = reading.finalReading - assignment.initialReading;
        }
      }
    }

    // Update day shift
    dayShift.status = DAY_STATUS.ENDED;
    dayShift.endedBy = currentUser.id;
    dayShift.endedByName = currentUser.name;
    dayShift.endTime = new Date();
    dayShift.totalSales = totalSales;
    dayShift.totalPayments = totalPayments;
    dayShift.expectedAmount = expectedAmount;
    dayShift.actualAmount = actualAmount;
    dayShift.discrepancy = discrepancy;

    await dayShift.save({ session });

    // Update station stock (deduct sales with tolerance)
    const station = await Station.findById(dayShift.stationId).session(session);
    const tolerancePercent = Number(station.tolerancePercent ?? 2.5);
    const toleranceFactor = Math.max(0, 1 - tolerancePercent / 100);
    
    for (const fuelType of ['PMS', 'AGO']) {
      if (totalSales[fuelType].liters > 0) {
        const previousStock = station.currentStock[fuelType];
        const effectiveLiters = totalSales[fuelType].liters * toleranceFactor;
        const newStock = previousStock - effectiveLiters;
        
        station.currentStock[fuelType] = Math.max(0, newStock);
        
        // Record stock movement
        await StockMovement.create([{
          stationId: station._id,
          stationName: station.name,
          date: dayShift.date,
          fuelType,
          movementType: 'sale',
          quantity: -effectiveLiters,
          previousStock,
          newStock: station.currentStock[fuelType],
          recordedBy: currentUser.id,
          recordedByName: currentUser.name,
          referenceId: dayShift._id,
          notes: `Sales for ${dayShift.date.toISOString().split('T')[0]} (tolerance ${tolerancePercent}%)`,
        }], { session, ordered: true });
      }
    }

    await station.save({ session });

    await session.commitTransaction();

    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.END_DAY,
      resource: AUDIT_RESOURCES.DAY_SHIFT,
      resourceId: dayShift._id.toString(),
      stationId: dayShift.stationId,
      stationName: dayShift.stationName,
      details: {
        date: dayShift.date,
        totalSales,
        totalPayments,
        expectedAmount,
        actualAmount,
        discrepancy,
      },
    });

    return NextResponse.json({
      dayShift,
      summary: {
        totalSales,
        totalPayments,
        expectedAmount,
        actualAmount,
        discrepancy,
      },
    });
  } catch (error) {
    if (session) {
      try { await session.abortTransaction(); } catch {}
    }
    console.error('Error ending day:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to end day' },
      { status: 500 }
    );
  } finally {
    if (session) {
      try { session.endSession(); } catch {}
    }
  }
}
