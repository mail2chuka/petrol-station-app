import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import TankStockEntry from '@/models/TankStockEntry';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { findOpenShiftForEntry, CLOSED_SHIFT_ENTRY_ERROR } from '@/lib/shiftEntry';

// PATCH /api/tank-stock/[id] - Admin correction of tank dipstick readings
export async function PATCH(request, { params }) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (currentUser.role !== ROLES.ADMIN) {
      return NextResponse.json(
        { error: 'Only admins can correct tank readings' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { openingStock, closingStock } = body;

    if (id.includes('_')) {
      return NextResponse.json({ error: 'Use individual live readings or Historical Data Entry for tank corrections.' }, { status: 409 });
    }

    const entry = await TankStockEntry.findById(id);
    if (!entry) {
      return NextResponse.json(
        { error: 'Tank stock entry not found' },
        { status: 404 }
      );
    }

    const openShift = await findOpenShiftForEntry({
      stationId: entry.stationId,
      date: new Date(entry.date).toISOString().slice(0, 10),
      dayShiftId: entry.dayShiftId,
      legacyRecord: true,
    });
    if (!openShift) return NextResponse.json({ error: CLOSED_SHIFT_ENTRY_ERROR }, { status: 409 });

    if (openingStock !== undefined) entry.closingStockMeasured = parseFloat(openingStock);
    if (closingStock !== undefined) entry.closingStockMeasured = parseFloat(closingStock);
    entry.adminCorrectedBy = currentUser.name;
    entry.adminCorrectedAt = new Date();
    await entry.save();

    return NextResponse.json({ entries: [entry] });
  } catch (error) {
    console.error('Error correcting tank reading:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update tank reading' },
      { status: 500 }
    );
  }
}
