import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import Station from '@/models/Station';
import DayShift from '@/models/DayShift';
import MeterReading from '@/models/MeterReading';
import TankStockEntry from '@/models/TankStockEntry';
import StockMovement from '@/models/StockMovement';
import SalesEntry from '@/models/SalesEntry';
import PaymentRecord from '@/models/PaymentRecord';
import CashDeposit from '@/models/CashDeposit';
import { requireAuth } from '@/lib/auth';
import { ROLES, DAY_STATUS } from '@/lib/constants';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';

const BACKFILL_PIN = '@ghty^&AHATY';

function verifyPin(pin) {
  return pin === BACKFILL_PIN;
}

// GET /api/admin/backfill?stationId=&date=
// Returns all existing records for a station+date (admin only, no PIN needed for reads)
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    if (currentUser.role !== ROLES.ADMIN) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
    }
    await connectDB();
    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const date = searchParams.get('date');
    const shiftKey = searchParams.get('shiftKey') || 'default';
    if (!stationId || !date) {
      return NextResponse.json({ error: 'stationId and date are required.' }, { status: 400 });
    }
    const dateStart = new Date(date + 'T00:00:00.000Z');
    const dateEnd = new Date(date + 'T23:59:59.999Z');
    const stationObjId = new mongoose.Types.ObjectId(stationId);

    // List every shift already recorded for this date (for the shift picker),
    // and the specific shift matching shiftKey (legacy docs with no shiftKey
    // are treated as 'default' so pre-multi-shift backfilled days still load).
    const allShiftsForDate = await DayShift.find({ stationId: stationObjId, date: { $gte: dateStart, $lte: dateEnd } }).lean();
    const dayShift = allShiftsForDate.find((s) => (s.shiftKey || 'default') === shiftKey) || null;
    const shiftFilter = dayShift
      ? { dayShiftId: { $in: [dayShift._id, null] } }
      : {};

    const [meterReadings, tankStockEntries, stockMovements, salesEntries, paymentRecords, cashDeposits] =
      await Promise.all([
        MeterReading.find({ stationId: stationObjId, date: { $gte: dateStart, $lte: dateEnd }, ...shiftFilter }).lean(),
        TankStockEntry.find({ stationId: stationObjId, date: { $gte: dateStart, $lte: dateEnd }, ...shiftFilter }).lean(),
        StockMovement.find({ stationId: stationObjId, date: { $gte: dateStart, $lte: dateEnd }, movementType: 'receipt' }).lean(),
        dayShift
          ? SalesEntry.find({ stationId: stationObjId, dayShiftId: dayShift._id }).lean()
          : Promise.resolve([]),
        dayShift
          ? PaymentRecord.find({ stationId: stationObjId, dayShiftId: dayShift._id }).lean()
          : Promise.resolve([]),
        CashDeposit.find({ stationId: stationObjId, forDate: { $gte: dateStart, $lte: dateEnd } }).lean(),
      ]);

    return NextResponse.json({
      dayShift,
      shiftsForDate: allShiftsForDate.map((s) => ({ shiftKey: s.shiftKey || 'default', shiftLabel: s.shiftLabel || 'Full Day', shiftOrder: s.shiftOrder || 1 })),
      meterReadings, tankStockEntries, stockMovements, salesEntries, paymentRecords, cashDeposits,
    });
  } catch (error) {
    console.error('Backfill GET error:', error);
    return NextResponse.json({ error: error.message || 'Failed to load existing data.' }, { status: 500 });
  }
}

