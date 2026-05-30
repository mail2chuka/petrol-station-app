import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import PumpOpening from '@/models/PumpOpening';
import MeterReading from '@/models/MeterReading';
import Station from '@/models/Station';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

const updateSchema = z.object({
  action: z.enum(['add', 'remove']),
  pumpId: z.string().min(1),
});

// PATCH /api/pump-openings/[id]
export async function PATCH(request, { params }) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (![ROLES.ADMIN, ROLES.MANAGER].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Only manager or admin can update open pumps' }, { status: 403 });
    }

    const payload = updateSchema.parse(await request.json());
    const opening = await PumpOpening.findById(params.id);

    if (!opening) {
      return NextResponse.json({ error: 'Pump opening record not found' }, { status: 404 });
    }

    if (currentUser.role === ROLES.MANAGER && currentUser.stationId !== opening.stationId.toString()) {
      return NextResponse.json({ error: 'Managers can only manage their own station' }, { status: 403 });
    }

    const station = await Station.findById(opening.stationId);
    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const pumpExistsInStation = (station.dispensers || []).some(d => d.dispenserId === payload.pumpId);
    if (!pumpExistsInStation) {
      return NextResponse.json({ error: 'Pump does not exist on station map' }, { status: 400 });
    }

    const existingIndex = opening.pumps.findIndex(p => p._id === payload.pumpId);

    if (payload.action === 'add') {
      if (existingIndex >= 0) {
        return NextResponse.json({ error: 'Pump already open for today' }, { status: 400 });
      }

      const dispenser = station.dispensers.find(d => d.dispenserId === payload.pumpId);
      opening.pumps.push({
        _id: payload.pumpId,
        pumpLabel: dispenser?.name || payload.pumpId,
        openedAt: new Date(),
        addedLate: true,
      });
    }

    if (payload.action === 'remove') {
      if (existingIndex < 0) {
        return NextResponse.json({ error: 'Pump not currently in today open list' }, { status: 400 });
      }

      const dateStr = opening.date.toISOString().split('T')[0];
      const startDate = new Date(dateStr + 'T00:00:00.000Z');
      const endDate = new Date(dateStr + 'T23:59:59.999Z');

      const existingReading = await MeterReading.findOne({
        stationId: opening.stationId,
        pumpId: payload.pumpId,
        date: { $gte: startDate, $lte: endDate },
      });

      if (existingReading) {
        return NextResponse.json(
          { error: 'Cannot remove pump after supervisor has recorded readings. Flag for admin correction instead.' },
          { status: 409 }
        );
      }

      opening.pumps.splice(existingIndex, 1);
    }

    await opening.save();
    return NextResponse.json({ opening });
  } catch (error) {
    console.error('Error updating pump opening:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Failed to update pump opening' }, { status: 500 });
  }
}
