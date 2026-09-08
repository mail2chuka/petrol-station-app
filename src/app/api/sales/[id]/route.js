import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import SalesEntry from '@/models/SalesEntry';
import DayShift from '@/models/DayShift';
import { requireAuth } from '@/lib/auth';
import { ROLES, DAY_STATUS } from '@/lib/constants';

// PATCH /api/sales/[id] - Update liters/cash/POS on an existing sale
export async function PATCH(request, { params }) {
  let session = null;
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (currentUser.role !== ROLES.SUPERVISOR) {
      return NextResponse.json(
        { error: 'Only supervisors can enter or correct litres sold' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const liters = parseFloat(body.liters);
    const cashAmount = parseFloat(body.cashAmount) || 0;
    const posAmount = parseFloat(body.posAmount) || 0;

    if (!liters || liters <= 0) {
      return NextResponse.json({ error: 'Liters must be a positive number' }, { status: 400 });
    }

    session = await mongoose.startSession();
    session.startTransaction();

    const entry = await SalesEntry.findById(id).session(session);
    if (!entry) {
      await session.abortTransaction();
      return NextResponse.json({ error: 'Sales entry not found' }, { status: 404 });
    }

    if (entry.supervisorId.toString() !== currentUser.id) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'You can only edit your own sales entries' },
        { status: 403 }
      );
    }

    // Supervisors cannot edit entries from a closed day — only admins can
    const dayShift = await DayShift.findById(entry.dayShiftId).session(session);
    if (dayShift && dayShift.status !== DAY_STATUS.IN_PROGRESS) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: 'This shift is closed. Litres sold cannot be changed after close.' },
        { status: 403 }
      );
    }

    const totalAmount = cashAmount + posAmount;
    const expectedAmount = liters * (entry.pricePerLiter || 0);
    const discrepancy = totalAmount - expectedAmount;

    entry.liters = liters;
    entry.cashAmount = cashAmount;
    entry.posAmount = posAmount;
    entry.totalAmount = totalAmount;
    entry.expectedAmount = expectedAmount;
    entry.discrepancy = discrepancy;

    await entry.save({ session });
    await session.commitTransaction();

    return NextResponse.json({ salesEntry: entry });
  } catch (error) {
    if (session) {
      try { await session.abortTransaction(); } catch {}
    }
    console.error('Error updating sales entry:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update sales entry' },
      { status: 500 }
    );
  } finally {
    if (session) {
      try { session.endSession(); } catch {}
    }
  }
}
