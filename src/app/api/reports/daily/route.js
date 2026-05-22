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

    // Aggregate sales by fuel type
    const totalSales = {
      PMS: { liters: 0, amount: 0 },
      AGO: { liters: 0, amount: 0 },
    };
    let totalCollected = 0;
    salesEntries.forEach(sale => {
      totalSales[sale.fuelType].liters += sale.liters;
      totalSales[sale.fuelType].amount += sale.expectedAmount;
      totalCollected += (sale.totalAmount || 0);
    });

    const expectedAmount = totalSales.PMS.amount + totalSales.AGO.amount;
    const discrepancy = totalCollected - expectedAmount;

    // Accountant payment totals
    const totalPayments = {
      cash: paymentRecords.reduce((sum, p) => sum + p.cashReceived, 0),
      pos: paymentRecords.reduce((sum, p) => sum + p.posReceived, 0),
    };

    // Aggregate by supervisor
    const supervisorMap = {};
    salesEntries.forEach(sale => {
      const key = sale.supervisorId.toString();
      if (!supervisorMap[key]) {
        supervisorMap[key] = {
          supervisorId: sale.supervisorId,
          supervisorName: sale.supervisorName,
          totalLiters: 0,
          totalExpected: 0,
          totalCollected: 0,
          totalCash: 0,
          totalPos: 0,
          totalPaymentReceived: 0,
        };
      }
      supervisorMap[key].totalLiters += sale.liters;
      supervisorMap[key].totalExpected += sale.expectedAmount;
      supervisorMap[key].totalCollected += (sale.totalAmount || 0);
    });

    paymentRecords.forEach(payment => {
      const key = payment.supervisorId.toString();
      if (supervisorMap[key]) {
        supervisorMap[key].totalCash += payment.cashReceived;
        supervisorMap[key].totalPos += payment.posReceived;
        supervisorMap[key].totalPaymentReceived += payment.totalReceived;
      }
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
