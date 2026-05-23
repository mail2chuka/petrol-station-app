import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import MeterReading from '@/models/MeterReading';
import PumpOpening from '@/models/PumpOpening';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

const meterReadingSchema = z.object({
  stationId: z.string(),
  pumpId: z.string(),
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
      query.date = { $gte: new Date(y, m - 1, 1), $lte: new Date(y, m, 0, 23, 59, 59, 999) };
    } else if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
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

    const startDate = new Date(payload.date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(payload.date);
    endDate.setHours(23, 59, 59, 999);

    const opening = await PumpOpening.findOne({
      stationId: payload.stationId,
      date: { $gte: startDate, $lte: endDate },
    });

    if (!opening) {
      return NextResponse.json({ error: 'Manager must open pumps for the day first' }, { status: 409 });
    }

    const openPump = opening.pumps.find(p => p._id === payload.pumpId);
    if (!openPump) {
      return NextResponse.json({ error: 'This pump is not in today open-pumps list' }, { status: 409 });
    }

    const previousDayEnd = new Date(startDate);
    previousDayEnd.setDate(previousDayEnd.getDate() - 1);
    previousDayEnd.setHours(23, 59, 59, 999);

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
        pumpLabel: openPump.pumpLabel || payload.pumpId,
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

    return NextResponse.json({ reading }, { status: 201 });
  } catch (error) {
    console.error('Error saving meter reading:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Failed to save meter reading' }, { status: 500 });
  }
}
