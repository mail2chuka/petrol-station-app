import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import PumpReassignment from '@/models/PumpReassignment';
import AttendantAssignment from '@/models/AttendantAssignment';
import Attendant from '@/models/Attendant';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// GET /api/pump-reassignments?stationId=&from=&to=&attendantId=&dispenserId=
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId') || currentUser.stationId;
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const attendantId = searchParams.get('attendantId');
    const dispenserId = searchParams.get('dispenserId');

    if (!stationId) return NextResponse.json({ error: 'stationId is required' }, { status: 400 });

    const query = { stationId };
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = from;
      if (to) query.date.$lte = to;
    }
    if (dispenserId) query.dispenserId = dispenserId;
    if (attendantId) {
      query.$or = [{ fromAttendantId: attendantId }, { toAttendantId: attendantId }];
    }

    const log = await PumpReassignment.find(query).sort({ reassignedAt: -1 }).lean();
    return NextResponse.json({ log });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to load reassignment log' }, { status: 500 });
  }
}

// POST /api/pump-reassignments — mid-day reassignment (requires reason)
export async function POST(request) {
  try {
    const currentUser = await requireAuth();
    if (![ROLES.MANAGER, ROLES.ADMIN].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Only manager or admin can reassign attendants' }, { status: 403 });
    }
    await connectDB();

    const body = await request.json();
    const { stationId: bodyStationId, date, dispenserId, dispenserName, fuelType, toAttendantId, reason } = body;
    const stationId = currentUser.stationId || bodyStationId;

    if (!date || !dispenserId || !toAttendantId || !reason?.trim()) {
      return NextResponse.json({ error: 'date, dispenserId, toAttendantId, and reason are required' }, { status: 400 });
    }

    // Get current assignment to record the "from" attendant
    const currentAssignment = await AttendantAssignment.findOne({ stationId, date, dispenserId }).lean();

    const toAttendant = await Attendant.findById(toAttendantId).lean();
    if (!toAttendant) return NextResponse.json({ error: 'New attendant not found' }, { status: 404 });

    // Log the reassignment
    const entry = await PumpReassignment.create({
      stationId,
      date,
      dispenserId,
      dispenserName: dispenserName || currentAssignment?.dispenserName || '',
      fuelType: fuelType || currentAssignment?.fuelType || '',
      fromAttendantId: currentAssignment?.attendantId || null,
      fromAttendantStaffNumber: currentAssignment?.attendantStaffNumber || '',
      fromAttendantName: currentAssignment?.attendantName || '',
      toAttendantId: toAttendant._id,
      toAttendantStaffNumber: toAttendant.staffNumber,
      toAttendantName: toAttendant.name,
      reason: reason.trim(),
      reassignedAt: new Date(),
      reassignedByManagerId: currentUser.id,
      reassignedByManagerName: currentUser.name,
    });

    // Update the active assignment
    await AttendantAssignment.findOneAndUpdate(
      { stationId, date, dispenserId },
      {
        attendantId: toAttendant._id,
        attendantStaffNumber: toAttendant.staffNumber,
        attendantName: toAttendant.name,
        assignedAt: new Date(),
        assignedByManagerId: currentUser.id,
        assignedByManagerName: currentUser.name,
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to log reassignment' }, { status: 500 });
  }
}
