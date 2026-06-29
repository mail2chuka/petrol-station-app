import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Truck from '@/models/Truck';
import { requireAuth, requireAdmin } from '@/lib/auth';
import { truckSchema } from '@/lib/validation';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';

// GET /api/trucks?includeInactive=true — list trucks (any authenticated user)
export async function GET(request) {
  try {
    await requireAuth();
    await connectDB();
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const query = includeInactive ? {} : { isActive: true };
    const trucks = await Truck.find(query).sort({ plateNumber: 1 }).lean();
    return NextResponse.json({ trucks });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to load trucks' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// POST /api/trucks — register a truck (admin only)
export async function POST(request) {
  try {
    const currentUser = await requireAdmin();
    await connectDB();
    const body = await request.json();
    const data = truckSchema.parse({ ...body, plateNumber: body.plateNumber?.toUpperCase().trim() });

    const existing = await Truck.findOne({ plateNumber: data.plateNumber.toUpperCase() });
    if (existing) {
      return NextResponse.json({ error: 'A truck with this plate number already exists.' }, { status: 400 });
    }

    const truck = await Truck.create({
      ...data,
      plateNumber: data.plateNumber.toUpperCase(),
      createdBy: currentUser.id,
      createdByName: currentUser.name,
    });

    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.CREATE,
      resource: AUDIT_RESOURCES.TRUCK,
      resourceId: truck._id.toString(),
      details: { plateNumber: truck.plateNumber, driverName: truck.driverName },
    });

    return NextResponse.json({ truck }, { status: 201 });
  } catch (error) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    return NextResponse.json(
      { error: error.message || 'Failed to register truck' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
