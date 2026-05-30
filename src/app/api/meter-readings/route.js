import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import MeterReading from '@/models/MeterReading';
import DayShift from '@/models/DayShift';
import { requireAuth } from '@/lib/auth';
import { ROLES, DAY_STATUS } from '@/lib/constants';
import { notifyAdminMeterDiscrepancy } from '@/lib/notifications';

const meterReadingSchema = z.object({
  stationId: z.string(),
  pumpId: z.string(),
  pumpLabel: z.string().optional(),
  date: z.string(),
  opening: z.number().min(0),
  closing: z.number().min(0),
  rtt: z.number().min(0),
  discrepancyComment: z.string().optional(),
});

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

    const month = searchParams.get('month'); // YYYY-MM
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
export async function POST(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (currentUser.role !== ROLES.SUPERVISOR) {
      return NextResponse.json({ error: 'Only supervisors can submit meter readings' }, { status: 403 });
    }

    const payload = meterReadingSchema.parse(await request.json());

    if (currentUser.stationId !== payload.stationId) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    const startDate = new Date(payload.date + 'T00:00:00.000Z');
    const endDate = new Date(payload.date + 'T23:59:59.999Z');

    // Verify there is an active day shift and the pump is in it
    const activeShift = await DayShift.findOne({
      stationId: payload.stationId,
      status: DAY_STATUS.IN_PROGRESS,
    });

    if (!activeShift) {
      return NextResponse.json({ error: 'No active day shift. The manager must begin the day first.' }, { status: 409 });
    }

    const shiftDispenser = activeShift.dispenserAssignments?.find(
      d => d.dispenserId === payload.pumpId
    );
    if (!shiftDispenser) {
      return NextResponse.json({ error: 'This pump is not active for today\'s shift.' }, { status: 409 });
    }

    // Use the dispenser name from shift if not provided
    const pumpLabel = payload.pumpLabel || shiftDispenser.dispenserName || payload.pumpId;

    const previousReading = await MeterReading.findOne({
      stationId: payload.stationId,
      pumpId: payload.pumpId,
      date: { $lt: startDate },
    }).sort({ date: -1, createdAt: -1 });

    const previousDayClosing = previousReading?.closing ?? null;
    const openingEdited = previousDayClosing !== null && payload.opening !== previousDayClosing;

    if (openingEdited && !payload.discrepancyComment?.trim()) {
      return NextResponse.json({ error: 'Comment is required when opening reading differs from previous closing' }, { status: 400 });
    }

    const reading = await MeterReading.findOneAndUpdate(
      {
        stationId: payload.stationId,
        pumpId: payload.pumpId,
        date: { $gte: startDate, $lte: endDate },
      },
      {
        stationId: payload.stationId,
        stationName: currentUser.stationName || 'Unknown Station',
        pumpId: payload.pumpId,
        pumpLabel: pumpLabel,
        date: startDate,
        opening: payload.opening,
        closing: payload.closing,
        rtt: payload.rtt,
        supervisorId: currentUser.id,
        supervisorName: currentUser.name,
        previousDayClosing,
        discrepancyFlag: openingEdited,
        discrepancyComment: payload.discrepancyComment?.trim() || null,
      },
      { new: true, upsert: true, runValidators: true }
    );

    // Notify admin if opening meter differs from previous closing
    if (openingEdited) {
      await notifyAdminMeterDiscrepancy({
        stationId: payload.stationId,
        stationName: currentUser.stationName || 'Unknown Station',
        supervisorName: currentUser.name,
        pumpLabel: pumpLabel,
        opening: payload.opening,
        previousClosing: previousDayClosing,
        comment: payload.discrepancyComment?.trim() || '',
        readingId: reading._id,
      });
    }

    return NextResponse.json({ reading }, { status: 201 });
  } catch (error) {
    console.error('Error saving meter reading:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Failed to save meter reading' }, { status: 500 });
  }
}
