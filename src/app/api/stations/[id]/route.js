import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Station from '@/models/Station';
import { requireAuth, requireAdmin } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES } from '@/lib/constants';

// GET /api/stations/[id] - Get station by ID
export async function GET(request, { params }) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    // Admin can access any station; others can only access their own
    if (currentUser.role !== ROLES.ADMIN) {
      if (!currentUser.stationId || currentUser.stationId !== params.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const station = await Station.findById(params.id);
    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    return NextResponse.json({ station });
  } catch (error) {
    console.error('Error fetching station:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch station' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// PATCH /api/stations/[id] - Update station (admin only)
export async function PATCH(request, { params }) {
  try {
    const currentUser = await requireAdmin();
    await connectDB();

    const body = await request.json();
    const { name, location, code, isActive, tolerancePercent } = body;

    const station = await Station.findById(params.id);
    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    if (name) station.name = name;
    if (location) station.location = location;
    if (code) station.code = String(code).toUpperCase();
    if (isActive !== undefined) station.isActive = isActive;
    if (tolerancePercent !== undefined) {
      station.tolerancePercent = Number(tolerancePercent);
    }

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
      details: { updates: body },
    });

    return NextResponse.json({ station });
  } catch (error) {
    console.error('Error updating station:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update station' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// DELETE /api/stations/[id] - Soft delete station (admin only)
export async function DELETE(request, { params }) {
  try {
    const currentUser = await requireAdmin();
    await connectDB();

    const station = await Station.findById(params.id);
    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    station.isActive = false;
    await station.save();

    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.DELETE,
      resource: AUDIT_RESOURCES.STATION,
      resourceId: station._id.toString(),
      stationId: station._id,
      stationName: station.name,
      details: { code: station.code, location: station.location },
    });

    return NextResponse.json({ message: 'Station deactivated successfully' });
  } catch (error) {
    console.error('Error deleting station:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete station' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
