import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import DayShift from '@/models/DayShift';
import SalesEntry from '@/models/SalesEntry';
import StockMovement from '@/models/StockMovement';
import MeterReading from '@/models/MeterReading';
import TankStockEntry from '@/models/TankStockEntry';
import Station from '@/models/Station';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

function buildDateRange(from, to) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to || from);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// GET /api/reports/summary-book?stationId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const from = searchParams.get('from');
    const to = searchParams.get('to') || from;

    if (!stationId || !from) {
      return NextResponse.json({ error: 'stationId and from are required' }, { status: 400 });
    }

    if (currentUser.role !== ROLES.ADMIN && currentUser.stationId !== stationId) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    const { start, end } = buildDateRange(from, to);

    const stationObjectId = new mongoose.Types.ObjectId(stationId);

    const [station, dayShifts, sales, stockIns, readings, tankEntries] = await Promise.all([
      Station.findById(stationId).lean(),
      DayShift.aggregate([
        { $match: { stationId: stationObjectId, date: { $gte: start, $lte: end } } },
        { $sort: { date: 1 } },
      ]),
      SalesEntry.aggregate([
        { $match: { stationId: stationObjectId, date: { $gte: start, $lte: end } } },
      ]),
      StockMovement.aggregate([
        { $match: { stationId: stationObjectId, movementType: 'receipt', date: { $gte: start, $lte: end } } },
      ]),
      MeterReading.aggregate([
        { $match: { stationId: stationObjectId, date: { $gte: start, $lte: end } } },
      ]),
      TankStockEntry.aggregate([
        { $match: { stationId: stationObjectId, date: { $gte: start, $lte: end } } },
      ]),
    ]);

    // Build a reliable pumpId → fuelType map from the station's dispensers
    const pumpFuelTypeMap = {};
    for (const d of (station?.dispensers || [])) {
      pumpFuelTypeMap[d.dispenserId] = d.fuelType;
    }

    const rows = [];

    for (const dayShift of dayShifts) {
      const dayKey = new Date(dayShift.date).toISOString().split('T')[0];

      const dayTankEntries = tankEntries.filter(
        (t) => new Date(t.date).toISOString().split('T')[0] === dayKey
      );

      const dayStockIns = stockIns.filter(
        (s) => new Date(s.date).toISOString().split('T')[0] === dayKey
      );

      const daySales = sales.filter(
        (s) => new Date(s.date).toISOString().split('T')[0] === dayKey
      );

      const dayReadings = readings.filter(
        (r) => new Date(r.date).toISOString().split('T')[0] === dayKey
      );

      const salesByFuel = daySales.reduce(
        (acc, item) => {
          acc[item.fuelType] = (acc[item.fuelType] || 0) + item.liters;
          return acc;
        },
        {}
      );

      const rttByFuel = dayReadings.reduce((acc, item) => {
        const fuelType = pumpFuelTypeMap[item.pumpId] || (item.pumpLabel?.toUpperCase().includes('AGO') ? 'AGO' : 'PMS');
        acc[fuelType] = (acc[fuelType] || 0) + item.rtt;
        return acc;
      }, {});

      for (const tank of dayTankEntries) {
        const openingStock = tank.openingStock || 0;
        const stockIn = dayStockIns
          .flatMap((movement) => movement.distribution || [])
          .filter((d) => d.tankId === tank.tankId)
          .reduce((sum, d) => sum + d.litres, 0);

        const fuelType = tank.product;
        const salesLitres = (salesByFuel[fuelType] || 0) - (rttByFuel[fuelType] || 0);
        const priceForDay = dayShift.pricesAtStart?.[fuelType] || 0;
        const totalAmount = priceForDay * salesLitres;
        const closingStock = tank.closingStockManager ?? tank.closingStockMeasured ?? 0;
        const expectedClosing = openingStock + stockIn - salesLitres;
        const shortage = Math.max(0, expectedClosing - closingStock);
        const overage = Math.max(0, closingStock - expectedClosing);

        rows.push({
          date: dayKey,
          openingTime: dayShift.startTime,
          tankId: tank.tankId,
          tankLabel: tank.tankLabel || tank.tankId,
          product: fuelType,
          openingStock,
          stockIn,
          overage,
          sales: salesLitres,
          priceForDay,
          totalAmount,
          shortage,
          closingStock,
        });
      }
    }

    return NextResponse.json({
      stationId,
      from,
      to,
      columns: [
        'Date',
        'Opening Time',
        'Opening Stock',
        'Stock In',
        'Overage',
        'Sales (= Dispensed - RTT)',
        'Price for the Day',
        'Total Amount (= Price x Sales)',
        'Shortage',
        'Closing Stock',
      ],
      rows,
    });
  } catch (error) {
    console.error('Error generating summary book:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate summary book' }, { status: 500 });
  }
}
