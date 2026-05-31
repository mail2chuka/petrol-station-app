import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import MeterReading from '@/models/MeterReading';
import DayShift from '@/models/DayShift';
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
// Accepts two action types via body.action:
//   "opening" — supervisor opens a pump and records the opening meter reading
//   "closing" — supervisor records the closing meter reading and RTT at end of shift
export async function POST(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (currentUser.role !== ROLES.SUPERVISOR) {
      return NextResponse.json({ error: 'Only supervisors can submit meter readings' }, { status: 403 });
    }

    const body = await request.json();
    const { action = 'opening', stationId, pumpId, pumpLabel: bodyPumpLabel, date } = body;

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

    const shiftDispenser = activeShift.dispenserAssignments?.find(d => d.dispenserId === pumpId);
    if (!shiftDispenser) {
      return NextResponse.json({ error: 'This pump is not active for today\'s shift.' }, { status: 409 });
    }

    const pumpLabel = bodyPumpLabel || shiftDispenser.dispenserName || pumpId;

    // ── OPENING ACTION ──────────────────────────────────────────────────────────
    if (action === 'opening') {
      const opening = Number(body.opening);
      if (isNaN(opening) || opening < 0) {
        return NextResponse.json({ error: 'A valid opening reading is required' }, { status: 400 });
      }

      // Find the MOST RECENT closing for this pump before today — regardless of which date it was on.
      // This is the authoritative "last known reading" the opening must be compared against.
      const previousReading = await MeterReading.findOne({
        stationId,
        pumpId,
        date: { $lt: startDate },
        closing: { $ne: null },
      }).sort({ date: -1, createdAt: -1 });

      const previousDayClosing = previousReading?.closing ?? null;
      const previousReadingDate = previousReading?.date ?? null;

      // Tolerance of 0.01 guards against floating-point representation differences
      const hasDiscrepancy = previousDayClosing !== null && Math.abs(opening - previousDayClosing) > 0.01;

      if (hasDiscrepancy && !body.discrepancyComment?.trim()) {
        const dateLabel = previousReadingDate
          ? new Date(previousReadingDate).toLocaleDateString('en-NG', { dateStyle: 'medium' })
          : 'previous session';
        return NextResponse.json({
          error: `Opening reading differs from the last recorded closing of ${previousDayClosing} (${dateLabel}). A comment is required.`,
          requiresComment: true,
          previousDayClosing,
        }, { status: 400 });
      }

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
            discrepancyFlag: hasDiscrepancy,
            discrepancyComment: body.discrepancyComment?.trim() || null,
          },
        },
        { new: true, upsert: true, runValidators: false }
      );

      // Notify admin AND manager about discrepancy
      if (hasDiscrepancy) {
        await notifyAdminMeterDiscrepancy({
          stationId,
          stationName: currentUser.stationName || 'Unknown Station',
          supervisorName: currentUser.name,
          pumpLabel,
          opening,
          previousClosing: previousDayClosing,
          comment: body.discrepancyComment?.trim() || '',
          readingId: reading._id,
        });

        // Also notify the station manager
        const manager = await User.findOne({ stationId, role: ROLES.MANAGER, isActive: true });
        if (manager) {
          const { createNotification } = await import('@/lib/notifications');
          await createNotification({
            recipientId: manager._id,
            stationId,
            stationName: currentUser.stationName || 'Unknown Station',
            title: 'Opening Meter Discrepancy',
            message: `${currentUser.name} opened ${pumpLabel} with reading ${opening}, which differs from previous closing of ${previousDayClosing}. Comment: "${body.discrepancyComment?.trim()}"`,
            type: 'meter_discrepancy',
            relatedType: 'meter_reading',
            relatedId: reading._id,
          });
        }
      }

      return NextResponse.json({ reading }, { status: 201 });
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

    return NextResponse.json({ error: 'Invalid action. Use "opening" or "closing".' }, { status: 400 });

  } catch (error) {
    console.error('Error saving meter reading:', error);
    return NextResponse.json({ error: error.message || 'Failed to save meter reading' }, { status: 500 });
  }
}
