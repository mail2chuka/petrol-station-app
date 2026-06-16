import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import DayShift from '@/models/DayShift';
import SalesEntry from '@/models/SalesEntry';
import PaymentRecord from '@/models/PaymentRecord';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// GET /api/reports/period-summary?stationId=&month=YYYY-MM
// GET /api/reports/period-summary?stationId=&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const month = searchParams.get('month');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!stationId) {
      return NextResponse.json({ error: 'stationId is required' }, { status: 400 });
    }

    const bypassRoles = [ROLES.ADMIN, ROLES.DAILY_AUDITOR, ROLES.EXTERNAL_AUDITOR];
    if (!bypassRoles.includes(currentUser.role) && currentUser.stationId !== stationId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    let dateFrom, dateTo;
    if (month) {
      const [y, m] = month.split('-').map(Number);
      dateFrom = new Date(Date.UTC(y, m - 1, 1));
      dateTo = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    } else if (startDate && endDate) {
      dateFrom = new Date(startDate + 'T00:00:00.000Z');
      dateTo = new Date(endDate + 'T23:59:59.999Z');
    } else {
      return NextResponse.json({ error: 'Provide month or startDate+endDate' }, { status: 400 });
    }

    const dayShifts = await DayShift.find({
      stationId,
      date: { $gte: dateFrom, $lte: dateTo },
    }).sort({ date: -1 }).lean();

    if (!dayShifts.length) return NextResponse.json({ days: [] });

    const dayShiftIds = dayShifts.map(d => d._id);

    const [salesAgg, paymentsAgg] = await Promise.all([
      SalesEntry.aggregate([
        { $match: { dayShiftId: { $in: dayShiftIds } } },
        { $group: {
          _id: '$dayShiftId',
          totalLiters: { $sum: '$liters' },
          totalExpected: { $sum: '$expectedAmount' },
        }},
      ]),
      PaymentRecord.aggregate([
        { $match: { dayShiftId: { $in: dayShiftIds } } },
        { $group: {
          _id: '$dayShiftId',
          totalCash: { $sum: '$cashReceived' },
          totalPos: { $sum: '$posReceived' },
        }},
      ]),
    ]);

    const salesMap = Object.fromEntries(salesAgg.map(s => [s._id.toString(), s]));
    const paymentsMap = Object.fromEntries(paymentsAgg.map(p => [p._id.toString(), p]));

    const days = dayShifts.map(shift => {
      const id = shift._id.toString();
      const sales = salesMap[id] || { totalLiters: 0, totalExpected: 0 };
      const payments = paymentsMap[id] || { totalCash: 0, totalPos: 0 };
      const totalCollected = (payments.totalCash || 0) + (payments.totalPos || 0);
      return {
        date: shift.date,
        dayShiftId: id,
        status: shift.status,
        stationName: shift.stationName,
        totalLiters: sales.totalLiters || 0,
        totalExpected: sales.totalExpected || 0,
        totalCash: payments.totalCash || 0,
        totalPos: payments.totalPos || 0,
        totalCollected,
        discrepancy: totalCollected - (sales.totalExpected || 0),
      };
    });

    return NextResponse.json({ days });
  } catch (error) {
    console.error('Period summary error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate summary' }, { status: 500 });
  }
}
