import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import MeterReading from '@/models/MeterReading';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// PATCH /api/meter-readings/[id] - Admin correction of opening/closing/RTT values
export async function PATCH(request, { params }) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (currentUser.role !== ROLES.ADMIN) {
      return NextResponse.json({ error: 'Only admins can correct meter reading values' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const reading = await MeterReading.findById(id);
    if (!reading) {
      return NextResponse.json({ error: 'Meter reading not found' }, { status: 404 });
    }

    if (body.opening !== undefined) reading.opening = parseFloat(body.opening);
    if (body.closing !== undefined) reading.closing = parseFloat(body.closing);
    if (body.rtt !== undefined) reading.rtt = parseFloat(body.rtt) || 0;
    reading.adminCorrectedBy = currentUser.name;
    reading.adminCorrectedAt = new Date();

    await reading.save();
    return NextResponse.json({ reading });
  } catch (error) {
    console.error('Error correcting meter reading:', error);
    return NextResponse.json({ error: error.message || 'Failed to update meter reading' }, { status: 500 });
  }
}
