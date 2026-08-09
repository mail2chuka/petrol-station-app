import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import PumpOpening from '@/models/PumpOpening';
import Station from '@/models/Station';
import DayShift from '@/models/DayShift';
import { requireAuth } from '@/lib/auth';
import { ROLES, DAY_STATUS } from '@/lib/constants';

const pumpOpeningSchema = z.object({
  stationId: z.string(),
  date: z.string(),
  pumpIds: z.array(z.string().min(1)).min(1),
});

// GET /api/pump-openings?stationId=...&date=YYYY-MM-DD
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const date = searchParams.get('date');

    if (!stationId) {
      return NextResponse.json({ error: 'stationId is required' }, { status: 400 });
    }

    if (currentUser.role !== ROLES.ADMIN && currentUser.stationId !== stationId) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    const query = { stationId };
    if (date) {
      query.date = {
        $gte: new Date(date + 'T00:00:00.000Z'),
        $lte: new Date(date + 'T23:59:59.999Z'),
      };
    }

    const openings = await PumpOpening.find(query).sort({ date: -1, createdAt: -1 });
    return NextResponse.json({ openings });
  } catch (error) {
    console.error('Error fetching pump openings:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch pump openings' }, { status: 500 });
  }
}

// POST /api/pump-openings
export async function POST(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (![ROLES.ADMIN, ROLES.MANAGER].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Only manager or admin can open pumps' }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = pumpOpeningSchema.parse(body);

    if (currentUser.role === ROLES.MANAGER && currentUser.stationId !== validatedData.stationId) {
      return NextResponse.json({ error: 'Managers can only manage their own station' }, { status: 403 });
    }

    const station = await Station.findById(validatedData.stationId);
    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const startDate = new Date(validatedData.date + 'T00:00:00.000Z');
    const endDate = new Date(validatedData.date + 'T23:59:59.999Z');

    // Status, not date, is what proves a shift is active right now — a
    // shift begun yesterday and still running past midnight keeps its
    // original DayShift.date, so a date-scoped check here would wrongly
    // reject it (mirrors the "already active" check in begin/route.js).
    const activeDay = await DayShift.findOne({
      stationId: validatedData.stationId,
      status: DAY_STATUS.IN_PROGRESS,
    });

    if (!activeDay) {
      return NextResponse.json({ error: 'Start shift before opening pumps' }, { status: 400 });
    }

    const validPumpIds = new Set((station.dispensers || []).map(d => d.dispenserId));
    const invalidPump = validatedData.pumpIds.find(p => !validPumpIds.has(p));
    if (invalidPump) {
      return NextResponse.json({ error: `Invalid pump: ${invalidPump}` }, { status: 400 });
    }

    const pumps = validatedData.pumpIds.map((pumpId) => {
      const dispenser = station.dispensers.find(d => d.dispenserId === pumpId);
      return {
        _id: pumpId,
        pumpLabel: dispenser?.name || pumpId,
        openedAt: new Date(),
        addedLate: false,
      };
    });

    const opening = await PumpOpening.findOneAndUpdate(
      {
        stationId: validatedData.stationId,
        date: { $gte: startDate, $lte: endDate },
      },
      {
        $setOnInsert: {
          stationId: validatedData.stationId,
          stationName: station.name,
          date: startDate, // UTC midnight
          openedByManagerId: currentUser.id,
          openedByManagerName: currentUser.name,
          pumps,
        },
      },
      { new: true, upsert: true }
    );

    return NextResponse.json({ opening }, { status: 201 });
  } catch (error) {
    console.error('Error opening pumps:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Failed to open pumps' }, { status: 500 });
  }
}
