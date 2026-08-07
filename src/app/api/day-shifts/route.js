import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import DayShift from '@/models/DayShift';
import { requireAuth, requireStationAccess } from '@/lib/auth';
import { DAY_STATUS } from '@/lib/constants';

// GET /api/day-shifts - Get day shifts
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const status = searchParams.get('status');
    const date = searchParams.get('date');

    let query = {};

    if (stationId) {
      await requireStationAccess(stationId);
      query.stationId = stationId;
    } else if (currentUser.stationId) {
      // Non-admin users can only see their own station
      query.stationId = currentUser.stationId;
    }

    if (status) {
      query.status = status;
    }

    const month = searchParams.get('month'); // YYYY-MM
    if (month) {
      const [y, m] = month.split('-').map(Number);
      query.date = { $gte: new Date(y, m - 1, 1), $lte: new Date(y, m, 0, 23, 59, 59, 999) };
    } else if (date) {
      query.date = {
        $gte: new Date(date + 'T00:00:00.000Z'),
        $lte: new Date(date + 'T23:59:59.999Z'),
      };
    }

    const dayShifts = await DayShift.find(query)
      .sort({ date: -1 })
      .limit(searchParams.get('month') ? 31 : 50);

    return NextResponse.json({ dayShifts });
  } catch (error) {
    console.error('Error fetching day shifts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch day shifts' },
      { status: 500 }
    );
  }
}
