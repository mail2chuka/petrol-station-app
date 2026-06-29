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
import { reconcile, expectedTolerance, resolveTolerancePercent } from '@/lib/reconciliation';

function buildDateRange(from, to) {
  const start = new Date(from + 'T00:00:00.000Z');
  const end = new Date((to || from) + 'T23:59:59.999Z');
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

    const auditorRoles = [ROLES.DAILY_AUDITOR, ROLES.EXTERNAL_AUDITOR];
    if (currentUser.role !== ROLES.ADMIN && !auditorRoles.includes(currentUser.role) && currentUser.stationId !== stationId) {
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

    // Build pump maps from station dispensers
    const pumpFuelTypeMap = {};   // dispenserId → fuelType
    const pumpTankMap = {};       // dispenserId → tankId  (for per-tank sales attribution)
    for (const d of (station?.dispensers || [])) {
      pumpFuelTypeMap[d.dispenserId] = d.fuelType;
      if (d.tankId) pumpTankMap[d.dispenserId] = d.tankId;
    }

    const rows = [];
    const emitted = new Set(); // `${dayKey}:${fuelType}` rows already produced

    // Truck-offload delivery shortage/excess per day & product (from receipts
    // flagged isOffload). Accumulates whether or not a day shift exists.
    const deliveryByDayProduct = {};
    for (const m of stockIns) {
      if (!m.isOffload) continue;
      const dk = new Date(m.date).toISOString().split('T')[0];
      const ft = m.fuelType;
      const v = m.offloadVariance ?? 0;
      if (!deliveryByDayProduct[dk]) deliveryByDayProduct[dk] = {};
      if (!deliveryByDayProduct[dk][ft]) deliveryByDayProduct[dk][ft] = { shortage: 0, excess: 0, offloaded: 0 };
      const slot = deliveryByDayProduct[dk][ft];
      slot.offloaded += m.actualOffloaded || 0;
      if (v < 0) slot.shortage += -v;
      else if (v > 0) slot.excess += v;
    }

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

      // Determine litres sold per pump. Prefer the supervisor's SalesEntry; when a
      // pump has no sales entry, fall back to its meter reading net
      // (closing − opening − rtt) so days with readings-but-no-sales-entry still
      // reconcile correctly instead of flagging the whole dipstick drop as shortage.
      const dispenserSales = {}; // dispenserId → liters
      for (const sale of daySales) {
        dispenserSales[sale.dispenserId] = (dispenserSales[sale.dispenserId] || 0) + sale.liters;
      }
      for (const r of dayReadings) {
        if (dispenserSales[r.pumpId] == null && r.closing != null) {
          dispenserSales[r.pumpId] = Math.max(0, (r.closing || 0) - (r.opening || 0) - (r.rtt || 0));
        }
      }

      // Attribute per-pump sales to specific tanks using pump→tank mapping.
      // For pumps not mapped to a tank, fall back to fuel-type grouping.
      const salesByTank = {};        // tankId → liters
      const salesByFuelFallback = {}; // fuelType → liters (for unmapped pumps)
      for (const [dispenserId, liters] of Object.entries(dispenserSales)) {
        const tankId = pumpTankMap[dispenserId];
        if (tankId) {
          salesByTank[tankId] = (salesByTank[tankId] || 0) + liters;
        } else {
          const ft = pumpFuelTypeMap[dispenserId];
          if (ft) salesByFuelFallback[ft] = (salesByFuelFallback[ft] || 0) + liters;
        }
      }

      // Aggregate opening stock, stock in, closing stock, and sales by product across all tanks.
      // Group by tankId+period first to avoid double-counting when both an opening and a closing
      // entry exist for the same tank on the same day.
      const productAgg = {};
      const entriesByTankPeriod = {};
      for (const t of dayTankEntries) {
        entriesByTankPeriod[`${t.tankId}:${t.period}`] = t;
      }
      const uniqueTankIds = [...new Set(dayTankEntries.map(t => t.tankId))];
      for (const tankId of uniqueTankIds) {
        // Prefer the closing entry (it carries openingStock forward from the opening entry).
        // Fall back to the opening-only entry for in-progress shifts.
        const closingEntry = entriesByTankPeriod[`${tankId}:closing`];
        const openingEntry = entriesByTankPeriod[`${tankId}:opening`];
        const entry = closingEntry || openingEntry;
        if (!entry) continue;
        const fuelType = entry.product;
        if (!productAgg[fuelType]) {
          productAgg[fuelType] = { openingStock: 0, stockIn: 0, closingStock: 0, sales: 0 };
        }
        productAgg[fuelType].openingStock += entry.openingStock || 0;
        productAgg[fuelType].stockIn += dayStockIns
          .flatMap((movement) => movement.distribution || [])
          .filter((d) => d.tankId === tankId)
          .reduce((sum, d) => sum + d.litres, 0);
        // Only closing entries have a real measured closing stock
        if (closingEntry) {
          productAgg[fuelType].closingStock +=
            closingEntry.closingStockManager ?? closingEntry.closingStockMeasured ?? 0;
        }
        // Sales attributed via pump→tank mapping for this specific tank
        productAgg[fuelType].sales += salesByTank[tankId] || 0;
      }
      // Add fallback sales for pumps not mapped to a specific tank
      for (const [ft, liters] of Object.entries(salesByFuelFallback)) {
        if (productAgg[ft]) productAgg[ft].sales += liters;
      }

      // Per-day tolerance snapshot (set at price time), else station's current value.
      const tolerancePercent = resolveTolerancePercent(dayShift, station);

      for (const [fuelType, agg] of Object.entries(productAgg)) {
        // Sales liters from SalesEntry are already NET (supervisor enters closing-opening-rtt).
        const salesLitres = agg.sales;
        const priceForDay = dayShift.pricesAtStart?.[fuelType] || 0;
        const totalAmount = priceForDay * salesLitres;
        const { shortage, overage } = reconcile({
          opening: agg.openingStock,
          stockIn: agg.stockIn,
          sales: salesLitres,
          closing: agg.closingStock,
        });
        // expectedTolerance = sales × tolerance %
        const expTolerance = expectedTolerance(salesLitres, tolerancePercent);

        // Fold in truck-delivery shortage/excess for this day & product.
        const delivery = deliveryByDayProduct[dayKey]?.[fuelType] || { shortage: 0, excess: 0 };

        rows.push({
          date: dayKey,
          openingTime: dayShift.startTime,
          product: fuelType,
          openingStock: agg.openingStock,
          stockIn: agg.stockIn,
          overage,
          sales: salesLitres,
          priceForDay,
          totalAmount,
          shortage: shortage + delivery.shortage,
          salesShortage: shortage,
          deliveryShortage: delivery.shortage,
          deliveryExcess: delivery.excess,
          closingStock: agg.closingStock,
          expectedTolerance: expTolerance,
          tolerancePercent,
        });
        emitted.add(`${dayKey}:${fuelType}`);
      }
    }

    // Days/products that had truck deliveries but no shift row — surface their
    // delivery shortage so it still counts in the report and totals.
    for (const [dk, byProduct] of Object.entries(deliveryByDayProduct)) {
      for (const [ft, slot] of Object.entries(byProduct)) {
        if (emitted.has(`${dk}:${ft}`)) continue;
        rows.push({
          date: dk,
          openingTime: null,
          product: ft,
          openingStock: 0,
          stockIn: slot.offloaded,
          overage: 0,
          sales: 0,
          priceForDay: 0,
          totalAmount: 0,
          shortage: slot.shortage,
          salesShortage: 0,
          deliveryShortage: slot.shortage,
          deliveryExcess: slot.excess,
          closingStock: 0,
          expectedTolerance: 0,
          tolerancePercent: 0,
        });
      }
    }

    // Keep chronological order (appended delivery-only rows may be out of order)
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.product.localeCompare(b.product)));

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
        'Net Sales (Litres Sold)',
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
