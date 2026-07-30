import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import Station from '@/models/Station';
import StockMovement from '@/models/StockMovement';
import Truck from '@/models/Truck';
import TankStockEntry from '@/models/TankStockEntry';
import DayShift from '@/models/DayShift';
import { requireAuth } from '@/lib/auth';
import { offloadSchema } from '@/lib/validation';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES, DAY_STATUS } from '@/lib/constants';

// POST /api/stations/[id]/stock - Record a truck offload (delivery)
// Body: { truckId, driverName?, driverPhone?, fuelType, declaredLoad, supplier?, cost?, notes?,
//         tanks: [{ tankId, openingDip, closingDip }] }
// Offloaded per tank = closingDip − openingDip; actualOffloaded = Σ; variance = actual − declared.
export async function POST(request, { params }) {
  let session = null;
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (![ROLES.ADMIN, ROLES.MANAGER].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const data = offloadSchema.parse(body);

    if (currentUser.role === ROLES.MANAGER && currentUser.stationId !== id) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    const station = await Station.findById(id);
    if (!station) return NextResponse.json({ error: 'Station not found' }, { status: 404 });

    const truck = await Truck.findById(data.truckId);
    if (!truck) return NextResponse.json({ error: 'Truck not found. Register it first.' }, { status: 404 });

    // Validate tanks & compute per-tank offload
    const stationTanks = new Map((station.tanks || []).map((t) => [t._id, t]));
    const offloadDistribution = [];
    for (const t of data.tanks) {
      const tank = stationTanks.get(t.tankId);
      if (!tank) return NextResponse.json({ error: `Tank ${t.tankId} not found at this station.` }, { status: 400 });
      if (tank.product !== data.fuelType) {
        return NextResponse.json({ error: `${tank.label} holds ${tank.product}, not ${data.fuelType}.` }, { status: 400 });
      }
      const offloaded = Number(t.closingDip) - Number(t.openingDip);
      if (offloaded < 0) {
        return NextResponse.json({ error: `${tank.label}: closing dipstick is lower than opening — check your readings.` }, { status: 400 });
      }
      offloadDistribution.push({
        tankId: t.tankId,
        tankLabel: tank.label || t.tankId,
        openingDip: Number(t.openingDip),
        closingDip: Number(t.closingDip),
        offloaded,
      });
    }

    const actualOffloaded = offloadDistribution.reduce((s, t) => s + t.offloaded, 0);
    if (actualOffloaded <= 0) {
      return NextResponse.json({ error: 'Total offloaded is zero — enter the closing dipstick readings.' }, { status: 400 });
    }
    const offloadVariance = actualOffloaded - data.declaredLoad; // − shortage, + excess

    const fuelType = data.fuelType;
    const previousStock = station.currentStock instanceof Map
      ? (station.currentStock.get(fuelType) ?? 0)
      : (station.currentStock?.[fuelType] ?? 0);
    const newStock = previousStock + actualOffloaded;

    session = await mongoose.startSession();
    session.startTransaction();

    // Attribute the delivery to whichever shift is currently running at this
    // station, so it shows up under that shift (not every shift) in reports
    // and the backfill wizard. No active shift (e.g. delivery arrives outside
    // operating hours) leaves it day-level, same as before this field existed.
    const activeShift = await DayShift.findOne({
      stationId: station._id,
      status: DAY_STATUS.IN_PROGRESS,
    }).session(session);

    if (station.currentStock instanceof Map) station.currentStock.set(fuelType, newStock);
    else station.currentStock[fuelType] = newStock;
    station.markModified('currentStock');
    await station.save({ session });

    const driverName = (data.driverName || truck.driverName || '').trim();
    const driverPhone = (data.driverPhone || truck.driverPhone || '').trim();
    const costVal = data.cost != null ? Number(data.cost) : null;

    const [movement] = await StockMovement.create([{
      stationId: station._id,
      stationName: station.name,
      date: new Date(),
      dayShiftId: activeShift?._id || null,
      fuelType,
      movementType: 'receipt',
      isOffload: true,
      truckId: truck._id,
      truckPlate: truck.plateNumber,
      driverName,
      driverPhone,
      declaredLoad: data.declaredLoad,
      actualOffloaded,
      offloadVariance,
      offloadDistribution,
      // Keep generic receipt fields populated so existing reports still work
      quantity: actualOffloaded,
      totalReceived: actualOffloaded,
      expectedQuantity: data.declaredLoad,
      varianceQuantity: offloadVariance,
      distribution: offloadDistribution.map((t) => ({ tankId: t.tankId, litres: t.offloaded })),
      costPerLiter: costVal != null && actualOffloaded > 0 ? costVal / actualOffloaded : null,
      totalCost: costVal,
      supplier: data.supplier || truck.plateNumber,
      previousStock,
      newStock,
      recordedBy: currentUser.id,
      recordedByName: currentUser.name,
      notes: data.notes || '',
    }], { session, ordered: true });

    // Keep each receiving tank's level live: upsert a closing dipstick entry with
    // the post-offload reading, so the dashboard / lastPerTank reflect the delivery
    // immediately. On a shift day, end-day later overwrites this with the true
    // end-of-day dipstick; the day's opening (if any) is preserved.
    const offloadDayStart = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z');
    const offloadDayEnd = new Date(new Date().toISOString().split('T')[0] + 'T23:59:59.999Z');
    for (const t of offloadDistribution) {
      const tank = stationTanks.get(t.tankId);
      const openingEntry = await TankStockEntry.findOne({
        stationId: station._id, tankId: t.tankId, period: 'opening',
        date: { $gte: offloadDayStart, $lte: offloadDayEnd },
      }).session(session);
      const openingStock = openingEntry?.openingStock ?? t.openingDip;
      const variance = t.closingDip - openingStock;
      const variancePercent = openingStock > 0 ? (variance / openingStock) * 100 : 0;
      await TankStockEntry.findOneAndUpdate(
        { stationId: station._id, tankId: t.tankId, period: 'closing', date: { $gte: offloadDayStart, $lte: offloadDayEnd } },
        {
          $set: {
            stationId: station._id,
            stationName: station.name,
            tankId: t.tankId,
            tankLabel: tank?.label || t.tankId,
            product: data.fuelType,
            date: offloadDayStart,
            period: 'closing',
            openingStock,
            closingStockMeasured: t.closingDip,
            supervisorId: currentUser.id,
            supervisorName: currentUser.name,
            variance,
            variancePercent,
            notes: `Truck offload (${truck.plateNumber})`,
          },
        },
        { session, upsert: true, runValidators: false, new: true }
      );
    }

    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.RECEIVE_STOCK,
      resource: AUDIT_RESOURCES.STOCK_MOVEMENT,
      resourceId: movement._id.toString(),
      stationId: station._id,
      stationName: station.name,
      details: {
        truck: truck.plateNumber,
        fuelType,
        declaredLoad: data.declaredLoad,
        actualOffloaded,
        offloadVariance,
      },
    });

    await session.commitTransaction();

    return NextResponse.json({
      movement,
      offload: {
        declaredLoad: data.declaredLoad,
        actualOffloaded,
        offloadVariance,
        shortage: offloadVariance < 0 ? -offloadVariance : 0,
        excess: offloadVariance > 0 ? offloadVariance : 0,
        previousStock,
        newStock,
      },
    });
  } catch (error) {
    if (session) { try { await session.abortTransaction(); } catch {} }
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error recording offload:', error);
    return NextResponse.json({ error: error.message || 'Failed to record offload' }, { status: 500 });
  } finally {
    if (session) { try { session.endSession(); } catch {} }
  }
}
