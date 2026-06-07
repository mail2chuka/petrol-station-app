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

    // Date range for today's shift — use UTC boundaries to avoid timezone mismatches
    const shiftDate = new Date(dayShift.date);
    const dateStr = shiftDate.toISOString().split('T')[0];
    const startDate = new Date(dateStr + 'T00:00:00.000Z');
    const endDate = new Date(dateStr + 'T23:59:59.999Z');

    // Validate: all pumps that have an opening reading must also have a closing reading
    const unclosedReadings = await MeterReading.find({
      stationId: dayShift.stationId,
      date: { $gte: startDate, $lte: endDate },
      opening: { $ne: null },
      closing: null,
    }).session(session);

    if (unclosedReadings.length > 0) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: `Closing reading not entered for: ${unclosedReadings.map(r => r.pumpLabel || r.pumpId).join(', ')}. All opened pumps must have a closing reading before the day can end.` },
        { status: 400 }
      );
    }

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
      if (reading && reading.closing != null) {
        assignment.finalReading = reading.closing;
        // Use reading.opening (what supervisor entered) — NOT initialReading (always 0 now)
        const openingForCalc = reading.opening ?? 0;
        const rtt = reading.rtt ?? 0;
        assignment.totalLiters = Math.max(0, reading.closing - openingForCalc - rtt);
      }
    }

    // Validate: cashier must have collected from every supervisor who made sales,
    // and the total collected must match the total expected sales amount.
    const [salesEntries, paymentRecords] = await Promise.all([
      SalesEntry.find({ dayShiftId: dayShift._id }).session(session),
      PaymentRecord.find({ dayShiftId: dayShift._id }).session(session),
    ]);

    // Reconcile by dispenserId (always set, never null).
    // Use expectedAmount (liters × price) — totalAmount is 0 because supervisors
    // only enter liters; the cashier records cash/POS separately.
    const salesByDispenser = {};
    for (const sale of salesEntries) {
      const did = sale.dispenserId;
      if (!salesByDispenser[did]) {
        salesByDispenser[did] = {
          label: `${sale.dispenserName || did} / ${sale.supervisorName || 'unknown supervisor'}`,
          expectedTotal: 0,
        };
      }
      salesByDispenser[did].expectedTotal += sale.expectedAmount || 0;
    }

    const paymentsByDispenser = {};
    for (const p of paymentRecords) {
      const did = p.dispenserId;
      if (!paymentsByDispenser[did]) paymentsByDispenser[did] = 0;
      paymentsByDispenser[did] += p.totalReceived || 0;
    }

    // Check: every pump with sales must have a cashier payment collection
    const missingPayments = [];
    const mismatchedPayments = [];
    for (const [did, info] of Object.entries(salesByDispenser)) {
      const collected = paymentsByDispenser[did] ?? 0;
      if (collected === 0) {
        missingPayments.push(info.label);
      } else if (Math.abs(collected - info.expectedTotal) > 0.01) {
        mismatchedPayments.push(
          `${info.label}: expected ₦${info.expectedTotal.toLocaleString('en-NG', { minimumFractionDigits: 2 })} but collected ₦${collected.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
        );
      }
    }

    if (missingPayments.length > 0) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: `Cashier has not recorded payment collection from: ${missingPayments.join(', ')}. The day cannot be ended until all supervisor payments are collected.` },
        { status: 400 }
      );
    }

    if (mismatchedPayments.length > 0) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: `Payment collected does not match supervisor sales:\n${mismatchedPayments.join('\n')}\nResolve the discrepancy before ending the day.` },
        { status: 400 }
      );
    }

    // Build totalSales dynamically — supports PMS, AGO, DPK, LPG etc.
    const totalSales = {};
    let totalCollected = 0;
    salesEntries.forEach(sale => {
      if (!totalSales[sale.fuelType]) totalSales[sale.fuelType] = { liters: 0, amount: 0 };
      totalSales[sale.fuelType].liters += sale.liters;
      totalSales[sale.fuelType].amount += sale.expectedAmount;
      totalCollected += (sale.totalAmount || 0);
    });

    const totalPayments = {
      cash: paymentRecords.reduce((sum, p) => sum + p.cashReceived, 0),
      pos: paymentRecords.reduce((sum, p) => sum + p.posReceived, 0),
    };

    const expectedAmount = Object.values(totalSales).reduce((s, v) => s + v.amount, 0);
    const actualAmount = totalCollected;
    const discrepancy = actualAmount - expectedAmount;

    // Update station.currentStock from manager-measured closing tank entries
    // currentStock is a Map — use .get()/.set()
    const availableProducts = station.availableProducts?.length
      ? station.availableProducts
      : ['PMS', 'AGO'];

    if (!(station.currentStock instanceof Map)) {
      station.currentStock = new Map(Object.entries(station.currentStock || {}));
    }

    for (const fuelType of availableProducts) {
      const previousStock = station.currentStock.get(fuelType) ?? 0;
      const closingTotal = closingEntries
        .filter(e => e.product === fuelType)
        .reduce((sum, e) => sum + e.closingStockMeasured, 0);

      station.currentStock.set(fuelType, closingTotal);
      station.markModified('currentStock');

      if (closingEntries.some(e => e.product === fuelType)) {
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
