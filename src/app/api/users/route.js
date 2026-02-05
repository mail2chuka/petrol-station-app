import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import Station from '@/models/Station';
import { requireAdmin } from '@/lib/auth';
import { userSchema } from '@/lib/validation';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';

// GET /api/users - List all users
export async function GET(request) {
  try {
    const currentUser = await requireAdmin();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const stationId = searchParams.get('stationId');
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const query = includeInactive ? {} : { isActive: true };
    if (role) query.role = role;
    if (stationId) query.stationId = stationId;

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch users' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// POST /api/users - Create a new user
export async function POST(request) {
  try {
    const currentUser = await requireAdmin();
    await connectDB();

    const body = await request.json();
    const normalizedBody = {
      ...body,
      stationId: body.stationId ? body.stationId : undefined,
    };
    if (normalizedBody.role === 'admin' || normalizedBody.role === 'auditor') {
      normalizedBody.stationId = undefined;
    }
    
    // Validate input
    const validatedData = userSchema.parse(normalizedBody);

    // Check if email already exists
    const existingUser = await User.findOne({ email: validatedData.email.toLowerCase() });
    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already exists' },
        { status: 400 }
      );
    }

    // Get station name if stationId is provided
    let stationName = null;
    if (validatedData.stationId) {
      const station = await Station.findById(validatedData.stationId);
      if (!station) {
        return NextResponse.json(
          { error: 'Station not found' },
          { status: 404 }
        );
      }
      stationName = station.name;
    }

    // Create user
    const user = await User.create({
      ...validatedData,
      email: validatedData.email.toLowerCase(),
      stationName,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
    });

    // Create audit log
    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.CREATE,
      resource: AUDIT_RESOURCES.USER,
      resourceId: user._id.toString(),
      stationId: validatedData.stationId,
      stationName,
      details: {
        email: user.email,
        role: user.role,
        name: user.name,
      },
    });

    const userResponse = user.toObject();
    delete userResponse.password;

    return NextResponse.json({ user: userResponse }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to create user' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
