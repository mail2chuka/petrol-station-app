import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Station from '@/models/Station';
import { requireAuth, requireAdmin, requireManagerOrAdmin } from '@/lib/auth';
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

// PATCH /api/stations/[id] - Update station
export async function PATCH(request, { params }) {
  try {
    const currentUser = await requireManagerOrAdmin();
    await connectDB();

    const body = await request.json();
    const {
      name,
      location,
      code,
      isActive,
      tolerancePercent,
      numberOfTanks,
      numberOfPumps,
      tanks,
      dispensers,
      editReason,
    } = body;

    const station = await Station.findById(params.id);
    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const isAdmin = currentUser.role === ROLES.ADMIN;
    const isManager = currentUser.role === ROLES.MANAGER;

    if (isManager && currentUser.stationId !== station._id.toString()) {
      return NextResponse.json(
        { error: 'Managers can only edit configuration for their own station' },
        { status: 403 }
      );
    }

    if (isManager) {
      const managerEditableKeys = new Set(['numberOfTanks', 'numberOfPumps', 'tanks', 'dispensers', 'editReason']);
      const attemptedRestrictedField = Object.keys(body).find((key) => body[key] !== undefined && !managerEditableKeys.has(key));

      if (attemptedRestrictedField) {
        return NextResponse.json(
          { error: `Managers cannot update ${attemptedRestrictedField}. Only pump/tank configuration can be changed.` },
          { status: 403 }
        );
      }
    }

    if (numberOfTanks !== undefined && (!Number.isFinite(Number(numberOfTanks)) || Number(numberOfTanks) < 0)) {
      return NextResponse.json(
        { error: 'Number of tanks must be 0 or more.' },
        { status: 400 }
      );
    }

    if (numberOfPumps !== undefined && (!Number.isFinite(Number(numberOfPumps)) || Number(numberOfPumps) < 0)) {
      return NextResponse.json(
        { error: 'Number of pumps must be 0 or more.' },
        { status: 400 }
      );
    }

    const previousNumberOfTanks = station.numberOfTanks;
    const previousNumberOfPumps = station.numberOfPumps;
    const tankChange = numberOfTanks !== undefined && Number(numberOfTanks) !== previousNumberOfTanks;
    const pumpChange = numberOfPumps !== undefined && Number(numberOfPumps) !== previousNumberOfPumps;

    if ((tankChange || pumpChange) && (!editReason || String(editReason).trim().length < 5)) {
      return NextResponse.json(
        { error: 'Edit reason is required for tank/pump changes (min 5 characters).' },
        { status: 400 }
      );
    }

    if (tanks !== undefined) {
      if (!Array.isArray(tanks)) {
        return NextResponse.json({ error: 'tanks must be an array' }, { status: 400 });
      }

      const tankIds = new Set();
      for (const tank of tanks) {
        if (!tank?._id || !tank?.label || !tank?.product || !Number.isFinite(Number(tank?.capacity)) || Number(tank.capacity) <= 0) {
          return NextResponse.json(
            { error: 'Each tank requires _id, label, product, and positive capacity' },
            { status: 400 }
          );
        }
        if (tankIds.has(tank._id)) {
          return NextResponse.json({ error: `Duplicate tank id: ${tank._id}` }, { status: 400 });
        }
        tankIds.add(tank._id);
      }
    }

    if (dispensers !== undefined) {
      if (!Array.isArray(dispensers)) {
        return NextResponse.json({ error: 'dispensers must be an array' }, { status: 400 });
      }

      const referenceTanks = Array.isArray(tanks) ? tanks : station.tanks || [];
      const validTankIds = new Set(referenceTanks.map((tank) => tank._id));
      const dispenserIds = new Set();

      for (const dispenser of dispensers) {
        if (!dispenser?.dispenserId || !dispenser?.name || !dispenser?.fuelType) {
          return NextResponse.json(
            { error: 'Each dispenser requires dispenserId, name, and fuelType' },
            { status: 400 }
          );
        }

        if (dispenserIds.has(dispenser.dispenserId)) {
          return NextResponse.json({ error: `Duplicate dispenser id: ${dispenser.dispenserId}` }, { status: 400 });
        }
        dispenserIds.add(dispenser.dispenserId);

        if (dispenser.tankId && !validTankIds.has(dispenser.tankId)) {
          return NextResponse.json(
            { error: `Dispenser ${dispenser.dispenserId} references invalid tank ${dispenser.tankId}` },
            { status: 400 }
          );
        }
      }
    }

    if (name) station.name = name;
    if (location) station.location = location;
    if (code) station.code = String(code).toUpperCase();
    if (isActive !== undefined) station.isActive = isActive;
    if (tolerancePercent !== undefined) {
      station.tolerancePercent = Number(tolerancePercent);
    }
    if (numberOfTanks !== undefined) {
      station.numberOfTanks = Number(numberOfTanks);
    }
    if (numberOfPumps !== undefined) {
      station.numberOfPumps = Number(numberOfPumps);
    }
    if (tanks !== undefined) {
      station.tanks = tanks.map((tank) => ({
        _id: tank._id,
        label: tank.label,
        product: tank.product,
        capacity: Number(tank.capacity),
        isActive: tank.isActive !== false,
      }));
    }
    if (dispensers !== undefined) {
      station.dispensers = dispensers.map((dispenser) => ({
        dispenserId: dispenser.dispenserId,
        name: dispenser.name,
        tankId: dispenser.tankId || null,
        fuelType: dispenser.fuelType,
        isActive: dispenser.isActive !== false,
      }));
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
      details: {
        updates: body,
        editedByScope: isAdmin ? 'admin_full_station_update' : 'manager_station_configuration_update',
        tankChange: tankChange
          ? { before: previousNumberOfTanks, after: Number(numberOfTanks) }
          : undefined,
        pumpChange: pumpChange
          ? { before: previousNumberOfPumps, after: Number(numberOfPumps) }
          : undefined,
        tanksUpdated: tanks !== undefined ? station.tanks : undefined,
        dispensersUpdated: dispensers !== undefined ? station.dispensers : undefined,
        editReason: editReason || undefined,
      },
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
