import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import DayShift from '@/models/DayShift';
import Station from '@/models/Station';
import SalesEntry from '@/models/SalesEntry';
import PaymentRecord from '@/models/PaymentRecord';
import MeterReading from '@/models/MeterReading';
import TankStockEntry from '@/models/TankStockEntry';
import StockMovement from '@/models/StockMovement';
import Notification from '@/models/Notification';
import { DAY_STATUS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

function nigeriaTodayStart() {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
  return new Date(`${date}T00:00:00.000Z`);
}

function shiftFilter(shift) {
  return shift.shiftKey && shift.shiftKey !== 'default'
    ? { dayShiftId: shift._id }
    : { dayShiftId: { $in: [shift._id, null] } };
}

// Called by Vercel Cron at 12:00 Africa/Lagos (11:00 UTC). It deliberately
// never fabricates readings, stock, or collections: incomplete shifts stay
// open and are flagged for the station manager to finish safely.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();
  const overdue = await DayShift.find({ status: DAY_STATUS.IN_PROGRESS, date: { $lt: nigeriaTodayStart() } });
  const results = [];

  for (const candidate of overdue) {
    let session;
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      const shift = await DayShift.findById(candidate._id).session(session);
      if (!shift || shift.status !== DAY_STATUS.IN_PROGRESS) {
        await session.abortTransaction();
        continue;
      }

      const dateStr = new Date(shift.date).toISOString().split('T')[0];
      const start = new Date(`${dateStr}T00:00:00.000Z`);
      const end = new Date(`${dateStr}T23:59:59.999Z`);
      const recordFilter = shiftFilter(shift);
      const [station, readings, closingEntries, sales, payments] = await Promise.all([
        Station.findById(shift.stationId).session(session),
        MeterReading.find({ stationId: shift.stationId, date: { $gte: start, $lte: end }, ...recordFilter }).session(session),
        TankStockEntry.find({ stationId: shift.stationId, date: { $gte: start, $lte: end }, period: 'closing', ...recordFilter }).session(session),
        SalesEntry.find({ dayShiftId: shift._id }).session(session),
        PaymentRecord.find({ dayShiftId: shift._id }).session(session),
      ]);
      const blockers = [];
      const readingByPump = Object.fromEntries(readings.map(reading => [reading.pumpId, reading]));
      const unclosed = readings.filter(reading => reading.opening != null && reading.closing == null);
      if (unclosed.length) blockers.push(`closing meter: ${unclosed.map(reading => reading.pumpLabel || reading.pumpId).join(', ')}`);
      const closingByTank = Object.fromEntries(closingEntries.map(entry => [entry.tankId, entry]));
      const missingTanks = (station?.tanks || []).filter(tank => tank.isActive && !closingByTank[tank._id]);
      if (missingTanks.length) blockers.push(`closing stock: ${missingTanks.map(tank => tank.label).join(', ')}`);

      const salesByPump = {};
      for (const sale of sales) {
        const item = salesByPump[sale.dispenserId] || { liters: 0, expected: 0, label: sale.dispenserName || sale.dispenserId };
        item.liters += Number(sale.liters) || 0;
        item.expected += Number(sale.expectedAmount) || 0;
        salesByPump[sale.dispenserId] = item;
      }
      const paymentsByPump = {};
      for (const payment of payments) paymentsByPump[payment.dispenserId] = (paymentsByPump[payment.dispenserId] || 0) + (Number(payment.totalReceived) || 0);
      const missingCollections = Object.entries(salesByPump)
        .filter(([pumpId, sale]) => sale.liters > 0 && (paymentsByPump[pumpId] || 0) <= 0)
        .map(([, sale]) => sale.label);
      if (missingCollections.length) blockers.push(`collection not recorded: ${missingCollections.join(', ')}`);

      if (blockers.length) {
        await session.abortTransaction();
        await Notification.create({
          recipientRole: 'manager', stationId: shift.stationId, stationName: shift.stationName,
          title: 'Overdue shift needs closing data',
          message: `${shift.shiftLabel || 'Shift'} for ${dateStr} could not auto-close: ${blockers.join('; ')}.`,
          type: 'general', isAdminFlag: true, relatedType: 'day_shift', relatedId: shift._id,
        });
        results.push({ id: String(shift._id), status: 'blocked', blockers });
        continue;
      }

      const totalSales = {};
      for (const sale of sales) {
        if (!totalSales[sale.fuelType]) totalSales[sale.fuelType] = { liters: 0, amount: 0 };
        totalSales[sale.fuelType].liters += Number(sale.liters) || 0;
        totalSales[sale.fuelType].amount += Number(sale.expectedAmount) || 0;
      }
      const totalPayments = {
        cash: payments.reduce((sum, payment) => sum + (Number(payment.cashReceived) || 0), 0),
        pos: payments.reduce((sum, payment) => sum + (Number(payment.posReceived) || 0), 0),
      };
      const expectedAmount = Object.values(totalSales).reduce((sum, item) => sum + item.amount, 0);
      const actualAmount = totalPayments.cash + totalPayments.pos;
      const collectionOutstanding = Object.entries(salesByPump).reduce((sum, [pumpId, sale]) => (
        sale.liters > 0 ? sum + Math.max(0, sale.expected - (paymentsByPump[pumpId] || 0)) : sum
      ), 0);
      for (const assignment of shift.dispenserAssignments) {
        const reading = readingByPump[assignment.dispenserId];
        if (reading?.closing != null) {
          assignment.finalReading = reading.closing;
          assignment.totalLiters = Math.max(0, reading.closing - (reading.opening || 0) - (reading.rtt || 0));
        }
      }
      if (!(station.currentStock instanceof Map)) station.currentStock = new Map(Object.entries(station.currentStock || {}));
      for (const product of [...new Set(closingEntries.map(entry => entry.product))]) {
        const previousStock = station.currentStock.get(product) || 0;
        const closingTotal = closingEntries.filter(entry => entry.product === product).reduce((sum, entry) => sum + (Number(entry.closingStockMeasured) || 0), 0);
        station.currentStock.set(product, closingTotal);
        await StockMovement.create([{
          stationId: station._id, stationName: station.name, date: shift.date, dayShiftId: shift._id,
          fuelType: product, movementType: 'sale', quantity: closingTotal - previousStock,
          previousStock, newStock: closingTotal, recordedBy: shift.startedBy,
          recordedByName: 'System auto-close', referenceId: shift._id,
          notes: `Automatic noon close for ${dateStr}`,
        }], { session });
      }
      station.markModified('currentStock');
      await station.save({ session });
      shift.status = DAY_STATUS.ENDED;
      shift.endedBy = shift.startedBy;
      shift.endedByName = 'System auto-close';
      shift.endTime = new Date();
      shift.totalSales = totalSales;
      shift.totalPayments = totalPayments;
      shift.expectedAmount = expectedAmount;
      shift.actualAmount = actualAmount;
      shift.discrepancy = actualAmount - expectedAmount;
      shift.collectionOutstanding = collectionOutstanding;
      shift.collectionStatus = collectionOutstanding > 0 ? 'pending' : 'settled';
      await shift.save({ session });
      await session.commitTransaction();
      results.push({ id: String(shift._id), status: 'closed' });
    } catch (error) {
      if (session) try { await session.abortTransaction(); } catch {}
      results.push({ id: String(candidate._id), status: 'error', error: error.message });
    } finally {
      if (session) session.endSession();
    }
  }

  return NextResponse.json({ checked: overdue.length, results });
}
