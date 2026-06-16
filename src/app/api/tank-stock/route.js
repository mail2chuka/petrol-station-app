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

    const bypassRoles = [ROLES.ADMIN, ROLES.DAILY_AUDITOR, ROLES.EXTERNAL_AUDITOR];
    if (!bypassRoles.includes(currentUser.role) && currentUser.stationId !== stationId) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    // ── Special mode: last closing dipstick per tank ──────────────────────────
    if (searchParams.get('lastPerTank')) {
      const mongoose = require('mongoose');
      const stationObjId = new mongoose.Types.ObjectId(stationId);
      const lastClosings = await TankStockEntry.aggregate([
        { $match: { stationId: stationObjId, period: 'closing', closingStockMeasured: { $ne: null } } },
        { $sort: { date: -1, createdAt: -1 } },
        {
          $group: {
            _id: '$tankId',
            tankId:               { $first: '$tankId' },
            tankLabel:            { $first: '$tankLabel' },
            product:              { $first: '$product' },
            closingStockMeasured: { $first: '$closingStockMeasured' },
            date:                 { $first: '$date' },
            supervisorName:       { $first: '$supervisorName' },
          },
        },
        { $sort: { product: 1, tankLabel: 1 } },
      ]);
      return NextResponse.json({ lastClosings });
    }

    const query = { stationId };

    const month = searchParams.get('month'); // YYYY-MM
    if (month) {
      const [y, m] = month.split('-').map(Number);
      query.date = { $gte: new Date(y, m - 1, 1), $lte: new Date(y, m, 0, 23, 59, 59, 999) };
    } else if (date) {
      const startDate = new Date(date + 'T00:00:00.000Z');
      const endDate = new Date(date + 'T23:59:59.999Z');
      query.date = { $gte: startDate, $lte: endDate };
    }

    const entries = await TankStockEntry.find(query).sort({ date: -1, tankLabel: 1 });
    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Error fetching tank stock:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch tank stock' }, { status: 500 });
  }
}

// POST /api/tank-stock
// action=admin-seed  — admin seeds initial dipstick value for a new tank (admin only)
// Supervisors can submit opening or closing entries for their station.
// Managers and admins can submit closing entries only.
export async function POST(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const body = await request.json();

    // ── ADMIN SEED ACTION ────────────────────────────────────────────────────
    if (body.action === 'admin-seed') {
      if (currentUser.role !== ROLES.ADMIN) {
        return NextResponse.json({ error: 'Only admins can seed tank readings.' }, { status: 403 });
      }
      const { stationId, tankId, seedValue } = body;
      if (!stationId || !tankId || seedValue === undefined) {
        return NextResponse.json({ error: 'stationId, tankId, and seedValue are required.' }, { status: 400 });
      }
      const val = Number(seedValue);
      if (!Number.isFinite(val) || val < 0) {
        return NextResponse.json({ error: 'seedValue must be a non-negative number.' }, { status: 400 });
      }
      const station = await Station.findById(stationId).lean();
      if (!station) {
        return NextResponse.json({ error: 'Station not found.' }, { status: 404 });
      }
      const tank = station.tanks?.find((t) => t._id === tankId);
      if (!tank) {
        return NextResponse.json({ error: 'Tank not found in this station.' }, { status: 404 });
      }
      // Fixed date in the past — never conflicts with real shift records
      const seedDate = new Date('2000-01-01T00:00:00.000Z');
      const commonFields = {
        stationId,
        stationName: station.name,
        tankId,
        tankLabel: tank.label || tankId,
        product: tank.product,
        date: seedDate,
        openingStock: val,
        closingStockMeasured: val,
        supervisorId: currentUser.id,
        supervisorName: currentUser.name,
        variance: 0,
        variancePercent: 0,
        notes: 'Admin seed',
      };
      // Upsert both opening and closing so supervisors can pick up the value
      const [openingEntry, closingEntry] = await Promise.all([
        TankStockEntry.findOneAndUpdate(
          { stationId, tankId, date: seedDate, period: 'opening' },
          { $set: { ...commonFields, period: 'opening' } },
          { new: true, upsert: true, runValidators: false }
        ),
        TankStockEntry.findOneAndUpdate(
          { stationId, tankId, date: seedDate, period: 'closing' },
          { $set: { ...commonFields, period: 'closing' } },
          { new: true, upsert: true, runValidators: false }
        ),
      ]);
      return NextResponse.json({ openingEntry, closingEntry }, { status: 201 });
    }

    // ── REGULAR SUPERVISOR / MANAGER ACTIONS ─────────────────────────────────
    const isSupervisor = currentUser.role === ROLES.SUPERVISOR;
    const isManagerOrAdmin = [ROLES.MANAGER, ROLES.ADMIN].includes(currentUser.role);

    if (!isSupervisor && !isManagerOrAdmin) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const payload = createSchema.parse(body);

    if (isManagerOrAdmin && payload.period !== 'closing') {
      return NextResponse.json(
        { error: 'Managers can only submit closing stock entries' },
        { status: 403 }
      );
    }

    // Station access: managers only their own station
    if (currentUser.role === ROLES.MANAGER && currentUser.stationId !== payload.stationId) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }
    if (isSupervisor && currentUser.stationId !== payload.stationId) {
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

    const startDate = new Date(payload.date + 'T00:00:00.000Z');
    const endDate = new Date(payload.date + 'T23:59:59.999Z');

    // For closing entries: look up today's opening entry to get openingStock
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

    const closingStockMeasured = payload.stockValue;
    const variance = closingStockMeasured - openingStock;
    const variancePercent = openingStock > 0 ? (variance / openingStock) * 100 : 0;

    const updateData = {
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
    };

    // Tag manager-submitted entries
    if (isManagerOrAdmin) {
      updateData.managerId = currentUser.id;
      updateData.managerName = currentUser.name;
    }

    const entry = await TankStockEntry.findOneAndUpdate(
      {
        stationId: payload.stationId,
        tankId: payload.tankId,
        date: { $gte: startDate, $lte: endDate },
        period: payload.period,
      },
      updateData,
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
