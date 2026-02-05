import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import DayShift from '@/models/DayShift';
import { requireAuth, requireStationAccess } from '@/lib/auth';

// GET /api/day-shifts/[id] - Get a specific day shift
export async function GET(request, { params }) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const dayShift = await DayShift.findById(params.id);

    if (!dayShift) {
      return NextResponse.json(
        { error: 'Day shift not found' },
        { status: 404 }
      );
    }

    // Check access
    await requireStationAccess(dayShift.stationId.toString());

    return NextResponse.json({ dayShift });
  } catch (error) {
    console.error('Error fetching day shift:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch day shift' },
      { status: 500 }
    );
  }
}
