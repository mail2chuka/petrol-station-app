import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import Station from '@/models/Station';
import StockMovement from '@/models/StockMovement';
import { requireAuth } from '@/lib/auth';
import { stockReceiptSchema } from '@/lib/validation';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES } from '@/lib/constants';

// POST /api/stations/[id]/stock - Receive stock
export async function POST(request, { params }) {
  let session = null;

  try {
    const currentUser = await requireAuth();
    await connectDB();

    // Only managers and admins can receive stock
    if (![ROLES.ADMIN, ROLES.MANAGER].includes(currentUser.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = stockReceiptSchema.parse(body);

    session = await mongoose.startSession();
    session.startTransaction();

    const station = await Station.findById(id).session(session);
    if (!station) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Station not found' },
        { status: 404 }
      );
    }

    // Managers can only manage their own station
    if (currentUser.role === ROLES.MANAGER && currentUser.stationId !== id) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'Access denied to this station' },
        { status: 403 }
      );
    }

    const fuelType = validatedData.fuelType;
    // currentStock is a Map — use .get() with a fallback of 0
    const previousStock = station.currentStock instanceof Map
      ? (station.currentStock.get(fuelType) ?? 0)
      : (station.currentStock?.[fuelType] ?? 0);
    const newStock = previousStock + validatedData.quantity;
    const expectedQuantity = validatedData.expectedQuantity;
    const varianceQuantity = expectedQuantity !== undefined ? validatedData.quantity - expectedQuantity : undefined;

    if (validatedData.distribution?.length) {
      const distributionTotal = validatedData.distribution.reduce((sum, item) => sum + item.litres, 0);
      const difference = Math.abs(distributionTotal - validatedData.quantity);

      if (difference > 0.001) {
        await session.abortTransaction();
        return NextResponse.json(
          { error: 'Tank distribution total must equal quantity delivered' },
          { status: 400 }
        );
      }

      const tankIds = new Set((station.tanks || []).map(t => t._id));
      const invalidTank = validatedData.distribution.find(item => !tankIds.has(item.tankId));
      if (invalidTank) {
        await session.abortTransaction();
        return NextResponse.json(
          { error: `Invalid tank in distribution: ${invalidTank.tankId}` },
          { status: 400 }
        );
      }
    }

    // Update station stock — Map requires .set()
    if (station.currentStock instanceof Map) {
      station.currentStock.set(fuelType, newStock);
    } else {
      station.currentStock[fuelType] = newStock;
    }
    station.markModified('currentStock');
    await station.save({ session });

    // Create stock movement record
    const costPerLiter = validatedData.cost / validatedData.quantity;
    
    await StockMovement.create([{
      stationId: station._id,
      stationName: station.name,
      date: new Date(),
      fuelType,
      movementType: 'receipt',
      quantity: validatedData.quantity,
      totalReceived: validatedData.quantity,
      expectedQuantity,
      varianceQuantity,
      tank: validatedData.tank,
      distribution: validatedData.distribution || [],
      costPerLiter,
      totalCost: validatedData.cost,
      supplier: body.supplier || 'N/A',
      previousStock,
      newStock,
      recordedBy: currentUser.id,
      recordedByName: currentUser.name,
      notes: body.notes || '',
    }], { session, ordered: true });

    // Create audit log
    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.RECEIVE_STOCK,
      resource: AUDIT_RESOURCES.STOCK_MOVEMENT,
      resourceId: station._id.toString(),
      stationId: station._id,
      stationName: station.name,
      details: {
        fuelType,
        quantity: validatedData.quantity,
        cost: validatedData.cost,
        previousStock,
        newStock,
      },
    });

    await session.commitTransaction();

    return NextResponse.json({ 
      station,
      stockUpdate: {
        fuelType,
        previousStock,
        newStock,
        quantityAdded: validatedData.quantity,
      }
    });
  } catch (error) {
    if (session) {
      try { await session.abortTransaction(); } catch {}
    }
    console.error('Error receiving stock:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to receive stock' },
      { status: 500 }
    );
  } finally {
    if (session) {
      try { session.endSession(); } catch {}
    }
  }
}
