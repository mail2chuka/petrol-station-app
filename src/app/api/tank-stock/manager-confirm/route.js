import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import TankStockEntry from '@/models/TankStockEntry';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

const patchSchema = z.object({
  entryId: z.string().min(1),
  closingStockManager: z.number().min(0),
});

// GET /api/tank-stock/manager-confirm?stationId=...&date=YYYY-MM-DD
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const date = searchParams.get('date');

    if (!stationId || !date) {
      return NextResponse.json({ error: 'stationId and date are required' }, { status: 400 });
    }

    if (currentUser.role !== ROLES.ADMIN && currentUser.stationId !== stationId) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const entries = await TankStockEntry.find({
      stationId,
      date: { $gte: startDate, $lte: endDate },
      period: 'closing',
    }).sort({ tankLabel: 1 });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Error fetching tank stock entries:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch tank stock entries' }, { status: 500 });
  }
}

// PATCH /api/tank-stock/manager-confirm
export async function PATCH(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (![ROLES.MANAGER, ROLES.ADMIN].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Only manager/admin can confirm closing stock' }, { status: 403 });
    }

    const payload = patchSchema.parse(await request.json());

    const entry = await TankStockEntry.findById(payload.entryId);
    if (!entry) {
      return NextResponse.json({ error: 'Tank stock entry not found' }, { status: 404 });
    }

    if (currentUser.role === ROLES.MANAGER && currentUser.stationId !== entry.stationId.toString()) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    entry.closingStockManager = payload.closingStockManager;
    entry.managerId = currentUser.id;
    entry.managerName = currentUser.name;
    await entry.save();

    return NextResponse.json({ entry });
  } catch (error) {
    console.error('Error confirming tank stock:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Failed to confirm tank stock' }, { status: 500 });
  }
}
