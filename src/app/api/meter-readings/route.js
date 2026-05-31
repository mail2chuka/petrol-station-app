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
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const date = searchParams.get('date');

    const query = {};
    if (stationId) query.stationId = stationId;
    if (currentUser.role !== ROLES.ADMIN && currentUser.stationId) {
      query.stationId = currentUser.stationId;
    }

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

      // Fetch ONLY the previous day's closing — same date window the UI shows the supervisor.
      // Using the day before startDate (UTC) to be consistent with the client's prevDateStr.
      const prevDayStart = new Date(startDate);
      prevDayStart.setUTCDate(prevDayStart.getUTCDate() - 1);
      const prevDayEnd = new Date(prevDayStart);
      prevDayEnd.setUTCHours(23, 59, 59, 999);

      const previousReading = await MeterReading.findOne({
        stationId,
        pumpId,
        date: { $gte: prevDayStart, $lte: prevDayEnd },
        closing: { $ne: null },
      });

      const previousDayClosing = previousReading?.closing ?? null;
      // Use a tolerance of 0.01 to guard against floating-point representation differences
      const hasDiscrepancy = previousDayClosing !== null && Math.abs(opening - previousDayClosing) > 0.01;

      if (hasDiscrepancy && !body.discrepancyComment?.trim()) {
        return NextResponse.json({
          error: 'A comment is required because the opening reading differs from the previous day\'s closing',
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
