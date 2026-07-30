import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import AttendantAssignment from '@/models/AttendantAssignment';
import Attendant from '@/models/Attendant';
import DayShift from '@/models/DayShift';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// GET /api/attendant-assignments?stationId=&date=YYYY-MM-DD
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId') || currentUser.stationId;
    const date = searchParams.get('date');

    if (!stationId) return NextResponse.json({ error: 'stationId is required' }, { status: 400 });

    const query = { stationId };
    if (date) query.date = date;

    const assignments = await AttendantAssignment.find(query).sort({ date: -1, dispenserName: 1 }).lean();
    return NextResponse.json({ assignments });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to load assignments' }, { status: 500 });
  }
}

// POST /api/attendant-assignments — assign (or reassign initial) attendant to pump for a date
export async function POST(request) {
  try {
    const currentUser = await requireAuth();
    if (![ROLES.MANAGER, ROLES.ADMIN].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Only manager or admin can assign attendants' }, { status: 403 });
    }
    await connectDB();

    const body = await request.json();
    const { stationId: bodyStationId, date, dayShiftId, dispenserId, dispenserName, fuelType, attendantId } = body;
    const stationId = currentUser.stationId || bodyStationId;

    if (!date || !dispenserId || !attendantId) {
      return NextResponse.json({ error: 'date, dispenserId, and attendantId are required' }, { status: 400 });
    }

    const attendant = await Attendant.findById(attendantId).lean();
    if (!attendant) return NextResponse.json({ error: 'Attendant not found' }, { status: 404 });

    // A doc with no dayShiftId predates multi-shift support for this date —
    // it can only belong to the earliest shift, never a later one added on
    // top of an already-recorded date.
    let shiftIdMatch = { $in: [dayShiftId || null, null] };
    if (dayShiftId) {
      const shiftsForDate = await DayShift.find({ stationId, date }).lean();
      const earliestShiftForDate = shiftsForDate.length
        ? [...shiftsForDate].sort((a, b) =>
            (a.shiftOrder || 1) - (b.shiftOrder || 1) || String(a._id).localeCompare(String(b._id))
          )[0]
        : null;
      const isEarliestShift = !!(earliestShiftForDate && String(dayShiftId) === String(earliestShiftForDate._id));
      shiftIdMatch = isEarliestShift ? { $in: [dayShiftId, null] } : dayShiftId;
    }

    const assignment = await AttendantAssignment.findOneAndUpdate(
      // Match either this shift's own doc or — only for the earliest shift on
      // this date — a pre-deploy doc that hasn't been tagged with a
      // dayShiftId yet (in-flight shift crossing the deploy).
      { stationId, date, dispenserId, dayShiftId: shiftIdMatch },
      {
        stationId,
        date,
        dayShiftId: dayShiftId || null,
        dispenserId,
        dispenserName: dispenserName || '',
        fuelType: fuelType || '',
        attendantId: attendant._id,
        attendantStaffNumber: attendant.staffNumber,
        attendantName: attendant.name,
        assignedAt: new Date(),
        assignedByManagerId: currentUser.id,
        assignedByManagerName: currentUser.name,
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to save assignment' }, { status: 500 });
  }
}
