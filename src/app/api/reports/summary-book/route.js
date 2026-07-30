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

function dayKeyOf(date) {
  return new Date(date).toISOString().split('T')[0];
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
        { $sort: { date: 1, shiftOrder: 1 } },
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

    // Group shifts by calendar day, in shift order, so multi-shift days emit
    // one row per shift per product instead of collapsing to a single row.
    const shiftsByDay = {};
    for (const ds of dayShifts) {
      const dk = dayKeyOf(ds.date);
      if (!shiftsByDay[dk]) shiftsByDay[dk] = [];
      shiftsByDay[dk].push(ds);
    }

    // A doc with no dayShiftId predates multi-shift support for that date.
    // It can only ever belong to the earliest shift on that date — the one
    // that existed before a second shift was added (e.g. via backfill's "add
    // another shift for this date" on a day that already had real live data)
    // — never to a shift created afterward, which always gets a real
    // dayShiftId stamped on everything it writes.
    const earliestShiftIdByDay = {};
    for (const [dk, list] of Object.entries(shiftsByDay)) {
      const earliest = [...list].sort((a, b) =>
        (a.shiftOrder || 1) - (b.shiftOrder || 1) || String(a._id).localeCompare(String(b._id))
      )[0];
      earliestShiftIdByDay[dk] = String(earliest._id);
    }

    // StockMovement (truck deliveries/receipts) now carries its own dayShiftId
    // going forward — use it directly when present. Only movements recorded
    // before that field existed fall back to the same earliest-shift rule as
    // meter/tank readings (they can only belong to the date's earliest shift).
    // Deliveries on a date with no shift at all fall back to a day-level bucket.
    function attributedShiftFor(movement) {
      const dk = dayKeyOf(movement.date);
      const candidates = shiftsByDay[dk] || [];
      if (!candidates.length) return null;
      if (movement.dayShiftId) {
        return candidates.find((s) => String(s._id) === String(movement.dayShiftId)) || null;
      }
      const earliestId = earliestShiftIdByDay[dk];
      return candidates.find((s) => String(s._id) === earliestId) || null;
    }

    // dayShiftId → StockMovement[] for that shift (all receipts, not just offloads)
    const stockInsByShiftId = {};
    // dayKey → StockMovement[] for movements on a date with no shift at all
    const orphanStockInsByDay = {};
    for (const m of stockIns) {
      const shift = attributedShiftFor(m);
      if (shift) {
        (stockInsByShiftId[shift._id] ||= []).push(m);
      } else {
        const dk = dayKeyOf(m.date);
        (orphanStockInsByDay[dk] ||= []).push(m);
      }
    }

    function deliveryShortageByProduct(movements) {
      const out = {}; // fuelType → {shortage, excess, offloaded}
      for (const m of movements) {
        if (!m.isOffload) continue;
        const ft = m.fuelType;
        const v = m.offloadVariance ?? 0;
        if (!out[ft]) out[ft] = { shortage: 0, excess: 0, offloaded: 0 };
        out[ft].offloaded += m.actualOffloaded || 0;
        if (v < 0) out[ft].shortage += -v;
        else if (v > 0) out[ft].excess += v;
      }
      return out;
    }

    const rows = [];
    const emittedShiftProduct = new Set(); // `${dayShiftId}:${fuelType}` rows already produced

    for (const dayShift of dayShifts) {
      const dayKey = dayKeyOf(dayShift.date);
      const isEarliestShiftForDay = String(dayShift._id) === earliestShiftIdByDay[dayKey];

      // Must also check the doc's own date: tankEntries/readings span the
      // whole requested range, so without this a null-dayShiftId doc from
      // any day would match every eligible day in the range, collapsing
      // the entire month onto whichever doc happened to be filtered in last.
      const belongsToShift = (doc) =>
        dayKeyOf(doc.date) === dayKey &&
        (doc.dayShiftId ? String(doc.dayShiftId) === String(dayShift._id) : isEarliestShiftForDay);

      const dayTankEntries = tankEntries.filter(belongsToShift);
      const daySales = sales.filter((s) => String(s.dayShiftId) === String(dayShift._id));
      const dayReadings = readings.filter(belongsToShift);
      const dayStockIns = stockInsByShiftId[dayShift._id] || [];
      const deliveryByProduct = deliveryShortageByProduct(dayStockIns);

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
      // entry exist for the same tank on the same shift.
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

      // Per-shift tolerance snapshot (set at price time), else station's current value.
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

        // Fold in truck-delivery shortage/excess attributed to this shift & product.
        const delivery = deliveryByProduct[fuelType] || { shortage: 0, excess: 0 };

        rows.push({
          date: dayKey,
          openingTime: dayShift.startTime,
          shiftKey: dayShift.shiftKey || 'default',
          shiftLabel: dayShift.shiftLabel || 'Full Day',
          shiftOrder: dayShift.shiftOrder || 1,
          dayShiftId: String(dayShift._id),
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
        emittedShiftProduct.add(`${dayShift._id}:${fuelType}`);
      }

      // Products that had a delivery attributed to this shift but the shift
      // never produced a tank-stock row for that product (e.g. tank not yet
      // dipped) — surface the delivery shortage so it still counts.
      for (const [ft, slot] of Object.entries(deliveryByProduct)) {
        if (emittedShiftProduct.has(`${dayShift._id}:${ft}`)) continue;
        rows.push({
          date: dayKey,
          openingTime: null,
          shiftKey: dayShift.shiftKey || 'default',
          shiftLabel: dayShift.shiftLabel || 'Full Day',
          shiftOrder: dayShift.shiftOrder || 1,
          dayShiftId: String(dayShift._id),
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
        emittedShiftProduct.add(`${dayShift._id}:${ft}`);
      }
    }

    // Deliveries on a date with no shift at all — surface as a day-level row.
    for (const [dk, movements] of Object.entries(orphanStockInsByDay)) {
      const byProduct = deliveryShortageByProduct(movements);
      for (const [ft, slot] of Object.entries(byProduct)) {
        rows.push({
          date: dk,
          openingTime: null,
          shiftKey: 'default',
          shiftLabel: 'Full Day',
          shiftOrder: 1,
          dayShiftId: null,
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

    // Latest date first; within a date, shift order then product.
    rows.sort((a, b) =>
      a.date > b.date ? -1 : a.date < b.date ? 1 :
      a.shiftOrder !== b.shiftOrder ? a.shiftOrder - b.shiftOrder :
      a.product.localeCompare(b.product)
    );

    return NextResponse.json({
      stationId,
      from,
      to,
      rows,
    });
  } catch (error) {
    console.error('Error generating summary book:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate summary book' }, { status: 500 });
  }
}
