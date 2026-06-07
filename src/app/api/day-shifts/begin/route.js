import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import DayShift from '@/models/DayShift';
import Station from '@/models/Station';
import PriceHistory from '@/models/PriceHistory';
import PumpOpening from '@/models/PumpOpening';
import TankStockEntry from '@/models/TankStockEntry';
import { requireAuth } from '@/lib/auth';
import { beginDaySchema } from '@/lib/validation';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES, DAY_STATUS } from '@/lib/constants';
import { autoCloseExpiredInProgressShifts } from '@/lib/dayShiftLifecycle';

// POST /api/day-shifts/begin - Begin a new day
export async function POST(request) {
  let session = null;

  try {
    const currentUser = await requireAuth();
    await connectDB();

    // Only managers can begin a day
    if (![ROLES.ADMIN, ROLES.MANAGER].includes(currentUser.role)) {
      return NextResponse.json(
        { error: 'Only managers can begin the day' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = beginDaySchema.parse(body);

    // Managers can only manage their own station
    if (currentUser.role === ROLES.MANAGER && currentUser.stationId !== validatedData.stationId) {
      return NextResponse.json(
        { error: 'Access denied to this station' },
        { status: 403 }
      );
    }

    session = await mongoose.startSession();
    session.startTransaction();

    const station = await Station.findById(validatedData.stationId).session(session);
    if (!station) {
      await session.abortTransaction();
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    await autoCloseExpiredInProgressShifts({ stationId: validatedData.stationId, session });

    // Build submitted prices from dynamic availableProducts
    const availableProducts = station.availableProducts?.length
      ? station.availableProducts
      : ['PMS', 'AGO'];

    const submittedPrices = {};
    for (const product of availableProducts) {
      const val = Number(validatedData.pricesAtStart[product]);
      if (!val || val <= 0) {
        await session.abortTransaction();
        return NextResponse.json(
          { error: `Invalid price for ${product}` },
          { status: 400 }
        );
      }
      submittedPrices[product] = val;
    }

    const dayStart = new Date(validatedData.date + 'T00:00:00.000Z');
    const dayEnd = new Date(validatedData.date + 'T23:59:59.999Z');

    // Check if there's already an active day
    const existingActiveDay = await DayShift.findOne({
      stationId: validatedData.stationId,
      status: DAY_STATUS.IN_PROGRESS,
    }).session(session);

    if (existingActiveDay) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'There is already an active day. Please end it first.' },
        { status: 400 }
      );
    }

    // Validate dispensers
    const dispenserAssignments = [];
    for (const assignment of validatedData.dispensers) {
      const dispenser = station.dispensers.find(
        d => d.dispenserId === assignment.dispenserId && d.isActive
      );

      if (!dispenser) {
        await session.abortTransaction();
        return NextResponse.json(
          { error: `Dispenser ${assignment.dispenserId} not found or inactive` },
          { status: 400 }
        );
      }

      const mappedTank = dispenser.tankId
        ? station.tanks.find((t) => t._id === dispenser.tankId)
        : null;

      dispenserAssignments.push({
        dispenserId: assignment.dispenserId,
        dispenserName: dispenser.name,
        fuelType: dispenser.fuelType,
        tankId: dispenser.tankId || null,
        tankLabel: mappedTank?.label || dispenser.tankId || '',
        supervisorId: null,
        supervisorName: '',
        initialReading: 0,
        totalLiters: 0,
      });
    }

    const openingPriceChanges = [];
    for (const fuelType of availableProducts) {
      const previousPrice = Number(station.currentPrices?.get?.(fuelType) ?? station.currentPrices?.[fuelType] ?? 0);
      const newPrice = submittedPrices[fuelType];

      if (previousPrice !== newPrice) {
        const changeAmount = newPrice - previousPrice;
        const changePercentage = previousPrice > 0
          ? ((changeAmount / previousPrice) * 100)
          : 100;

        openingPriceChanges.push({
          stationId: station._id,
          stationName: station.name,
          fuelType,
          previousPrice,
          newPrice,
          changeAmount,
          changePercentage,
          effectiveDate: new Date(),
          changedBy: currentUser.id,
          changedByName: currentUser.name,
          reason: 'Opening day price set during begin day',
          approvalStatus: 'approved',
          approvedBy: currentUser.id,
          approvedByName: currentUser.name,
          approvedAt: new Date(),
        });
      }
    }

    // Update station prices for all available products
    if (!station.currentPrices || typeof station.currentPrices.set !== 'function') {
      station.currentPrices = new Map();
    }
    for (const [ft, price] of Object.entries(submittedPrices)) {
      station.currentPrices.set(ft, price);
    }
    await station.save({ session });

    if (openingPriceChanges.length > 0) {
      await PriceHistory.create(openingPriceChanges, { session, ordered: true });
    }

    // Use strict UTC midnight so date never shifts due to server timezone
    const dayDate = new Date(validatedData.date + 'T00:00:00.000Z');

    const dayShift = await DayShift.create([{
      stationId: validatedData.stationId,
      stationName: station.name,
      date: dayDate,
      status: DAY_STATUS.IN_PROGRESS,
      startedBy: currentUser.id,
      startedByName: currentUser.name,
      startTime: new Date(),
      dispenserAssignments,
      pricesAtStart: submittedPrices,
    }], { session, ordered: true });

    // Auto-create PumpOpening for selected dispensers so supervisors can enter readings immediately
    const pumpOpeningPumps = dispenserAssignments.map(a => ({
      _id: a.dispenserId,
      pumpLabel: a.dispenserName,
      openedAt: new Date(),
      addedLate: false,
    }));

    await PumpOpening.findOneAndUpdate(
      { stationId: validatedData.stationId, date: { $gte: dayDate, $lte: new Date(validatedData.date + 'T23:59:59.999Z') } },
      {
        $setOnInsert: {
          stationId: validatedData.stationId,
          stationName: station.name,
          date: dayDate,
          openedByManagerId: currentUser.id,
          openedByManagerName: currentUser.name,
          pumps: pumpOpeningPumps,
          dayClosed: false,
        },
      },
      { new: true, upsert: true, session }
    );

    // Auto-create opening TankStockEntry for each active tank,
    // carrying forward the previous day's closing stock as today's opening.
    const activeTanks = (station.tanks || []).filter(t => t.isActive);
    const dayDateUTC = new Date(validatedData.date + 'T00:00:00.000Z');

    for (const tank of activeTanks) {
      const tankIdStr = tank._id.toString();

      // Find the most recent closing entry for this tank before today
      const prevClosing = await TankStockEntry.findOne({
        stationId: validatedData.stationId,
        tankId: tankIdStr,
        period: 'closing',
        date: { $lt: dayDateUTC },
      }).sort({ date: -1 }).session(session);

      // Prefer manager-confirmed value, fall back to measured, then station.currentStock
      let openingValue = 0;
      if (prevClosing) {
        openingValue = prevClosing.closingStockManager ?? prevClosing.closingStockMeasured ?? 0;
      } else {
        const cs = station.currentStock;
        openingValue = cs instanceof Map
          ? (cs.get(tank.product) ?? 0)
          : (cs?.[tank.product] ?? 0);
      }

      // Upsert — don't overwrite if the manager already entered one today
      await TankStockEntry.findOneAndUpdate(
        {
          stationId: validatedData.stationId,
          tankId: tankIdStr,
          date: { $gte: dayDateUTC, $lte: new Date(validatedData.date + 'T23:59:59.999Z') },
          period: 'opening',
        },
        {
          $setOnInsert: {
            stationId: validatedData.stationId,
            stationName: station.name,
            tankId: tankIdStr,
            tankLabel: tank.label,
            product: tank.product,
            date: dayDateUTC,
            period: 'opening',
            openingStock: openingValue,
            closingStockMeasured: openingValue,
            recordedBy: currentUser.id,
            recordedByName: currentUser.name,
          },
        },
        { new: true, upsert: true, session }
      );
    }

    await session.commitTransaction();

    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.BEGIN_DAY,
      resource: AUDIT_RESOURCES.DAY_SHIFT,
      resourceId: dayShift[0]._id.toString(),
      stationId: station._id,
      stationName: station.name,
      details: {
        date: validatedData.date,
        dispenserCount: dispenserAssignments.length,
        pricesAtStart: submittedPrices,
        openingPriceChanges,
      },
    });

    return NextResponse.json({ dayShift: dayShift[0] }, { status: 201 });
  } catch (error) {
    if (session) {
      try { await session.abortTransaction(); } catch {}
    }
    console.error('Error beginning day:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error: ' + error.errors.map(e => e.message).join(', ') },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to begin day' },
      { status: 500 }
    );
  } finally {
    if (session) {
      try { session.endSession(); } catch {}
    }
  }
}
