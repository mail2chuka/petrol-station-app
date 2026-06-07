import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import CashDeposit from '@/models/CashDeposit';
import PaymentRecord from '@/models/PaymentRecord';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// GET /api/cash-deposits/summary?stationId=...&month=YYYY-MM
// Returns per-date deposit status for a month:
//   collected = cash received by cashier from supervisors
//   deposited = cash deposited to bank for that operating day (not rejected)
//   status    = 'none' | 'partial' | 'complete'
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // YYYY-MM
    let stationId = searchParams.get('stationId');

    if (!month) return NextResponse.json({ error: 'month is required' }, { status: 400 });

    // Cashier is scoped to their own station
    if (currentUser.role === ROLES.CASHIER) stationId = currentUser.stationId;
    if (!stationId) return NextResponse.json({ error: 'stationId is required' }, { status: 400 });

    if (![ROLES.ADMIN, ROLES.DAILY_AUDITOR, ROLES.EXTERNAL_AUDITOR].includes(currentUser.role)) {
      if (currentUser.stationId !== stationId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    const [y, m] = month.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    const stationObjId = new mongoose.Types.ObjectId(stationId);

    const [paymentAgg, depositAgg] = await Promise.all([
      // Cash collected per date from payment records
      PaymentRecord.aggregate([
        { $match: { stationId: stationObjId, date: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'UTC' } },
            collected: { $sum: '$cashReceived' },
          },
        },
      ]),
      // Cash deposited per forDate (exclude rejected)
      CashDeposit.aggregate([
        {
          $match: {
            stationId: stationObjId,
            forDate: { $gte: start, $lte: end },
            status: { $ne: 'rejected' },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$forDate', timezone: 'UTC' } },
            deposited: { $sum: '$amount' },
          },
        },
      ]),
    ]);

    const collected = Object.fromEntries(paymentAgg.map(r => [r._id, r.collected]));
    const deposited = Object.fromEntries(depositAgg.map(r => [r._id, r.deposited]));

    const dates = {};
    // Only surface dates where cash was actually collected
    for (const [date, col] of Object.entries(collected)) {
      if (col <= 0) continue;
      const dep = deposited[date] ?? 0;
      let status = 'none';
      if (dep >= col) status = 'complete';
      else if (dep > 0) status = 'partial';
      dates[date] = { collected: col, deposited: dep, status };
    }

    return NextResponse.json({ month, stationId, dates });
  } catch (error) {
    console.error('Error fetching deposit summary:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch summary' }, { status: 500 });
  }
}
