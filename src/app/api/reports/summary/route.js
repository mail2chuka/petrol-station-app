import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import DayShift from '@/models/DayShift';
import Station from '@/models/Station';
import { requireAuth } from '@/lib/auth';
import { ROLES, DAY_STATUS } from '@/lib/constants';

// GET /api/reports/summary - Get summary report across date range
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Start date and end date are required' },
        { status: 400 }
      );
    }

    let matchQuery = {
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
      status: DAY_STATUS.ENDED,
    };

    if (stationId) {
      // Check access
      if (currentUser.role !== ROLES.ADMIN && currentUser.stationId !== stationId) {
        return NextResponse.json(
          { error: 'Access denied to this station' },
          { status: 403 }
        );
      }
      matchQuery.stationId = stationId;
    } else if (currentUser.role !== ROLES.ADMIN) {
      // Non-admin users can only see their station
      matchQuery.stationId = currentUser.stationId;
    }

    // Aggregate data
    const aggregation = await DayShift.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: stationId ? null : '$stationId',
          stationName: { $first: '$stationName' },
          totalDays: { $sum: 1 },
          totalPmsLiters: { $sum: '$totalSales.PMS.liters' },
          totalPmsAmount: { $sum: '$totalSales.PMS.amount' },
          totalAgoLiters: { $sum: '$totalSales.AGO.liters' },
          totalAgoAmount: { $sum: '$totalSales.AGO.amount' },
          totalCashPayments: { $sum: '$totalPayments.cash' },
          totalPosPayments: { $sum: '$totalPayments.pos' },
          totalExpectedAmount: { $sum: '$expectedAmount' },
          totalActualAmount: { $sum: '$actualAmount' },
          totalDiscrepancy: { $sum: '$discrepancy' },
        },
      },
      { $sort: { stationName: 1 } },
    ]);

    // Get station details if needed
    let stations = [];
    if (!stationId && currentUser.role === ROLES.ADMIN) {
      stations = await Station.find({ isActive: true }).select('_id name code');
    }

    return NextResponse.json({
      summary: aggregation,
      dateRange: {
        startDate,
        endDate,
      },
      stations,
    });
  } catch (error) {
    console.error('Error generating summary report:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate report' },
      { status: 500 }
    );
  }
}
