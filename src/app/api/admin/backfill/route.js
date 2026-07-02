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
    if (!stationId || !date) {
      return NextResponse.json({ error: 'stationId and date are required.' }, { status: 400 });
    }
    const dateStart = new Date(date + 'T00:00:00.000Z');
    const dateEnd = new Date(date + 'T23:59:59.999Z');
    const stationObjId = new mongoose.Types.ObjectId(stationId);

    const [dayShift, meterReadings, tankStockEntries, stockMovements, salesEntries, paymentRecords, cashDeposits] =
      await Promise.all([
        DayShift.findOne({ stationId: stationObjId, date: { $gte: dateStart, $lte: dateEnd } }).lean(),
        MeterReading.find({ stationId: stationObjId, date: { $gte: dateStart, $lte: dateEnd } }).lean(),
        TankStockEntry.find({ stationId: stationObjId, date: { $gte: dateStart, $lte: dateEnd } }).lean(),
        StockMovement.find({ stationId: stationObjId, date: { $gte: dateStart, $lte: dateEnd }, movementType: 'receipt' }).lean(),
        SalesEntry.find({ stationId: stationObjId, date: { $gte: dateStart, $lte: dateEnd } }).lean(),
        PaymentRecord.find({ stationId: stationObjId, date: { $gte: dateStart, $lte: dateEnd } }).lean(),
        CashDeposit.find({ stationId: stationObjId, forDate: { $gte: dateStart, $lte: dateEnd } }).lean(),
      ]);

    return NextResponse.json({ dayShift, meterReadings, tankStockEntries, stockMovements, salesEntries, paymentRecords, cashDeposits });
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
    const { pin, type, stationId, date } = body;

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

      const existing = await DayShift.findOne({
        stationId: stationObjId,
        date: { $gte: dateStart, $lte: dateEnd },
      });

      if (existing) {
        // Day already has a shift: keep its _id, startTime, endTime, status and
        // started/ended-by. Only update the other data — do not re-stamp times.
        const shift = await DayShift.findByIdAndUpdate(
          existing._id,
          { $set: editableData },
          { new: true, runValidators: false }
        );
        return NextResponse.json({ shift, updated: true }, { status: 200 });
      }

      // No shift for this historical day yet — create one with day-boundary times.
      const shift = await DayShift.create({
        stationId: stationObjId,
        stationName: station.name,
        date: dateStart,
        status: DAY_STATUS.ENDED,
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

    // All remaining types need the day shift
    const shift = await DayShift.findOne({
      stationId: stationObjId,
      date: { $gte: dateStart, $lte: dateEnd },
    });
    if (!shift) {
      return NextResponse.json({ error: 'No day shift found for this date. Create the day shift first.' }, { status: 409 });
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
        { stationId: stationObjId, pumpId, date: { $gte: dateStart, $lte: dateEnd } },
        {
          $set: {
            stationId: stationObjId,
            stationName: station.name,
            pumpId,
            pumpLabel: pumpLabel || pumpId,
            date: dateStart,
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
        });
        if (openingEntry) openingStock = openingEntry.openingStock;
      }

      const variance = val - openingStock;
      const variancePercent = openingStock > 0 ? (variance / openingStock) * 100 : 0;

      const entry = await TankStockEntry.findOneAndUpdate(
        { stationId: stationObjId, tankId, period, date: { $gte: dateStart, $lte: dateEnd } },
        {
          $set: {
            stationId: stationObjId,
            stationName: station.name,
            tankId,
            tankLabel: tank.label || tankId,
            product: tank.product,
            date: dateStart,
            period,
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
      const { movementId, fuelType, totalReceived, distribution, supplier, costPerLiter } = body;
      if (!movementId || !fuelType || !totalReceived) {
        return NextResponse.json({ error: 'movementId, fuelType, and totalReceived are required.' }, { status: 400 });
      }
      const totalCost = costPerLiter ? Number(costPerLiter) * Number(totalReceived) : null;
      const movement = await StockMovement.findOneAndUpdate(
        { _id: movementId, stationId: stationObjId },
        {
          $set: {
            fuelType,
            quantity: Number(totalReceived),
            totalReceived: Number(totalReceived),
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
      const { fuelType, totalReceived, distribution, supplier, costPerLiter } = body;
      if (!fuelType || !totalReceived) {
        return NextResponse.json({ error: 'fuelType and totalReceived are required.' }, { status: 400 });
      }

      const totalCost = costPerLiter ? Number(costPerLiter) * Number(totalReceived) : null;
      const receivedVal = Number(totalReceived);
      const tankId = Array.isArray(distribution) && distribution[0] ? distribution[0].tankId : null;

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
        quantity: Number(totalReceived),
        totalReceived: Number(totalReceived),
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
