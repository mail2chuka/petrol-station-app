import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import MeterReading from '@/models/MeterReading';
import DayShift from '@/models/DayShift';
import Station from '@/models/Station';
import { requireAuth } from '@/lib/auth';
import { ROLES, DAY_STATUS } from '@/lib/constants';
import { notifyAdminMeterDiscrepancy } from '@/lib/notifications';
import User from '@/models/User';

// GET /api/meter-readings
// Extra query param: lastClosingBefore=YYYY-MM-DD
//   When present, returns the most recent closing for EACH pump before that date
//   (used by the supervisor page to show the correct "previous closing" hint).
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const date = searchParams.get('date');
    const lastClosingBefore = searchParams.get('lastClosingBefore');

    // Resolve station scope
    const scopedStationId = currentUser.role !== ROLES.ADMIN && currentUser.stationId
      ? currentUser.stationId
      : stationId;

    // ── Special mode: last closing per pump before a date ─────────────────────
    if (lastClosingBefore) {
      const beforeDate = new Date(lastClosingBefore + 'T00:00:00.000Z');
      const matchStage = {
        closing: { $ne: null },
        date: { $lt: beforeDate },
        ...(scopedStationId ? { stationId: new (require('mongoose').Types.ObjectId)(scopedStationId) } : {}),
      };

      const lastClosings = await MeterReading.aggregate([
        { $match: matchStage },
        { $sort: { date: -1, createdAt: -1 } },
        {
          $group: {
            _id: '$pumpId',
            closing: { $first: '$closing' },
            date: { $first: '$date' },
            pumpLabel: { $first: '$pumpLabel' },
          },
        },
      ]);

      return NextResponse.json({ lastClosings });
    }

    // ── Normal mode: readings for a date range ────────────────────────────────
    const query = {};
    if (scopedStationId) query.stationId = scopedStationId;

    const month = searchParams.get('month');
    if (month) {
      const [y, m] = month.split('-').map(Number);
      query.date = {
        $gte: new Date(Date.UTC(y, m - 1, 1)),
        $lte: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)),
      };
    } else if (date) {
      query.date = {
        $gte: new Date(date + 'T00:00:00.000Z'),
        $lte: new Date(date + 'T23:59:59.999Z'),
      };
    }

    const readings = await MeterReading.find(query).sort({ date: -1, createdAt: -1 });
    return NextResponse.json({ readings });
  } catch (error) {
    console.error('Error fetching meter readings:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch meter readings' }, { status: 500 });
  }
}

