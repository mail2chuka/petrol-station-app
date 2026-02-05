import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import DayShift from '@/models/DayShift';
import SalesEntry from '@/models/SalesEntry';
import PaymentRecord from '@/models/PaymentRecord';
import { requireAuth } from '@/lib/auth';
import { ROLES, DAY_STATUS } from '@/lib/constants';

// GET /api/reports/daily - Get daily report
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

    // Check access
    if (currentUser.role !== ROLES.ADMIN && currentUser.role !== ROLES.AUDITOR && currentUser.stationId !== stationId) {
      return NextResponse.json(
        { error: 'Access denied to this station' },
        { status: 403 }
      );
    }

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    // Get day shift
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

    // Get sales entries
    const salesEntries = await SalesEntry.find({
      dayShiftId: dayShift._id,
    }).sort({ createdAt: 1 });

    // Get payment records
    const paymentRecords = await PaymentRecord.find({
      dayShiftId: dayShift._id,
    }).sort({ createdAt: 1 });

    // Aggregate sales by attendant
    const salesByAttendant = salesEntries.reduce((acc, sale) => {
      const key = sale.attendantId.toString();
      if (!acc[key]) {
        acc[key] = {
          attendantId: sale.attendantId,
          attendantName: sale.attendantName,
          sales: [],
          totalLiters: 0,
          totalExpected: 0,
          totalActual: 0,
        };
      }
      acc[key].sales.push(sale);
      acc[key].totalLiters += sale.liters;
      acc[key].totalExpected += sale.expectedAmount;
      acc[key].totalActual += sale.totalAmount;
      return acc;
    }, {});

    // Aggregate payments by attendant
    const paymentsByAttendant = paymentRecords.reduce((acc, payment) => {
      const key = payment.attendantId.toString();
      if (!acc[key]) {
        acc[key] = {
          attendantId: payment.attendantId,
          attendantName: payment.attendantName,
          payments: [],
          totalCash: 0,
          totalPos: 0,
          totalReceived: 0,
        };
      }
      acc[key].payments.push(payment);
      acc[key].totalCash += payment.cashReceived;
      acc[key].totalPos += payment.posReceived;
      acc[key].totalReceived += payment.totalReceived;
      return acc;
    }, {});

    // Merge data by attendant
    const attendantSummaries = {};
    
    Object.keys(salesByAttendant).forEach(attendantId => {
      attendantSummaries[attendantId] = {
        ...salesByAttendant[attendantId],
        payments: paymentsByAttendant[attendantId]?.payments || [],
        totalCash: paymentsByAttendant[attendantId]?.totalCash || 0,
        totalPos: paymentsByAttendant[attendantId]?.totalPos || 0,
        totalReceived: paymentsByAttendant[attendantId]?.totalReceived || 0,
      };
    });

    return NextResponse.json({
      dayShift,
      attendantSummaries: Object.values(attendantSummaries),
      salesEntries,
      paymentRecords,
      summary: {
        status: dayShift.status,
        totalSales: dayShift.totalSales,
        totalPayments: dayShift.totalPayments,
        expectedAmount: dayShift.expectedAmount,
        actualAmount: dayShift.actualAmount,
        discrepancy: dayShift.discrepancy,
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
