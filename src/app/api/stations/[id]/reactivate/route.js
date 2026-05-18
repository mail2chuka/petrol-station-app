import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Station from '@/models/Station';
import { requireAdmin } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';

export async function PATCH(request, { params }) {
  try {
    const currentUser = await requireAdmin();
    await connectDB();

    const station = await Station.findById(params.id);
    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    station.isActive = true;
    await station.save();

    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.UPDATE,
      resource: AUDIT_RESOURCES.STATION,
      resourceId: station._id.toString(),
      stationId: station._id,
      stationName: station.name,
      details: { code: station.code, location: station.location, action: 'reactivate_station' },
    });

    return NextResponse.json({ message: 'Station reactivated successfully', station });
  } catch (error) {
    console.error('Error reactivating station:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reactivate station' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}