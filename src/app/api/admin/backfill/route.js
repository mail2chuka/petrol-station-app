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
    if (!type || !stationId || !date) {
      return NextResponse.json({ error: 'type, stationId, and date are required.' }, { status: 400 });
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
      const { dispenserIds, prices } = body;
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

      const shift = await DayShift.findOneAndUpdate(
        { stationId: stationObjId, date: { $gte: dateStart, $lte: dateEnd } },
        {
          $set: {
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
            dispenserAssignments,
            pricesAtStart,
          },
        },
        { new: true, upsert: true, runValidators: false }
      );
      return NextResponse.json({ shift }, { status: 200 });
    }

    // All remaining types need the day shift
    const shift = await DayShift.findOne({
      stationId: stationObjId,
      date: { $gte: dateStart, $lte: dateEnd },
    });
    if (!shift) {
      return NextResponse.json({ error: 'No day shift found for this date. Create the day shift first.' }, { status: 409 });
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

    // ── TANK DELIVERY (RECEIPT) ─────────────────────────────────────────────────
    if (type === 'tankDelivery') {
      const { fuelType, totalReceived, distribution, supplier, costPerLiter } = body;
      if (!fuelType || !totalReceived) {
        return NextResponse.json({ error: 'fuelType and totalReceived are required.' }, { status: 400 });
      }

      const totalCost = costPerLiter ? Number(costPerLiter) * Number(totalReceived) : null;

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

      const saleEntry = await SalesEntry.findOneAndUpdate(
        { stationId: stationObjId, dayShiftId: shift._id, dispenserId },
        {
          $set: {
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
          },
        },
        { new: true, upsert: true, runValidators: false }
      );
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

      const payment = await PaymentRecord.findOneAndUpdate(
        { stationId: stationObjId, dayShiftId: shift._id, dispenserId },
        {
          $set: {
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
          },
        },
        { new: true, upsert: true, runValidators: false }
      );

      // Also update the sales entry amounts
      await SalesEntry.findOneAndUpdate(
        { stationId: stationObjId, dayShiftId: shift._id, dispenserId },
        { $set: { cashAmount: cashVal, posAmount: posVal, totalAmount: total } },
        { runValidators: false }
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