// POST /api/admin/backfill
// Body: { pin, type, stationId, date, ...typeSpecificFields }
// Types: dayShift | pumpReading | tankReading | tankDelivery | sale | payment | bankDeposit
export async function POST(request) {
  try {
    const currentUser = await requireAuth();
    if (currentUser.role !== ROLES.ADMIN) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
    }

    await connectDB();
    const body = await request.json();
    const { pin, type, stationId, date, shiftKey: rawShiftKey, shiftLabel: rawShiftLabel } = body;
    const shiftKey = rawShiftKey || 'default';
    const shiftLabel = rawShiftLabel || (shiftKey === 'default' ? 'Full Day' : shiftKey);

    if (!verifyPin(pin)) {
      return NextResponse.json({ error: 'Invalid backfill PIN.' }, { status: 401 });
    }
    // PIN ping — used by the UI just to verify the PIN is correct
    if (type === '__ping__') {
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    if (!type || !stationId || !date) {
      return NextResponse.json({ error: 'type, stationId, and date are required.' }, { status: 400 });
    }

    // Backfill is for historical days only — never the present or a future day.
    // Today's live operations run through the normal begin/close flow.
    const todayStart = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z');
    if (new Date(date + 'T00:00:00.000Z') >= todayStart) {
      return NextResponse.json(
        { error: 'Cannot backfill the current or a future day. Backfill is for past dates only.' },
        { status: 400 }
      );
    }

    const station = await Station.findById(stationId).lean();
    if (!station) {
      return NextResponse.json({ error: 'Station not found.' }, { status: 404 });
    }

    const dateStart = new Date(date + 'T00:00:00.000Z');
    const dateEnd = new Date(date + 'T23:59:59.999Z');
    const stationObjId = new mongoose.Types.ObjectId(stationId);

    // ── DAY SHIFT ──────────────────────────────────────────────────────────────
    if (type === 'dayShift') {
      const { dispenserIds, prices, tolerancePercent } = body;
      const toleranceVal =
        tolerancePercent !== undefined && tolerancePercent !== null && tolerancePercent !== ''
          ? Number(tolerancePercent)
          : null;
      const dispensers = station.dispensers || [];
      const selectedDispensers = dispenserIds
        ? dispensers.filter((d) => dispenserIds.includes(d.dispenserId))
        : dispensers;

      const dispenserAssignments = selectedDispensers.map((d) => ({
        dispenserId: d.dispenserId,
        dispenserName: d.name,
        fuelType: d.fuelType,
        tankId: d.tankId || null,
        tankLabel: '',
        supervisorId: null,
        supervisorName: '',
        initialReading: 0,
        totalLiters: 0,
      }));

      const pricesAtStart = new Map();
      if (prices && typeof prices === 'object') {
        for (const [k, v] of Object.entries(prices)) {
          pricesAtStart.set(k, Number(v));
        }
      } else {
        // Fall back to station's current prices
        for (const [k, v] of (station.currentPrices || new Map())) {
          pricesAtStart.set(k, v);
        }
      }

      // Editable data only — never the shift's identity or lifecycle timestamps.
      const editableData = {
        dispenserAssignments,
        pricesAtStart,
        ...(toleranceVal !== null && Number.isFinite(toleranceVal)
          ? { tolerancePercent: toleranceVal }
          : {}),
      };

      // Legacy docs with no shiftKey are treated as 'default' so pre-multi-shift
      // backfilled days keep matching without needing a data migration.
      const existingForDate = await DayShift.find({
        stationId: stationObjId,
        date: { $gte: dateStart, $lte: dateEnd },
      });
      const existing = existingForDate.find((s) => (s.shiftKey || 'default') === shiftKey) || null;

      if (existing) {
        // Day already has this shift: keep its _id, startTime, endTime, status and
        // started/ended-by. Only update the other data — do not re-stamp times.
        const shift = await DayShift.findByIdAndUpdate(
          existing._id,
          { $set: { ...editableData, shiftLabel } },
          { new: true, runValidators: false }
        );
        return NextResponse.json({ shift, updated: true }, { status: 200 });
      }

      // No such shift for this historical day yet — create one with day-boundary
      // times. shiftOrder is free-text/best-effort for backfill: next in sequence
      // among whatever shifts already exist for this date.
      const shift = await DayShift.create({
        stationId: stationObjId,
        stationName: station.name,
        date: dateStart,
        status: DAY_STATUS.ENDED,
        shiftKey,
        shiftLabel,
        shiftOrder: existingForDate.length + 1,
        startedBy: currentUser.id,
        startedByName: currentUser.name,
        startTime: dateStart,
        endedBy: currentUser.id,
        endedByName: currentUser.name,
        endTime: dateEnd,
        ...editableData,
      });
      return NextResponse.json({ shift, created: true }, { status: 200 });
    }

    // All remaining types need the day shift. Legacy docs with no shiftKey are
    // treated as 'default' so pre-multi-shift backfilled days keep matching.
    const shiftsForDate = await DayShift.find({
      stationId: stationObjId,
      date: { $gte: dateStart, $lte: dateEnd },
    });
    const shift = shiftsForDate.find((s) => (s.shiftKey || 'default') === shiftKey) || null;
    if (!shift) {
      return NextResponse.json({ error: 'No day shift found for this date/shift. Create the day shift first.' }, { status: 409 });
    }

    // ── PRUNE ORPHANS ───────────────────────────────────────────────────────────
    // Removes records for pumps / tanks that are no longer in the active selection.
    // Called at the end of each wizard step so only the committed set survives.
    //   keepDispenserIds → prunes MeterReading, SalesEntry, PaymentRecord
    //   keepTankIds      → prunes TankStockEntry
    if (type === 'pruneOrphans') {
      const { keepDispenserIds, keepTankIds } = body;
      const pruned = {};

      if (Array.isArray(keepDispenserIds)) {
        const [mr, se, pr] = await Promise.all([
          MeterReading.deleteMany({
            stationId: stationObjId,
            date: { $gte: dateStart, $lte: dateEnd },
            dayShiftId: { $in: [shift._id, null] },
            pumpId: { $nin: keepDispenserIds },
          }),
          SalesEntry.deleteMany({
            stationId: stationObjId,
            dayShiftId: shift._id,
            dispenserId: { $nin: keepDispenserIds },
          }),
          PaymentRecord.deleteMany({
            stationId: stationObjId,
            dayShiftId: shift._id,
            dispenserId: { $nin: keepDispenserIds },
          }),
        ]);
        pruned.meterReadings = mr.deletedCount;
        pruned.salesEntries  = se.deletedCount;
        pruned.paymentRecords = pr.deletedCount;
      }

      if (Array.isArray(keepTankIds)) {
        const tse = await TankStockEntry.deleteMany({
          stationId: stationObjId,
          date: { $gte: dateStart, $lte: dateEnd },
          dayShiftId: { $in: [shift._id, null] },
          tankId: { $nin: keepTankIds },
        });
        pruned.tankStockEntries = tse.deletedCount;
      }

      return NextResponse.json({ pruned }, { status: 200 });
    }

    // ── PUMP READING ────────────────────────────────────────────────────────────
    if (type === 'pumpReading') {
      const { pumpId, pumpLabel, opening, closing, rtt } = body;
      if (!pumpId || opening === undefined) {
        return NextResponse.json({ error: 'pumpId and opening are required.' }, { status: 400 });
      }
      const openingVal = Number(opening);
      const closingVal = closing !== undefined ? Number(closing) : null;
      const rttVal = rtt !== undefined ? Number(rtt) : 0;

      const reading = await MeterReading.findOneAndUpdate(
        { stationId: stationObjId, pumpId, date: { $gte: dateStart, $lte: dateEnd }, dayShiftId: { $in: [shift._id, null] } },
        {
          $set: {
            stationId: stationObjId,
            stationName: station.name,
            pumpId,
            pumpLabel: pumpLabel || pumpId,
            date: dateStart,
            dayShiftId: shift._id,
            opening: openingVal,
            openingSubmittedAt: dateStart,
            closing: closingVal,
            closingSubmittedAt: closingVal !== null ? dateEnd : null,
            rtt: rttVal,
            supervisorId: currentUser.id,
            supervisorName: currentUser.name,
            previousDayClosing: null,
            discrepancyFlag: false,
          },
        },
        { new: true, upsert: true, runValidators: false }
      );
      return NextResponse.json({ reading }, { status: 200 });
    }

    // ── TANK READING ────────────────────────────────────────────────────────────
    if (type === 'tankReading') {
      const { tankId, period, stockValue, notes } = body;
      if (!tankId || !period || stockValue === undefined) {
        return NextResponse.json({ error: 'tankId, period, and stockValue are required.' }, { status: 400 });
      }
      const tank = station.tanks?.find((t) => t._id === tankId);
      if (!tank) {
        return NextResponse.json({ error: 'Tank not found in this station.' }, { status: 404 });
      }
      const val = Number(stockValue);

      // For closing, try to find opening stock
      let openingStock = val;
      if (period === 'closing') {
        const openingEntry = await TankStockEntry.findOne({
          stationId: stationObjId, tankId, period: 'opening',
          date: { $gte: dateStart, $lte: dateEnd },
          dayShiftId: { $in: [shift._id, null] },
        });
        if (openingEntry) openingStock = openingEntry.openingStock;
      }

      const variance = val - openingStock;
      const variancePercent = openingStock > 0 ? (variance / openingStock) * 100 : 0;

      const entry = await TankStockEntry.findOneAndUpdate(
        { stationId: stationObjId, tankId, period, date: { $gte: dateStart, $lte: dateEnd }, dayShiftId: { $in: [shift._id, null] } },
        {
          $set: {
            stationId: stationObjId,
            stationName: station.name,
            tankId,
            tankLabel: tank.label || tankId,
            product: tank.product,
            date: dateStart,
            period,
            dayShiftId: shift._id,
            openingStock,
            closingStockMeasured: val,
            supervisorId: currentUser.id,
            supervisorName: currentUser.name,
            variance,
            variancePercent,
            notes: notes || 'Backfill',
            isBackfill: true,
          },
        },
        { new: true, upsert: true, runValidators: false }
      );
      return NextResponse.json({ entry }, { status: 200 });
    }

    // ── UPDATE EXISTING DELIVERY ────────────────────────────────────────────────
    if (type === 'updateDelivery') {
      const { movementId, fuelType, totalReceived, distribution, supplier, costPerLiter, declaredLoad } = body;
      if (!movementId || !fuelType || !totalReceived) {
        return NextResponse.json({ error: 'movementId, fuelType, and totalReceived are required.' }, { status: 400 });
      }
      const totalCost = costPerLiter ? Number(costPerLiter) * Number(totalReceived) : null;
      const receivedVal = Number(totalReceived);
      const declaredLoadVal = declaredLoad !== undefined && declaredLoad !== null && declaredLoad !== ''
        ? Number(declaredLoad)
        : null;
      const offloadVariance = declaredLoadVal != null ? receivedVal - declaredLoadVal : null;
      const movement = await StockMovement.findOneAndUpdate(
        { _id: movementId, stationId: stationObjId },
        {
          $set: {
            fuelType,
            isOffload: declaredLoadVal != null,
            declaredLoad: declaredLoadVal,
            actualOffloaded: declaredLoadVal != null ? receivedVal : undefined,
            offloadVariance,
            quantity: receivedVal,
            totalReceived: receivedVal,
            expectedQuantity: declaredLoadVal,
            varianceQuantity: offloadVariance,
            distribution: distribution || [],
            supplier: supplier || '',
            costPerLiter: costPerLiter ? Number(costPerLiter) : null,
            totalCost,
          },
        },
        { new: true }
      );
      if (!movement) return NextResponse.json({ error: 'Delivery record not found.' }, { status: 404 });
      return NextResponse.json({ movement }, { status: 200 });
    }

    // ── DELETE DELIVERY ────────────────────────────────────────────────────────
    if (type === 'deleteDelivery') {
      const { movementId } = body;
      if (!movementId) {
        return NextResponse.json({ error: 'movementId is required.' }, { status: 400 });
      }
      const movement = await StockMovement.findOneAndDelete({
        _id: movementId,
        stationId: stationObjId,
      });
      if (!movement) {
        return NextResponse.json({ error: 'Delivery record not found or access denied.' }, { status: 404 });
      }
      await createAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: AUDIT_ACTIONS.DELETE_DELIVERY,
        resource: AUDIT_RESOURCES.STOCK_MOVEMENT,
        resourceId: movementId,
        stationId: stationObjId,
        stationName: station.name,
        details: {
          date: date,
          fuelType: movement.fuelType,
          quantity: movement.quantity,
          supplier: movement.supplier,
        },
      });
      return NextResponse.json({ deleted: true }, { status: 200 });
    }

    // ── TANK DELIVERY (RECEIPT) ─────────────────────────────────────────────────
    if (type === 'tankDelivery') {
      const { fuelType, totalReceived, distribution, supplier, costPerLiter, declaredLoad } = body;
      if (!fuelType || !totalReceived) {
        return NextResponse.json({ error: 'fuelType and totalReceived are required.' }, { status: 400 });
      }

      const totalCost = costPerLiter ? Number(costPerLiter) * Number(totalReceived) : null;
      const receivedVal = Number(totalReceived);
      const tankId = Array.isArray(distribution) && distribution[0] ? distribution[0].tankId : null;

      // declaredLoad (what the truck/waybill said) is optional — paper records
      // may not always have it. Only track this as an offload-with-variance
      // (isOffload: true, feeding the summary-book truck-shortage figure) when
      // it's actually supplied; otherwise leave it a plain, variance-free
      // receipt rather than fabricating a zero-shortage claim.
      const declaredLoadVal = declaredLoad !== undefined && declaredLoad !== null && declaredLoad !== ''
        ? Number(declaredLoad)
        : null;
      const offloadVariance = declaredLoadVal != null ? receivedVal - declaredLoadVal : null;

      // Idempotency guard: an identical receipt (same day, fuel, tank, quantity)
      // is almost certainly a duplicate re-submit. Return it instead of creating
      // a second record. Genuinely distinct loads will differ in quantity/tank.
      const duplicate = await StockMovement.findOne({
        stationId: stationObjId,
        movementType: 'receipt',
        date: { $gte: dateStart, $lte: dateEnd },
        fuelType,
        quantity: receivedVal,
        ...(tankId ? { 'distribution.tankId': tankId } : {}),
      });
      if (duplicate) {
        return NextResponse.json({ movement: duplicate, duplicate: true }, { status: 200 });
      }

      // Historical backfill: do NOT touch Station.currentStock — it reflects live data
      const movement = await StockMovement.create({
        stationId: stationObjId,
        stationName: station.name,
        date: dateStart,
        fuelType,
        movementType: 'receipt',
        isOffload: declaredLoadVal != null,
        declaredLoad: declaredLoadVal,
        actualOffloaded: declaredLoadVal != null ? receivedVal : undefined,
        offloadVariance,
        quantity: Number(totalReceived),
        totalReceived: Number(totalReceived),
        expectedQuantity: declaredLoadVal,
        varianceQuantity: offloadVariance,
        distribution: distribution || [],
        supplier: supplier || '',
        costPerLiter: costPerLiter ? Number(costPerLiter) : null,
        totalCost,
        previousStock: 0,
        newStock: 0,
        recordedBy: currentUser.id,
        recordedByName: currentUser.name,
        notes: 'Backfill',
      });

      return NextResponse.json({ movement }, { status: 200 });
    }

    // ── SALE ENTRY ─────────────────────────────────────────────────────────────
    if (type === 'sale') {
      const { dispenserId, liters } = body;
      if (!dispenserId || liters === undefined) {
        return NextResponse.json({ error: 'dispenserId and liters are required.' }, { status: 400 });
      }
      const dispenser = (station.dispensers || []).find((d) => d.dispenserId === dispenserId);
      if (!dispenser) {
        return NextResponse.json({ error: 'Dispenser not found.' }, { status: 404 });
      }

      const litersVal = Number(liters);
      const fuelType = dispenser.fuelType;

      // Get price from shift
      const pricePerLiter = shift.pricesAtStart instanceof Map
        ? (shift.pricesAtStart.get(fuelType) || 0)
        : (shift.pricesAtStart?.[fuelType] || 0);

      const expectedAmount = litersVal * pricePerLiter;

      // Delete all existing records for this pump+shift — findOneAndUpdate only
      // patches the first match, leaving duplicates from earlier live entries intact.
      await SalesEntry.deleteMany({ stationId: stationObjId, dayShiftId: shift._id, dispenserId });

      const saleEntry = await SalesEntry.create({
        dayShiftId: shift._id,
        stationId: stationObjId,
        stationName: station.name,
        date: dateStart,
        supervisorId: currentUser.id,
        supervisorName: currentUser.name,
        dispenserId,
        dispenserName: dispenser.name,
        fuelType,
        liters: litersVal,
        pricePerLiter,
        expectedAmount,
        cashAmount: 0,
        posAmount: 0,
        totalAmount: 0,
        discrepancy: 0,
        enteredBy: currentUser.id,
        enteredByName: currentUser.name,
      });
      return NextResponse.json({ saleEntry }, { status: 200 });
    }

    // ── PAYMENT RECORD ─────────────────────────────────────────────────────────
    if (type === 'payment') {
      const { dispenserId, cashReceived, posReceived, notes } = body;
      if (!dispenserId || cashReceived === undefined || posReceived === undefined) {
        return NextResponse.json({ error: 'dispenserId, cashReceived, and posReceived are required.' }, { status: 400 });
      }
      const dispenser = (station.dispensers || []).find((d) => d.dispenserId === dispenserId);
      if (!dispenser) {
        return NextResponse.json({ error: 'Dispenser not found.' }, { status: 404 });
      }

      const cashVal = Number(cashReceived);
      const posVal = Number(posReceived);
      const total = cashVal + posVal;

      // Delete all existing records for this pump+shift before writing fresh.
      await PaymentRecord.deleteMany({ stationId: stationObjId, dayShiftId: shift._id, dispenserId });

      const payment = await PaymentRecord.create({
        dayShiftId: shift._id,
        stationId: stationObjId,
        stationName: station.name,
        date: dateStart,
        dispenserId,
        dispenserName: dispenser.name,
        fuelType: dispenser.fuelType,
        supervisorId: currentUser.id,
        supervisorName: currentUser.name,
        cashReceived: cashVal,
        posEntries: posVal > 0 ? [{ bank: 'POS', amount: posVal }] : [],
        posReceived: posVal,
        totalReceived: total,
        recordedBy: currentUser.id,
        recordedByName: currentUser.name,
        notes: notes || 'Backfill',
        managerReviewStatus: 'approved',
      });

      // Stamp the cash/pos amounts onto the corresponding sales entry.
      await SalesEntry.updateOne(
        { stationId: stationObjId, dayShiftId: shift._id, dispenserId },
        { $set: { cashAmount: cashVal, posAmount: posVal, totalAmount: total } }
      );

      return NextResponse.json({ payment }, { status: 200 });
    }

    // ── BANK DEPOSIT ────────────────────────────────────────────────────────────
    if (type === 'bankDeposit') {
      const { amount, bankName, bankBranch, accountNumber, note, depositDate } = body;
      if (!amount || !bankName || !accountNumber) {
        return NextResponse.json({ error: 'amount, bankName, and accountNumber are required.' }, { status: 400 });
      }

      // depositDate = actual banking date (can differ from wizard operating date)
      const depositDateStart = depositDate ? new Date(depositDate + 'T00:00:00.000Z') : dateStart;

      const deposit = await CashDeposit.create({
        stationId: stationObjId,
        stationName: station.name,
        date: depositDateStart,  // actual date money was banked
        forDate: dateStart,       // operating day this cash belongs to
        amount: Number(amount),
        bankName,
        bankBranch: bankBranch || '',
        accountNumber,
        initiatedByCashierId: currentUser.id,
        initiatedByCashierName: currentUser.name,
        initiatedAt: depositDateStart,
        status: 'approved',
        approvedByAdminId: currentUser.id,
        approvedByAdminName: currentUser.name,
        approvedAt: new Date(),
        adminNote: note || 'Backfill',
      });
      return NextResponse.json({ deposit }, { status: 200 });
    }

    // ── UPDATE DEPOSIT ──────────────────────────────────────────────────────────
    if (type === 'updateDeposit') {
      const { depositId, amount, bankName, accountNumber, bankBranch, note, depositDate } = body;
      if (!depositId || !amount || !bankName || !accountNumber) {
        return NextResponse.json({ error: 'depositId, amount, bankName, and accountNumber are required.' }, { status: 400 });
      }

      // depositDate = actual banking date (can differ from wizard operating date)
      const depositDateStart = depositDate ? new Date(depositDate + 'T00:00:00.000Z') : dateStart;

      const deposit = await CashDeposit.findOneAndUpdate(
        { _id: depositId, stationId: stationObjId },
        {
          $set: {
            date: depositDateStart,
            amount: Number(amount),
            bankName,
            bankBranch: bankBranch || '',
            accountNumber,
            adminNote: note || '',
          },
        },
        { new: true }
      );
      if (!deposit) {
        return NextResponse.json({ error: 'Deposit record not found or access denied.' }, { status: 404 });
      }
      await createAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: AUDIT_ACTIONS.UPDATE_DEPOSIT,
        resource: AUDIT_RESOURCES.CASH_DEPOSIT,
        resourceId: depositId,
        stationId: stationObjId,
        stationName: station.name,
        details: {
          forDate: deposit.forDate,
          amount: deposit.amount,
          bankName: deposit.bankName,
          accountNumber: deposit.accountNumber,
        },
      });
      return NextResponse.json({ deposit }, { status: 200 });
    }

    // ── DELETE DEPOSIT ──────────────────────────────────────────────────────────
    if (type === 'deleteDeposit') {
      const { depositId } = body;
      if (!depositId) {
        return NextResponse.json({ error: 'depositId is required.' }, { status: 400 });
      }
      const deposit = await CashDeposit.findById(depositId);
      if (!deposit) {
        return NextResponse.json({ error: 'Deposit not found.' }, { status: 404 });
      }
      if (deposit.stationId.toString() !== stationObjId.toString()) {
        return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
      }
      await CashDeposit.findByIdAndDelete(depositId);
      return NextResponse.json({ deleted: true }, { status: 200 });
    }

    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  } catch (error) {
    console.error('Backfill error:', error);
    return NextResponse.json({ error: error.message || 'Backfill failed.' }, { status: 500 });
  }
}
