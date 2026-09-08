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
import Attendant from '@/models/Attendant';
import AttendantAssignment from '@/models/AttendantAssignment';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES, DAY_STATUS } from '@/lib/constants';
import { computeShiftMeta } from '@/lib/shifts';

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
    const body = await request.json().catch(() => ({}));
    const { continueToNextShift, attendantAssignments } = body;

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

    // Scope to this specific shift's records, not the whole calendar day —
    // matters once a station runs multiple shifts per day. Pre-deploy docs
    // that predate the dayShiftId field (dayShiftId: null) are also matched,
    // so a shift already in progress when this shipped still ends cleanly.
    const shiftRecordFilter = dayShift.shiftKey && dayShift.shiftKey !== 'default'
      ? { dayShiftId: dayShift._id }
      : { dayShiftId: { $in: [dayShift._id, null] } };

    // Validate: all pumps that have an opening reading must also have a closing reading
    const unclosedReadings = await MeterReading.find({
      stationId: dayShift.stationId,
      date: { $gte: startDate, $lte: endDate },
      ...shiftRecordFilter,
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
      ...shiftRecordFilter,
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
      ...shiftRecordFilter,
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

    // Check: every pump with sales must have a positive cashier collection.
    // Amount mismatches are allowed — they are captured in the day summary for reporting.
    const missingPayments = [];
    for (const [did, info] of Object.entries(salesByDispenser)) {
      const collected = paymentsByDispenser[did] ?? 0;
      if (collected === 0) {
        missingPayments.push(info.label);
      }
    }

    if (missingPayments.length > 0) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: `Collection not recorded for: ${missingPayments.join(', ')}. The day cannot be ended until every pump with recorded sales has an initial collection.` },
        { status: 400 }
      );
    }

    // Build totalSales dynamically — supports PMS, AGO, DPK, LPG etc.
    const totalSales = {};
    salesEntries.forEach(sale => {
      if (!totalSales[sale.fuelType]) totalSales[sale.fuelType] = { liters: 0, amount: 0 };
      totalSales[sale.fuelType].liters += sale.liters;
      totalSales[sale.fuelType].amount += sale.expectedAmount;
    });

    const totalPayments = {
      cash: paymentRecords.reduce((sum, p) => sum + p.cashReceived, 0),
      pos: paymentRecords.reduce((sum, p) => sum + p.posReceived, 0),
    };

    const expectedAmount = Object.values(totalSales).reduce((s, v) => s + v.amount, 0);
    // actualAmount = total cash + POS collected by cashier (SalesEntry.totalAmount is never populated)
    const actualAmount = totalPayments.cash + totalPayments.pos;
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
    dayShift.collectionOutstanding = Math.max(0, expectedAmount - actualAmount);
    dayShift.collectionStatus = dayShift.collectionOutstanding > 0 ? 'pending' : 'settled';

    // If this isn't the last planned shift, either continue into the next
    // shift (carrying forward closing data as its opening) or recalibrate
    // the plan down to what actually happened today.
    let nextShift = null;
    const isFinalShift = dayShift.shiftOrder >= (dayShift.totalShiftsPlanned || 1);
    if (!isFinalShift) {
      if (continueToNextShift) {
        // Re-snapshot current prices — same requirement as Begin Day.
        const nextPrices = {};
        for (const fuelType of availableProducts) {
          const val = Number(station.currentPrices?.get?.(fuelType) ?? station.currentPrices?.[fuelType] ?? 0);
          if (!val || val <= 0) {
            await session.abortTransaction();
            return NextResponse.json(
              { error: `No price set for ${fuelType}. Ask admin to set prices before starting the next shift.` },
              { status: 400 }
            );
          }
          nextPrices[fuelType] = val;
        }

        const nextOrder = dayShift.shiftOrder + 1;
        const nextMeta = computeShiftMeta(nextOrder, dayShift.totalShiftsPlanned);
        const nextDispenserAssignments = dayShift.dispenserAssignments.map((a) => ({
          dispenserId: a.dispenserId,
          dispenserName: a.dispenserName,
          fuelType: a.fuelType,
          tankId: a.tankId,
          tankLabel: a.tankLabel,
          supervisorId: null,
          supervisorName: '',
          initialReading: 0,
          totalLiters: 0,
        }));

        const [created] = await DayShift.create([{
          stationId: dayShift.stationId,
          stationName: dayShift.stationName,
          date: dayShift.date,
          status: DAY_STATUS.IN_PROGRESS,
          shiftKey: nextMeta.key,
          shiftLabel: nextMeta.label,
          shiftOrder: nextOrder,
          totalShiftsPlanned: dayShift.totalShiftsPlanned,
          startedBy: currentUser.id,
          startedByName: currentUser.name,
          startTime: new Date(),
          dispenserAssignments: nextDispenserAssignments,
          pricesAtStart: nextPrices,
        }], { session, ordered: true });
        nextShift = created;

        // Carry forward this shift's closing tank stock as the next shift's
        // opening — sourced directly from closingEntries already loaded above,
        // no extra lookup needed (mirrors begin/route.js's carry-forward).
        for (const tank of activeTanks) {
          const closingEntry = closingByTankId[tank._id];
          const openingValue = closingEntry
            ? (closingEntry.closingStockManager ?? closingEntry.closingStockMeasured ?? 0)
            : 0;
          await TankStockEntry.create([{
            stationId: dayShift.stationId,
            stationName: dayShift.stationName,
            tankId: tank._id,
            tankLabel: tank.label,
            product: tank.product,
            date: startDate,
            period: 'opening',
            dayShiftId: nextShift._id,
            openingStock: openingValue,
            closingStockMeasured: openingValue,
            supervisorId: currentUser.id,
            supervisorName: currentUser.name,
            variance: 0,
            variancePercent: 0,
            notes: `Carried forward from ${dayShift.shiftLabel}`,
          }], { session, ordered: true });
        }

        // Attendant assignments for the new shift — recycle or reassign, per pump.
        for (const entry of (attendantAssignments || [])) {
          if (!entry?.dispenserId || !entry?.attendantId) continue;
          const attendant = await Attendant.findById(entry.attendantId).session(session);
          if (!attendant) continue;
          const assignment = dayShift.dispenserAssignments.find((a) => a.dispenserId === entry.dispenserId);
          await AttendantAssignment.create([{
            stationId: dayShift.stationId.toString(),
            date: dateStr,
            dayShiftId: nextShift._id,
            dispenserId: entry.dispenserId,
            dispenserName: assignment?.dispenserName || '',
            fuelType: assignment?.fuelType || '',
            attendantId: attendant._id,
            attendantStaffNumber: attendant.staffNumber,
            attendantName: attendant.name,
            assignedAt: new Date(),
            assignedByManagerId: currentUser.id,
            assignedByManagerName: currentUser.name,
          }], { session, ordered: true });
        }
      } else {
        // Manager confirmed this was actually the final shift — recalibrate
        // the plan down instead of leaving a phantom shift that never begins.
        dayShift.totalShiftsPlanned = dayShift.shiftOrder;
      }
    }

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
        nextShiftId: nextShift?._id?.toString(),
      },
    });

    return NextResponse.json({
      dayShift,
      nextShift,
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
