import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getCustomerModel } from '@/models/materials/Customer';
import { getMaterialsUserModel } from '@/models/materials/User';
import { requireBusinessRole } from '@/lib/auth';

async function getModels() {
  const conn = await connectMaterialsDB();
  return {
    conn,
    Customer: getCustomerModel(conn),
    User: getMaterialsUserModel(conn),
  };
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

// GET /api/materials/customers
export async function GET(request) {
  try {
    await requireBusinessRole('materials', ['admin', 'staff', 'auditor']);
    const { Customer } = await getModels();
    const { searchParams } = new URL(request.url);
    const flagged = searchParams.get('flagged');
    const search = searchParams.get('search');

    const query = { isActive: true };
    if (flagged === 'true') query.isFlagged = true;
    if (flagged === 'false') query.isFlagged = false;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const customers = await Customer.find(query).sort({ name: 1 });
    return NextResponse.json({ customers });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch customers' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// POST /api/materials/customers
export async function POST(request) {
  try {
    const currentUser = await requireBusinessRole('materials', ['admin']);
    const { Customer, User } = await getModels();

    const body = await request.json();
    const { name, phone, email, address, creditLimit, password, loginId } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'name, email and password are required for customer account setup' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedLoginId = loginId ? String(loginId).toLowerCase().trim() : undefined;

    const existingQuery = [{ email: normalizedEmail }];
    if (normalizedLoginId) {
      existingQuery.push({ loginId: normalizedLoginId });
    }
    const existingUser = await User.findOne({ $or: existingQuery });
    if (existingUser) {
      return NextResponse.json(
        {
          error:
            existingUser.email === normalizedEmail
              ? 'A login account with this email already exists'
              : 'Login ID already exists',
        },
        { status: 400 }
      );
    }

    const finalLoginId =
      normalizedLoginId || (await generateUniqueLoginId(User, name || normalizedEmail.split('@')[0]));

    const customer = await Customer.create({
      name: name.trim(),
      phone: phone?.trim(),
      email: normalizedEmail,
      address: address?.trim(),
      creditLimit: creditLimit ?? 0,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
    });

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      loginId: finalLoginId,
      password,
      role: 'customer',
      phone: phone?.trim(),
      customerId: customer._id,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
    });

    customer.userId = user._id;
    await customer.save();

    return NextResponse.json({ customer, userId: user._id, loginId: user.loginId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to create customer' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
