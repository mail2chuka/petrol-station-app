import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import Station from '@/models/Station';
import PriceHistory from '@/models/PriceHistory';
import { requireAuth } from '@/lib/auth';
import { priceAdjustmentSchema } from '@/lib/validation';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES } from '@/lib/constants';

// POST /api/stations/[id]/prices - Adjust fuel prices
export async function POST(request, { params }) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const currentUser = await requireAuth();
    await connectDB();

    // Only admin can adjust prices
    if (currentUser.role !== ROLES.ADMIN) {
      return NextResponse.json(
        { error: 'Only administrators can adjust prices' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = priceAdjustmentSchema.parse(body);

    const station = await Station.findById(params.id).session(session);
    if (!station) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Station not found' },
        { status: 404 }
      );
    }

    const fuelType = validatedData.fuelType;
    const previousPrice = station.currentPrices[fuelType];
    const newPrice = validatedData.price;

    // Update station price
    station.currentPrices[fuelType] = newPrice;
    await station.save({ session });

    // Create price history record
    const changeAmount = newPrice - previousPrice;
    const changePercentage = previousPrice > 0 
      ? ((changeAmount / previousPrice) * 100) 
      : 100;

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
    }], { session });

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
