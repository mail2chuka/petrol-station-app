import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getMaterialsUserModel } from '@/models/materials/User';
import { requireBusinessRole } from '@/lib/auth';

async function getUserModel() {
  const conn = await connectMaterialsDB();
  return getMaterialsUserModel(conn);
}

// GET /api/materials/users/[id]
export async function GET(request, { params }) {
  try {
    await requireBusinessRole('materials', ['admin', 'auditor']);
    const User = await getUserModel();
    const { id } = await params;
    const user = await User.findById(id).select('-password');
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch user' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// PATCH /api/materials/users/[id]
export async function PATCH(request, { params }) {
  try {
    await requireBusinessRole('materials', ['admin']);
    const User = await getUserModel();
    const { id } = await params;

    const body = await request.json();
    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (body.name !== undefined) user.name = String(body.name).trim();
    if (body.email !== undefined) user.email = String(body.email).toLowerCase().trim();
    if (body.loginId !== undefined) user.loginId = String(body.loginId).toLowerCase().trim();
    if (body.phone !== undefined) user.phone = body.phone?.trim();
    if (body.role !== undefined) user.role = body.role;
    if (body.isActive !== undefined) user.isActive = Boolean(body.isActive);

    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;
    return NextResponse.json({ user: userResponse });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to update user' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// DELETE /api/materials/users/[id]
export async function DELETE(request, { params }) {
  try {
    await requireBusinessRole('materials', ['admin']);
    const User = await getUserModel();
    const { id } = await params;

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    user.isActive = false;
    await user.save();

    return NextResponse.json({ message: 'User deactivated successfully' });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to deactivate user' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
