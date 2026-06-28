import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import Station from '@/models/Station';
import { requireAdmin, requireAuth } from '@/lib/auth';
import { userSchema } from '@/lib/validation';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES } from '@/lib/constants';
import { extractUserHrFields } from '@/lib/hr';

function slugifyLoginId(input) {
  const normalized = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
  return normalized || 'user';
}

async function generateUniqueLoginId(UserModel, seed) {
  const base = slugifyLoginId(seed).slice(0, 24);
  let candidate = base;
  let counter = 1;

  while (await UserModel.findOne({ loginId: candidate })) {
    candidate = `${base}${counter}`;
    counter += 1;
  }

  return candidate;
}

// GET /api/users - List users
// Admin: sees all users with full filters
// Manager/Cashier/Supervisor: can only fetch users at their own station (read-only, no inactive)
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const stationId = searchParams.get('stationId');
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const isAdmin = currentUser.role === ROLES.ADMIN;

    // Non-admin: restricted to their own station, no inactive users, read-only subset
    if (!isAdmin) {
      const query = { isActive: true };
      if (role) query.role = role;
      // Always scope to own station for non-admins
      query.stationId = currentUser.stationId;
      const users = await User.find(query).select('name email role stationId stationName isActive loginId').sort({ name: 1 });
      return NextResponse.json({ users });
    }

    // Admin path — full access
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
      loginId: body.loginId ? body.loginId.toLowerCase().trim() : undefined,
      stationId: body.stationId ? body.stationId : undefined,
    };
    if (normalizedBody.role === 'admin') {
      normalizedBody.stationId = undefined;
    }
    
    // Validate input
    const validatedData = userSchema.parse(normalizedBody);

    // Check if email/loginId already exists
    const existingQuery = [
      { email: validatedData.email.toLowerCase() },
    ];
    if (validatedData.loginId) {
      existingQuery.push({ loginId: validatedData.loginId.toLowerCase() });
    }

    const existingUser = await User.findOne({ $or: existingQuery });
    if (existingUser) {
      return NextResponse.json(
        {
          error:
            existingUser.email === validatedData.email.toLowerCase()
              ? 'Email already exists'
              : 'Login ID already exists',
        },
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

    const finalLoginId = validatedData.loginId
      ? validatedData.loginId.toLowerCase()
      : await generateUniqueLoginId(User, validatedData.name || validatedData.email?.split('@')[0]);

    // Create user
    const user = await User.create({
      ...validatedData,
      ...extractUserHrFields(body),
      email: validatedData.email.toLowerCase(),
      loginId: finalLoginId,
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
        loginId: user.loginId,
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
