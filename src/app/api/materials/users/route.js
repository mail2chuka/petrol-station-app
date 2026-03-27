import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getMaterialsUserModel } from '@/models/materials/User';
import { requireBusinessRole } from '@/lib/auth';

async function getConn() {
  const conn = await connectMaterialsDB();
  return { conn, User: getMaterialsUserModel(conn) };
}

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

// GET /api/materials/users
export async function GET(request) {
  try {
    await requireBusinessRole('materials', ['admin', 'auditor']);
    const { User } = await getConn();
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const query = { isActive: true };
    if (role) query.role = role;
    const users = await User.find(query).select('-password').sort({ createdAt: -1 });
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch users' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// POST /api/materials/users - Create staff or customer login account
export async function POST(request) {
  try {
    const currentUser = await requireBusinessRole('materials', ['admin']);
    const { conn, User } = await getConn();

    const body = await request.json();
    const { name, email, loginId, password, role, phone, customerId } = body;

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: 'name, email, password, role are required' }, { status: 400 });
    }

    const normalizedLoginId = loginId ? String(loginId).toLowerCase().trim() : undefined;
    const existingQuery = [{ email: email.toLowerCase() }];
    if (normalizedLoginId) {
      existingQuery.push({ loginId: normalizedLoginId });
    }

    const existing = await User.findOne({ $or: existingQuery });
    if (existing) {
      return NextResponse.json(
        {
          error:
            existing.email === email.toLowerCase()
              ? 'Email already exists'
              : 'Login ID already exists',
        },
        { status: 400 }
      );
    }

    const finalLoginId = normalizedLoginId || await generateUniqueLoginId(User, name || email.split('@')[0]);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      loginId: finalLoginId,
      password,
      role,
      phone,
      customerId: customerId || undefined,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
    });

    const userResponse = user.toObject();
    delete userResponse.password;
    return NextResponse.json({ user: userResponse }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to create user' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
