import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import DayShift from '@/models/DayShift';
import Station from '@/models/Station';
import SalesEntry from '@/models/SalesEntry';
import PaymentRecord from '@/models/PaymentRecord';
import StockMovement from '@/models/StockMovement';
import MeterReading from '@/models/MeterReading';
import TankStockEntry from '@/models/TankStockEntry';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES, DAY_STATUS } from '@/lib/constants';

// POST /api/day-shifts/[id]/end - End the day
export async function POST(request, { params }) {
  let session = null;

  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (![ROLES.ADMIN, ROLES.MANAGER].includes(currentUser.role)) {
      return NextResponse.json(
        { error: 'Only managers can end the day' },
        { status: 403 }
      );
    }

    const { id } = await params;

    session = await mongoose.startSession();
    session.startTransaction();

    const dayShift = await DayShift.findById(id).session(session);
    if (!dayShift) {
      await session.abortTransaction();
      return NextResponse.json({ error: 'Day shift not found' }, { status: 404 });
    }

    if (currentUser.role === ROLES.MANAGER && currentUser.stationId !== dayShift.stationId.toString()) {
      await session.abortTransaction();
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    if (dayShift.status !== DAY_STATUS.IN_PROGRESS) {
      await session.abortTransaction();
      return NextResponse.json({ error: 'Day is not in progress' }, { status: 400 });
    }

    // Date range for today's shift
    const shiftDate = new Date(dayShift.date);
    const startDate = new Date(shiftDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(shiftDate);
    endDate.setHours(23, 59, 59, 999);

    // Load station and active tanks
    const station = await Station.findById(dayShift.stationId).session(session);
    const activeTanks = (station.tanks || []).filter(t => t.isActive);

    // Validate: all active tanks must have closing stock entries
    const closingEntries = await TankStockEntry.find({
      stationId: dayShift.stationId,
      date: { $gte: startDate, $lte: endDate },
      period: 'closing',
    }).session(session);

    const closingByTankId = {};
    for (const entry of closingEntries) {
      closingByTankId[entry.tankId] = entry;
    }

    const missingTanks = activeTanks.filter(t => !closingByTankId[t._id]);
    if (missingTanks.length > 0) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: `Closing stock not entered for: ${missingTanks.map(t => t.label).join(', ')}` },
        { status: 400 }
      );
    }

    // Pull supervisor meter readings from DB to update dispenser final readings
    const meterReadings = await MeterReading.find({
      stationId: dayShift.stationId,
      date: { $gte: startDate, $lte: endDate },
    }).session(session);

    const readingsByPumpId = {};
    for (const r of meterReadings) {
      readingsByPumpId[r.pumpId] = r;
    }

    for (const assignment of dayShift.dispenserAssignments) {
      const reading = readingsByPumpId[assignment.dispenserId];
      if (reading) {
        assignment.finalReading = reading.closing;
        assignment.totalLiters = Math.max(0, reading.closing - assignment.initialReading - reading.rtt);
      }
    }

    // Calculate totals from existing sales and payment records
    const [salesEntries, paymentRecords] = await Promise.all([
      SalesEntry.find({ dayShiftId: dayShift._id }).session(session),
      PaymentRecord.find({ dayShiftId: dayShift._id }).session(session),
    ]);

    const totalSales = {
      PMS: { liters: 0, amount: 0 },
      AGO: { liters: 0, amount: 0 },
    };
    let totalCollected = 0; // sum of what supervisors actually collected (cash + POS per sale)
    salesEntries.forEach(sale => {
      totalSales[sale.fuelType].liters += sale.liters;
      totalSales[sale.fuelType].amount += sale.expectedAmount;
      totalCollected += (sale.totalAmount || 0);
    });

    // Payment records track what the accountant received from supervisors (separate from discrepancy)
    const totalPayments = {
      cash: paymentRecords.reduce((sum, p) => sum + p.cashReceived, 0),
      pos: paymentRecords.reduce((sum, p) => sum + p.posReceived, 0),
    };

    // Discrepancy = supervisor collections vs expected revenue from liters sold
    const expectedAmount = totalSales.PMS.amount + totalSales.AGO.amount;
    const actualAmount = totalCollected;
    const discrepancy = actualAmount - expectedAmount;

    // Update station.currentStock from manager-measured closing tank entries
    for (const fuelType of ['PMS', 'AGO']) {
      const previousStock = station.currentStock[fuelType];
      const closingTotal = closingEntries
        .filter(e => e.product === fuelType)
        .reduce((sum, e) => sum + e.closingStockMeasured, 0);

      station.currentStock[fuelType] = closingTotal;

      await StockMovement.create([{
        stationId: station._id,
        stationName: station.name,
        date: shiftDate,
        fuelType,
        movementType: 'sale',
        quantity: closingTotal - previousStock,
        previousStock,
        newStock: closingTotal,
        recordedBy: currentUser.id,
        recordedByName: currentUser.name,
        referenceId: dayShift._id,
        notes: `End of day closing stock for ${shiftDate.toISOString().split('T')[0]}`,
      }], { session, ordered: true });
    }

    await station.save({ session });

    // Finalise day shift
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
