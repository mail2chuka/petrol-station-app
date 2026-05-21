import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import TankStockEntry from '@/models/TankStockEntry';
import Station from '@/models/Station';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

const createSchema = z.object({
  stationId: z.string().min(1),
  tankId: z.string().min(1),
  date: z.string().min(1),
  period: z.enum(['opening', 'closing']),
  stockValue: z.number().min(0),
  notes: z.string().optional(),
});

// GET /api/tank-stock?stationId=&date=YYYY-MM-DD
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
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    }

    const entries = await TankStockEntry.find(query).sort({ date: -1, tankLabel: 1 });
    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Error fetching tank stock:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch tank stock' }, { status: 500 });
  }
}

// POST /api/tank-stock — supervisor submits opening or closing stock for one tank
export async function POST(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (currentUser.role !== ROLES.SUPERVISOR) {
      return NextResponse.json({ error: 'Only supervisors can submit tank stock entries' }, { status: 403 });
    }

    const payload = createSchema.parse(await request.json());

    if (currentUser.stationId !== payload.stationId) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    const station = await Station.findById(payload.stationId);
    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const tank = station.tanks?.find((t) => t._id === payload.tankId);
    if (!tank) {
      return NextResponse.json({ error: 'Tank not found in this station' }, { status: 404 });
    }

    const startDate = new Date(payload.date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(payload.date);
    endDate.setHours(23, 59, 59, 999);

    // For closing: look up today's opening entry to get openingStock
    let openingStock = payload.stockValue;
    if (payload.period === 'closing') {
      const openingEntry = await TankStockEntry.findOne({
        stationId: payload.stationId,
        tankId: payload.tankId,
        date: { $gte: startDate, $lte: endDate },
        period: 'opening',
      });
      if (openingEntry) {
        openingStock = openingEntry.openingStock;
      }
    }

    const closingStockMeasured = payload.period === 'closing' ? payload.stockValue : payload.stockValue;
    const variance = closingStockMeasured - openingStock;
    const variancePercent = openingStock > 0 ? (variance / openingStock) * 100 : 0;

    const entry = await TankStockEntry.findOneAndUpdate(
      {
        stationId: payload.stationId,
        tankId: payload.tankId,
        date: { $gte: startDate, $lte: endDate },
        period: payload.period,
      },
      {
        stationId: payload.stationId,
        stationName: station.name,
        tankId: payload.tankId,
        tankLabel: tank.label || payload.tankId,
        product: tank.product,
        date: startDate,
        period: payload.period,
        openingStock,
        closingStockMeasured,
        supervisorId: currentUser.id,
        supervisorName: currentUser.name,
        variance,
        variancePercent,
        notes: payload.notes || '',
      },
      { new: true, upsert: true, runValidators: true }
    );

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error('Error saving tank stock entry:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Failed to save tank stock entry' }, { status: 500 });
  }
}
