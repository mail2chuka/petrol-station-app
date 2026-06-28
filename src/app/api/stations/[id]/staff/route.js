import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import Station from '@/models/Station';
import User from '@/models/User';
import Attendant from '@/models/Attendant';
import SalesEntry from '@/models/SalesEntry';
import PaymentRecord from '@/models/PaymentRecord';
import DayShift from '@/models/DayShift';
import AttendantAssignment from '@/models/AttendantAssignment';
import { requireAdmin } from '@/lib/auth';

// Count distinct calendar days an actor appears in a Date-based collection.
async function distinctDaysByActor(Model, actorField, match) {
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: { actor: `$${actorField}`, day: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } } } },
    { $group: { _id: '$_id.actor', days: { $sum: 1 } } },
  ]);
  const map = {};
  for (const r of rows) if (r._id) map[String(r._id)] = r.days;
  return map;
}

// GET /api/stations/[id]/staff
// Returns login staff (grouped-ready, with HR fields) + attendants, each with a
// computed "days on shift" tenure metric. Admin only.
export async function GET(request, { params }) {
  try {
    await requireAdmin();
    await connectDB();

    const { id } = await params;
    const objId = new mongoose.Types.ObjectId(id);

    const [station, users, attendants] = await Promise.all([
      Station.findById(id).lean(),
      User.find({ stationId: objId }).select('-password').sort({ role: 1, name: 1 }).lean(),
      Attendant.find({ stationId: id }).sort({ staffNumber: 1 }).lean(),
    ]);

    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    // Days-on-shift per role from the collection that records their participation
    const [supDays, cashDays, mgrDays, attRows] = await Promise.all([
      distinctDaysByActor(SalesEntry, 'supervisorId', { stationId: objId }),
      distinctDaysByActor(PaymentRecord, 'recordedBy', { stationId: objId }),
      distinctDaysByActor(DayShift, 'startedBy', { stationId: objId }),
      AttendantAssignment.aggregate([
        { $match: { stationId: id } }, // AttendantAssignment.stationId is a string; date is YYYY-MM-DD
        { $group: { _id: { att: '$attendantId', day: '$date' } } },
        { $group: { _id: '$_id.att', days: { $sum: 1 } } },
      ]),
    ]);
    const attDays = {};
    for (const r of attRows) if (r._id) attDays[String(r._id)] = r.days;

    const daysForUser = (u) => {
      const uid = String(u._id);
      if (u.role === 'manager') return mgrDays[uid] || 0;
      if (u.role === 'supervisor') return supDays[uid] || 0;
      if (u.role === 'cashier') return cashDays[uid] || 0;
      return 0;
    };

    return NextResponse.json({
      station: {
        _id: station._id,
        name: station.name,
        code: station.code,
        location: station.location,
        isActive: station.isActive,
      },
      users: users.map((u) => ({ ...u, daysOnShift: daysForUser(u) })),
      attendants: attendants.map((a) => ({ ...a, daysOnShift: attDays[String(a._id)] || 0 })),
    });
  } catch (error) {
    console.error('Station staff error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to load staff' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
