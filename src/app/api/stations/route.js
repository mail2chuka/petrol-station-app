import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Station from '@/models/Station';
import { requireAuth, requireAdmin } from '@/lib/auth';
import { stationSchema } from '@/lib/validation';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES } from '@/lib/constants';

// GET /api/stations - List all stations
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    let query = includeInactive && currentUser.role === ROLES.ADMIN ? {} : { isActive: true };
    
    // Non-admin users can only see their own station (except auditors)
    if (currentUser.role !== ROLES.ADMIN && currentUser.role !== ROLES.AUDITOR && currentUser.stationId) {
      query._id = currentUser.stationId;
    }

    const stations = await Station.find(query).sort({ createdAt: -1 });

    return NextResponse.json({ stations });
  } catch (error) {
    console.error('Error fetching stations:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch stations' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// POST /api/stations - Create a new station
export async function POST(request) {
  try {
    const currentUser = await requireAdmin();
    await connectDB();

    const body = await request.json();
    
    // Validate input
    const validatedData = stationSchema.parse(body);

    // Check if station code already exists
    const existingStation = await Station.findOne({ 
      code: validatedData.code.toUpperCase() 
    });
    
    if (existingStation) {
      return NextResponse.json(
        { error: 'Station code already exists' },
        { status: 400 }
      );
    }

    // Create station
    const station = await Station.create({
      ...validatedData,
      code: validatedData.code.toUpperCase(),
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      tolerancePercent: 2.5,
      currentPrices: {
        PMS: 0,
        AGO: 0,
      },
      currentStock: {
        PMS: 0,
        AGO: 0,
      },
      dispensers: [],
    });

    // Create audit log
    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.CREATE,
      resource: AUDIT_RESOURCES.STATION,
      resourceId: station._id.toString(),
      stationId: station._id,
      stationName: station.name,
      details: {
        code: station.code,
        location: station.location,
      },
    });

    return NextResponse.json({ station }, { status: 201 });
  } catch (error) {
    console.error('Error creating station:', error);
    
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to create station' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
