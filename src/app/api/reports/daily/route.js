import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import DayShift from '@/models/DayShift';
import SalesEntry from '@/models/SalesEntry';
import PaymentRecord from '@/models/PaymentRecord';
import MeterReading from '@/models/MeterReading';
import TankStockEntry from '@/models/TankStockEntry';
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

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const dayShift = await DayShift.findOne({
      stationId,
      date: { $gte: startDate, $lte: endDate },
    });

    if (!dayShift) {
      return NextResponse.json(
        { error: 'No day shift found for this date' },
        { status: 404 }
      );
    }

    // Always compute live from entries (works for both in-progress and ended shifts)
    const [salesEntries, paymentRecords, meterReadings, tankStockEntries] = await Promise.all([
      SalesEntry.find({ dayShiftId: dayShift._id }).sort({ createdAt: 1 }),
      PaymentRecord.find({ dayShiftId: dayShift._id }).sort({ createdAt: 1 }),
      MeterReading.find({ stationId, date: { $gte: startDate, $lte: endDate } }),
      TankStockEntry.find({ stationId, date: { $gte: startDate, $lte: endDate } }),
    ]);

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
      supervisorSummaries: Object.values(supervisorMap),
      summary: {
        status: dayShift.status,
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
