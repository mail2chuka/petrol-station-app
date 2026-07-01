import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import DayShift from '@/models/DayShift';
import SalesEntry from '@/models/SalesEntry';
import PaymentRecord from '@/models/PaymentRecord';
import MeterReading from '@/models/MeterReading';
import TankStockEntry from '@/models/TankStockEntry';
import StockMovement from '@/models/StockMovement';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// GET /api/reports/daily?stationId=&date=YYYY-MM-DD
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const date = searchParams.get('date');

    if (!stationId || !date) {
      return NextResponse.json(
        { error: 'Station ID and date are required' },
        { status: 400 }
      );
    }

    // Access check: admin / auditors bypass; others must be on the same station
    const bypassRoles = [ROLES.ADMIN, ROLES.DAILY_AUDITOR, ROLES.EXTERNAL_AUDITOR];
    if (!bypassRoles.includes(currentUser.role) && currentUser.stationId !== stationId) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    const startDate = new Date(date + 'T00:00:00.000Z');
    const endDate = new Date(date + 'T23:59:59.999Z');

    // A day shift is optional — deliveries, cash collections and bank deposits can
    // happen on days with no shift. We still report whatever data exists for the date.
    // Deterministic pick if legacy duplicates exist: prefer an ended shift, then the
    // most recently started (matches the summary-book canonical-shift selection).
    const dayShift = await DayShift.findOne({
      stationId,
      date: { $gte: startDate, $lte: endDate },
    }).sort({ status: 1, startTime: -1 });

    // Fetch by date (not dayShiftId) so records show with or without a shift.
    const [salesEntries, paymentRecords, meterReadings, tankStockEntries, stockMovements] = await Promise.all([
      SalesEntry.find({ stationId, date: { $gte: startDate, $lte: endDate } }).sort({ createdAt: 1 }),
      PaymentRecord.find({ stationId, date: { $gte: startDate, $lte: endDate } }).sort({ createdAt: 1 }),
      MeterReading.find({ stationId, date: { $gte: startDate, $lte: endDate } }),
      TankStockEntry.find({ stationId, date: { $gte: startDate, $lte: endDate } }),
      StockMovement.find({ stationId, movementType: 'receipt', date: { $gte: startDate, $lte: endDate } }),
    ]);

    // Per-tank stock-in (deliveries) so the dipstick volume-sold accounts for
    // fuel received during the day: volume sold = opening + stock-in − closing.
    const stockInByTank = {};
    for (const m of stockMovements) {
      for (const d of (m.distribution || [])) {
        if (d.tankId) stockInByTank[d.tankId] = (stockInByTank[d.tankId] || 0) + (d.litres || 0);
      }
    }

    // Aggregate sales by fuel type (liters + expected amounts from supervisor entries)
    const totalSales = {};
    salesEntries.forEach(sale => {
      if (!totalSales[sale.fuelType]) totalSales[sale.fuelType] = { liters: 0, amount: 0 };
      totalSales[sale.fuelType].liters += sale.liters;
      totalSales[sale.fuelType].amount += sale.expectedAmount;
    });
    // Ensure PMS/AGO always present for backward compat
    if (!totalSales.PMS) totalSales.PMS = { liters: 0, amount: 0 };
    if (!totalSales.AGO) totalSales.AGO = { liters: 0, amount: 0 };

    const expectedAmount = Object.values(totalSales).reduce((s, v) => s + v.amount, 0);

    // totalCollected comes from cashier payment records
    const totalPayments = {
      cash: paymentRecords.reduce((sum, p) => sum + p.cashReceived, 0),
      pos: paymentRecords.reduce((sum, p) => sum + p.posReceived, 0),
    };
    const totalCollected = totalPayments.cash + totalPayments.pos;
    const discrepancy = totalCollected - expectedAmount;

    // Aggregate by supervisor — liters from sales, cash/pos from payment records
    const supervisorMap = {};
    salesEntries.forEach(sale => {
      const key = sale.supervisorId.toString();
      if (!supervisorMap[key]) {
        supervisorMap[key] = {
          supervisorId: sale.supervisorId,
          supervisorName: sale.supervisorName,
          totalLiters: 0,
          totalExpected: 0,
          totalCash: 0,
          totalPos: 0,
          totalPaymentReceived: 0,
        };
      }
      supervisorMap[key].totalLiters += sale.liters;
      supervisorMap[key].totalExpected += sale.expectedAmount;
    });

    paymentRecords.forEach(payment => {
      const key = payment.supervisorId?.toString();
      if (!key) return;
      if (!supervisorMap[key]) {
        supervisorMap[key] = {
          supervisorId: payment.supervisorId,
          supervisorName: payment.supervisorName,
          totalLiters: 0,
          totalExpected: 0,
          totalCash: 0,
          totalPos: 0,
          totalPaymentReceived: 0,
        };
      }
      supervisorMap[key].totalCash += payment.cashReceived;
      supervisorMap[key].totalPos += payment.posReceived;
      supervisorMap[key].totalPaymentReceived += payment.totalReceived;
    });

    return NextResponse.json({
      dayShift,
      salesEntries,
      paymentRecords,
      meterReadings,
      tankStockEntries,
      stockMovements,
      stockInByTank,
      supervisorSummaries: Object.values(supervisorMap),
      hasShift: Boolean(dayShift),
      summary: {
        status: dayShift ? dayShift.status : 'no_shift',
        totalSales,
        totalPayments,
        expectedAmount,
        totalCollected,
        discrepancy,
      },
    });
  } catch (error) {
    console.error('Error generating daily report:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate report' },
      { status: 500 }
    );
  }
}
