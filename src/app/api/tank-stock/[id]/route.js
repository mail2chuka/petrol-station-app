import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import TankStockEntry from '@/models/TankStockEntry';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

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

    // id format is either ObjectId or "tankId_date" composite
    let entries = [];

    if (id.includes('_')) {
      // Composite ID: extract tankId and date
      const parts = id.split('_');
      const tankId = parts.slice(0, -1).join('_');
      const date = parts[parts.length - 1];

      const startDate = new Date(date + 'T00:00:00.000Z');
      const endDate = new Date(date + 'T23:59:59.999Z');

      // Update opening entry if provided
      if (openingStock !== undefined && openingStock !== null) {
        const openingEntry = await TankStockEntry.findOneAndUpdate(
          { tankId, period: 'opening', date: { $gte: startDate, $lte: endDate } },
          {
            closingStockMeasured: parseFloat(openingStock),
            adminCorrectedBy: currentUser.name,
            adminCorrectedAt: new Date(),
          },
          { new: true }
        );
        if (openingEntry) entries.push(openingEntry);
      }

      // Update closing entry if provided
      if (closingStock !== undefined && closingStock !== null) {
        const closingEntry = await TankStockEntry.findOneAndUpdate(
          { tankId, period: 'closing', date: { $gte: startDate, $lte: endDate } },
          {
            closingStockMeasured: parseFloat(closingStock),
            adminCorrectedBy: currentUser.name,
            adminCorrectedAt: new Date(),
          },
          { new: true }
        );
        if (closingEntry) entries.push(closingEntry);
      }
    } else {
      // Direct ObjectId
      const entry = await TankStockEntry.findById(id);
      if (!entry) {
        return NextResponse.json(
          { error: 'Tank stock entry not found' },
          { status: 404 }
        );
      }

      if (openingStock !== undefined) entry.closingStockMeasured = parseFloat(openingStock);
      if (closingStock !== undefined) entry.closingStockMeasured = parseFloat(closingStock);

      entry.adminCorrectedBy = currentUser.name;
      entry.adminCorrectedAt = new Date();
      await entry.save();
      entries.push(entry);
    }

    if (entries.length === 0) {
      return NextResponse.json(
        { error: 'Tank stock entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Error correcting tank reading:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update tank reading' },
      { status: 500 }
    );
  }
}