// POST /api/meter-readings
// action=admin-seed  — admin seeds initial meter value for a new pump (admin only)
// action=opening     — supervisor opens a pump (supervisor only)
// action=flag-opening — supervisor flags an incorrect opening (supervisor only)
// action=closing     — supervisor records closing reading (supervisor only)
export async function POST(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const body = await request.json();
    const { action = 'opening', stationId, pumpId, pumpLabel: bodyPumpLabel, date } = body;

    // ── ADMIN SEED ACTION ───────────────────────────────────────────────────────
    if (action === 'admin-seed') {
      if (currentUser.role !== ROLES.ADMIN) {
        return NextResponse.json({ error: 'Only admins can seed meter readings.' }, { status: 403 });
      }
      const { seedValue } = body;
      if (!stationId || !pumpId || seedValue === undefined) {
        return NextResponse.json({ error: 'stationId, pumpId, and seedValue are required.' }, { status: 400 });
      }
      const val = Number(seedValue);
      if (!Number.isFinite(val) || val < 0) {
        return NextResponse.json({ error: 'seedValue must be a non-negative number.' }, { status: 400 });
      }
      const station = await Station.findById(stationId).lean();
      if (!station) {
        return NextResponse.json({ error: 'Station not found.' }, { status: 404 });
      }
      // Fixed date in the past — never conflicts with real shift records
      const seedDate = new Date('2000-01-01T00:00:00.000Z');
      const reading = await MeterReading.findOneAndUpdate(
        { stationId, pumpId, date: seedDate },
        {
          $set: {
            stationId,
            stationName: station.name,
            pumpId,
            pumpLabel: bodyPumpLabel || pumpId,
            date: seedDate,
            opening: val,
            openingSubmittedAt: new Date(),
            closing: val,
            closingSubmittedAt: new Date(),
            rtt: 0,
            supervisorId: currentUser.id,
            supervisorName: currentUser.name,
            previousDayClosing: null,
            discrepancyFlag: false,
            discrepancyComment: null,
            editedByAdminId: currentUser.id,
            editedByAdminName: currentUser.name,
          },
        },
        { new: true, upsert: true, runValidators: false }
      );
      return NextResponse.json({ reading }, { status: 201 });
    }

    // ── SUPERVISOR-ONLY ACTIONS ─────────────────────────────────────────────────
    if (currentUser.role !== ROLES.SUPERVISOR) {
      return NextResponse.json({ error: 'Only supervisors can submit meter readings' }, { status: 403 });
    }

    if (!stationId || !pumpId || !date) {
      return NextResponse.json({ error: 'stationId, pumpId, and date are required' }, { status: 400 });
    }

    if (currentUser.stationId !== stationId) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    const startDate = new Date(date + 'T00:00:00.000Z');
    const endDate = new Date(date + 'T23:59:59.999Z');

    // Verify active day shift and pump is in it
    const activeShift = await DayShift.findOne({
      stationId,
      status: DAY_STATUS.IN_PROGRESS,
    });

    if (!activeShift) {
      return NextResponse.json({ error: 'No active day shift. The manager must begin the day first.' }, { status: 409 });
    }

    // Readings can only be submitted for the date of the current active shift.
    // This prevents supervisors from editing past-day readings while today's shift runs.
    const shiftDateStr = new Date(activeShift.date).toISOString().split('T')[0];
    if (date !== shiftDateStr) {
      return NextResponse.json({ error: 'Meter readings can only be submitted for today\'s active shift. Past readings can only be corrected by an admin.' }, { status: 403 });
    }

    const shiftDispenser = activeShift.dispenserAssignments?.find(d => d.dispenserId === pumpId);
    if (!shiftDispenser) {
      return NextResponse.json({ error: 'This pump is not active for today\'s shift.' }, { status: 409 });
    }

    const pumpLabel = bodyPumpLabel || shiftDispenser.dispenserName || pumpId;

    // ── OPENING ACTION ──────────────────────────────────────────────────────────
    // Opening is auto-set from the most recent closing of the previous operating day.
    // Supervisors cannot enter the opening value manually.
    if (action === 'opening') {
      const previousReading = await MeterReading.findOne({
        stationId,
        pumpId,
        date: { $lt: startDate },
        closing: { $ne: null },
      }).sort({ date: -1, createdAt: -1 });

      const previousDayClosing = previousReading?.closing ?? null;

      if (previousDayClosing === null) {
        return NextResponse.json({
          error: 'No previous closing found for this pump. An admin must set the opening reading before the shift can begin.',
          requiresAdminSetup: true,
        }, { status: 409 });
      }

      // Opening is always equal to previous closing — supervisor cannot change it
      const opening = previousDayClosing;

      const reading = await MeterReading.findOneAndUpdate(
        { stationId, pumpId, date: { $gte: startDate, $lte: endDate } },
        {
          $set: {
            stationId,
            stationName: currentUser.stationName || 'Unknown Station',
            pumpId,
            pumpLabel,
            date: startDate,
            opening,
            openingSubmittedAt: new Date(),
            supervisorId: currentUser.id,
            supervisorName: currentUser.name,
            previousDayClosing,
            discrepancyFlag: false,
            discrepancyComment: null,
          },
        },
        { new: true, upsert: true, runValidators: false }
      );

      // Claim this pump in the DayShift so cashier can see which supervisor owns it
      await DayShift.updateOne(
        { _id: activeShift._id, 'dispenserAssignments.dispenserId': pumpId },
        { $set: {
            'dispenserAssignments.$.supervisorId': currentUser.id,
            'dispenserAssignments.$.supervisorName': currentUser.name,
        }}
      );

      return NextResponse.json({ reading }, { status: 201 });
    }

    // ── FLAG-OPENING ACTION ─────────────────────────────────────────────────────
    // Supervisor flags the auto-set opening as incorrect; admin will correct the value.
    if (action === 'flag-opening') {
      const flagComment = body.flagComment?.trim();
      if (!flagComment) {
        return NextResponse.json({ error: 'A comment is required when flagging the opening reading.' }, { status: 400 });
      }

      const reading = await MeterReading.findOne({
        stationId,
        pumpId,
        date: { $gte: startDate, $lte: endDate },
      });

      if (!reading) {
        return NextResponse.json({ error: 'No opening reading found for this pump today.' }, { status: 404 });
      }

      reading.discrepancyFlag = true;
      reading.discrepancyComment = flagComment;
      await reading.save();

      await notifyAdminMeterDiscrepancy({
        stationId,
        stationName: currentUser.stationName || 'Unknown Station',
        supervisorName: currentUser.name,
        pumpLabel: reading.pumpLabel,
        opening: reading.opening,
        previousClosing: reading.previousDayClosing,
        comment: flagComment,
        readingId: reading._id,
      });

      const manager = await User.findOne({ stationId, role: ROLES.MANAGER, isActive: true });
      if (manager) {
        const { createNotification } = await import('@/lib/notifications');
        await createNotification({
          recipientId: manager._id,
          stationId,
          stationName: currentUser.stationName || 'Unknown Station',
          title: 'Opening Meter Reading Flagged',
          message: `${currentUser.name} flagged the opening reading for ${reading.pumpLabel}: "${flagComment}"`,
          type: 'meter_discrepancy',
          relatedType: 'meter_reading',
          relatedId: reading._id,
        });
      }

      return NextResponse.json({ reading }, { status: 200 });
    }

    // ── CLOSING ACTION ──────────────────────────────────────────────────────────
    if (action === 'closing') {
      const closing = Number(body.closing);
      const rtt = Number(body.rtt ?? 0);

      if (isNaN(closing) || closing < 0) {
        return NextResponse.json({ error: 'A valid closing reading is required' }, { status: 400 });
      }

      // Closing can only be added after opening exists
      const existing = await MeterReading.findOne({
        stationId,
        pumpId,
        date: { $gte: startDate, $lte: endDate },
      });

      if (!existing) {
        return NextResponse.json({ error: 'Enter the opening reading before the closing reading.' }, { status: 409 });
      }

      existing.closing = closing;
      existing.rtt = isNaN(rtt) ? 0 : rtt;
      existing.closingSubmittedAt = new Date();
      await existing.save();

      return NextResponse.json({ reading: existing }, { status: 200 });
    }

    return NextResponse.json({ error: 'Invalid action. Use "opening", "flag-opening", or "closing".' }, { status: 400 });

  } catch (error) {
    console.error('Error saving meter reading:', error);
    return NextResponse.json({ error: error.message || 'Failed to save meter reading' }, { status: 500 });
  }
}
