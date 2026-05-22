import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import Station from '@/models/Station';
import PriceHistory from '@/models/PriceHistory';
import DayShift from '@/models/DayShift';
import { requireAuth } from '@/lib/auth';
import { priceAdjustmentSchema } from '@/lib/validation';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES, DAY_STATUS } from '@/lib/constants';
import { autoCloseExpiredInProgressShifts } from '@/lib/dayShiftLifecycle';

// GET /api/stations/[id]/prices - List price change history / requests
export async function GET(request, { params }) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { id } = await params;
    const station = await Station.findById(id);
    if (!station) {
      return NextResponse.json(
        { error: 'Station not found' },
        { status: 404 }
      );
    }

    if (currentUser.role !== ROLES.ADMIN) {
      if (!currentUser.stationId || currentUser.stationId !== station._id.toString()) {
        return NextResponse.json(
          { error: 'Access denied to this station' },
          { status: 403 }
        );
      }
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

    const query = { stationId: station._id };
    if (status) {
      query.approvalStatus = status;
    }

    const priceRequests = await PriceHistory.find(query)
      .sort({ createdAt: -1, effectiveDate: -1 })
      .limit(Number.isFinite(limit) ? limit : 50)
      .lean();

    return NextResponse.json({
      station: {
        _id: station._id,
        name: station.name,
        code: station.code,
        currentPrices: station.currentPrices,
      },
      priceRequests,
    });
  } catch (error) {
    console.error('Error fetching price requests:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch price requests' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// POST /api/stations/[id]/prices - Adjust fuel prices
export async function POST(request, { params }) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const currentUser = await requireAuth();
    await connectDB();

    const canAdjustDirectly = currentUser.role === ROLES.ADMIN;
    const canRequestAdjustment = currentUser.role === ROLES.MANAGER;

    if (!canAdjustDirectly && !canRequestAdjustment) {
      return NextResponse.json(
        { error: 'Only administrators or managers can submit price changes' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = priceAdjustmentSchema.parse(body);

    const station = await Station.findById(id).session(session);
    if (!station) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Station not found' },
        { status: 404 }
      );
    }

    await autoCloseExpiredInProgressShifts({ stationId: station._id, session });

    const fuelType = validatedData.fuelType;
    const previousPrice = station.currentPrices[fuelType];
    const newPrice = validatedData.price;
    const changeAmount = newPrice - previousPrice;
    const changePercentage = previousPrice > 0
      ? ((changeAmount / previousPrice) * 100)
      : 100;

    if (newPrice === previousPrice) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'New price must be different from current price' },
        { status: 400 }
      );
    }

    // A shift must be started before any price change request/update can be processed.
    const activeDay = await DayShift.findOne({
      stationId: station._id,
      status: DAY_STATUS.IN_PROGRESS,
    }).session(session);

    if (!activeDay) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'A day shift must be started before price changes can be submitted or applied' },
        { status: 400 }
      );
    }

    // Managers can request price changes only for their own station during an active day.
    if (canRequestAdjustment) {
      if (!currentUser.stationId || currentUser.stationId !== station._id.toString()) {
        await session.abortTransaction();
        return NextResponse.json(
          { error: 'Managers can only request changes for their own station' },
          { status: 403 }
        );
      }

      if (!body.reason || !String(body.reason).trim()) {
        await session.abortTransaction();
        return NextResponse.json(
          { error: 'Reason is required for manager price change requests' },
          { status: 400 }
        );
      }

      const [pendingRequest] = await PriceHistory.create([{
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
        reason: String(body.reason).trim(),
        approvalStatus: 'pending',
      }], { session, ordered: true });

      await createAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: AUDIT_ACTIONS.ADJUST_PRICE,
        resource: AUDIT_RESOURCES.PRICE,
        resourceId: pendingRequest._id.toString(),
        stationId: station._id,
        stationName: station.name,
        details: {
          fuelType,
          previousPrice,
          requestedPrice: newPrice,
          changeAmount,
          changePercentage,
          approvalStatus: 'pending',
          requestType: 'manager_intra_day',
        },
      });

      await session.commitTransaction();

      return NextResponse.json(
        {
          message: 'Price change request submitted for admin approval',
          priceRequest: pendingRequest,
        },
        { status: 202 }
      );
    }

    // Update station price
    station.currentPrices[fuelType] = newPrice;
    await station.save({ session });

    // Create approved price history record for direct admin adjustments

    await PriceHistory.create([{
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
      reason: body.reason || 'Price adjustment',
      approvalStatus: 'approved',
      approvedBy: currentUser.id,
      approvedByName: currentUser.name,
      approvedAt: new Date(),
    }], { session, ordered: true });

    // Create audit log
    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.ADJUST_PRICE,
      resource: AUDIT_RESOURCES.PRICE,
      resourceId: station._id.toString(),
      stationId: station._id,
      stationName: station.name,
      details: {
        fuelType,
        previousPrice,
        newPrice,
        changeAmount,
        changePercentage,
      },
    });

    await session.commitTransaction();

    return NextResponse.json({ 
      station,
      priceChange: {
        fuelType,
        previousPrice,
        newPrice,
        changeAmount,
        changePercentage,
      }
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error adjusting price:', error);
    
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to adjust price' },
      { status: 500 }
    );
  } finally {
    session.endSession();
  }
}
