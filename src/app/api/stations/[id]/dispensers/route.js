import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Station from '@/models/Station';
import { requireAuth, requireStationAccess } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES } from '@/lib/constants';

// GET /api/stations/[id]/dispensers - Get all dispensers
export async function GET(request, { params }) {
  try {
    await requireStationAccess(params.id);
    await connectDB();

    const station = await Station.findById(params.id);
    if (!station) {
      return NextResponse.json(
        { error: 'Station not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ dispensers: station.dispensers });
  } catch (error) {
    console.error('Error fetching dispensers:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch dispensers' },
      { status: 500 }
    );
  }
}

// POST /api/stations/[id]/dispensers - Add a dispenser
export async function POST(request, { params }) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    // Only admins can add dispensers
    if (currentUser.role !== ROLES.ADMIN) {
      return NextResponse.json(
        { error: 'Only administrators can add dispensers' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { dispenserId, name, fuelType } = body;

    if (!dispenserId || !name || !fuelType) {
      return NextResponse.json(
        { error: 'Dispenser ID, name, and fuel type are required' },
        { status: 400 }
      );
    }

    const station = await Station.findById(params.id);
    if (!station) {
      return NextResponse.json(
        { error: 'Station not found' },
        { status: 404 }
      );
    }

    // Check if dispenser ID already exists
    const existingDispenser = station.dispensers.find(
      d => d.dispenserId === dispenserId
    );
    
    if (existingDispenser) {
      return NextResponse.json(
        { error: 'Dispenser ID already exists' },
        { status: 400 }
      );
    }

    // Add dispenser
    station.dispensers.push({
      dispenserId,
      name,
      fuelType,
      isActive: true,
    });

    await station.save();

    // Create audit log
    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.CREATE,
      resource: 'dispenser',
      resourceId: dispenserId,
      stationId: station._id,
      stationName: station.name,
      details: {
        dispenserId,
        name,
        fuelType,
      },
    });

    return NextResponse.json({ 
      station,
      dispenser: station.dispensers[station.dispensers.length - 1]
    }, { status: 201 });
  } catch (error) {
    console.error('Error adding dispenser:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to add dispenser' },
      { status: 500 }
    );
  }
}
