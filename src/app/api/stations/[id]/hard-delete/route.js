import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Station from '@/models/Station';
import User from '@/models/User';
import { requireAdmin } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';

export async function DELETE(request, { params }) {
  try {
    const currentUser = await requireAdmin();
    await connectDB();

    const station = await Station.findById(params.id);
    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    let adminPassword = '';
    try {
      const body = await request.json();
      adminPassword = body?.adminPassword || '';
    } catch (error) {
      adminPassword = '';
    }

    if (!adminPassword || adminPassword.trim().length < 1) {
      return NextResponse.json({ error: 'Admin password required for hard delete.' }, { status: 400 });
    }

    const adminUser = await User.findById(currentUser.id);
    if (!adminUser || !(await adminUser.comparePassword(adminPassword))) {
      return NextResponse.json({ error: 'Invalid admin password.' }, { status: 401 });
    }

    await Station.deleteOne({ _id: station._id });

    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.DELETE,
      resource: AUDIT_RESOURCES.STATION,
      resourceId: station._id.toString(),
      stationId: station._id,
      stationName: station.name,
      details: { code: station.code, location: station.location, hardDelete: true },
    });

    return NextResponse.json({ message: 'Station permanently deleted.' });
  } catch (error) {
    console.error('Error hard deleting station:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete station' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}