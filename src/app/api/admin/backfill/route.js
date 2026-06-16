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
            startedByName: `${currentUser.name} (Backfill)`,
            startTime: dateStart,
            endedBy: currentUser.id,
            endedByName: `${currentUser.name} (Backfill)`,
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
            supervisorName: `${currentUser.name} (Backfill)`,
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
            supervisorName: `${currentUser.name} (Backfill)`,
            variance,
            variancePercent,
            notes: notes || 'Admin backfill',
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

      // Get current station stock as previousStock
      const prevStock = station.currentStock instanceof Map
        ? (station.currentStock.get(fuelType) || 0)
        : (station.currentStock?.[fuelType] || 0);

      const newStock = prevStock + Number(totalReceived);
      const totalCost = costPerLiter ? Number(costPerLiter) * Number(totalReceived) : null;

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
        previousStock: prevStock,
        newStock,
        recordedBy: currentUser.id,
        recordedByName: `${currentUser.name} (Backfill)`,
        notes: 'Admin backfill',
      });

      // Update station current stock
      await Station.findByIdAndUpdate(stationId, {
        $set: { [`currentStock.${fuelType}`]: newStock },
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
            supervisorName: `${currentUser.name} (Backfill)`,
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
            enteredByName: `${currentUser.name} (Backfill)`,
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
            cashReceived: cashVal,
            posEntries: posVal > 0 ? [{ bank: 'Backfill', amount: posVal }] : [],
            posReceived: posVal,
            totalReceived: total,
            recordedBy: currentUser.id,
            recordedByName: `${currentUser.name} (Backfill)`,
            notes: notes || 'Admin backfill',
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
      const { amount, bankName, bankBranch, accountNumber, note } = body;
      if (!amount || !bankName || !accountNumber) {
        return NextResponse.json({ error: 'amount, bankName, and accountNumber are required.' }, { status: 400 });
      }

      const deposit = await CashDeposit.create({
        stationId: stationObjId,
        stationName: station.name,
        date: dateStart,
        forDate: dateStart,
        amount: Number(amount),
        bankName,
        bankBranch: bankBranch || '',
        accountNumber,
        initiatedByCashierId: currentUser.id,
        initiatedByCashierName: `${currentUser.name} (Backfill)`,
        initiatedAt: dateStart,
        status: 'approved',
        approvedByAdminId: currentUser.id,
        approvedByAdminName: currentUser.name,
        approvedAt: new Date(),
        adminNote: note || 'Admin backfill',
      });
      return NextResponse.json({ deposit }, { status: 200 });
    }

    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  } catch (error) {
    console.error('Backfill error:', error);
    return NextResponse.json({ error: error.message || 'Backfill failed.' }, { status: 500 });
  }
}
