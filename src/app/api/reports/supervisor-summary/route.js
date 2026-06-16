import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import MeterReading from '@/models/MeterReading';
import TankStockEntry from '@/models/TankStockEntry';
import Station from '@/models/Station';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// GET /api/reports/supervisor-summary?from=YYYY-MM-DD&to=YYYY-MM-DD[&stationId=...]
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to') || from;

    // Supervisors are scoped to their own station; admin may pass stationId
    const stationId =
      currentUser.role === ROLES.SUPERVISOR
        ? currentUser.stationId
        : searchParams.get('stationId');

    if (!stationId || !from) {
      return NextResponse.json({ error: 'stationId and from are required' }, { status: 400 });
    }

    if (currentUser.role !== ROLES.ADMIN && currentUser.stationId !== stationId) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    const startDate = new Date(from + 'T00:00:00.000Z');
    const endDate = new Date(to + 'T23:59:59.999Z');
    const stationObjectId = new mongoose.Types.ObjectId(stationId);

    const [readings, tankEntries, station] = await Promise.all([
      MeterReading.find({
        stationId: stationObjectId,
        date: { $gte: startDate, $lte: endDate },
        opening: { $ne: null },
      }).sort({ date: 1, pumpLabel: 1 }).lean(),

      TankStockEntry.find({
        stationId: stationObjectId,
        date: { $gte: startDate, $lte: endDate },
      }).lean(),

      Station.findById(stationId).lean(),
    ]);

    // pumpId → fuelType from station's dispenser list
    const pumpFuelMap = {};
    for (const d of (station?.dispensers || [])) {
      pumpFuelMap[d.dispenserId] = d.fuelType;
    }

    // Prefer closing entry per tank; fall back to opening for in-progress shifts.
    const bestEntryByTankDate = {};
    for (const t of tankEntries) {
      const dateKey = new Date(t.date).toISOString().split('T')[0];
      const key = `${dateKey}:${t.tankId}`;
      if (!bestEntryByTankDate[key] || t.period === 'closing') {
        bestEntryByTankDate[key] = t;
      }
    }
    // date+product → total closing stock (sum across tanks, one entry per tank)
    const tankStockMap = {};
    for (const t of Object.values(bestEntryByTankDate)) {
      const dateKey = new Date(t.date).toISOString().split('T')[0];
      const product = t.product || '';
      if (!tankStockMap[dateKey]) tankStockMap[dateKey] = {};
      tankStockMap[dateKey][product] =
        (tankStockMap[dateKey][product] || 0) +
        (t.closingStockManager ?? t.closingStockMeasured ?? 0);
    }

    const rows = readings.map(r => {
      const dateKey = new Date(r.date).toISOString().split('T')[0];
      const fuelType = pumpFuelMap[r.pumpId] || '';
      const difference = r.closing != null ? r.closing - r.opening : null;
      const rtt = r.rtt ?? 0;
      const actualSold = difference != null ? difference - rtt : null;
      const tankClosingStock = tankStockMap[dateKey]?.[fuelType] ?? null;

      return {
        date: dateKey,
        pumpId: r.pumpId,
        pumpLabel: r.pumpLabel || r.pumpId,
        fuelType,
        opening: r.opening,
        closing: r.closing,
        difference,
        rtt,
        actualSold,
        tankClosingStock,
        discrepancyFlag: r.discrepancyFlag,
        supervisorName: r.supervisorName,
      };
    });

    return NextResponse.json({ rows });
  } catch (error) {
    console.error('Error generating supervisor summary:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate report' },
      { status: 500 }
    );
  }
}
