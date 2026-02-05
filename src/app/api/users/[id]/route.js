import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { requireAdmin } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES } from '@/lib/constants';

// GET /api/users/[id] - Get user by ID
export async function GET(request, { params }) {
  try {
    const currentUser = await requireAdmin();
    await connectDB();

    const { id } = await params;
    const user = await User.findById(id).select('-password');

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch user' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// PATCH /api/users/[id] - Update user
export async function PATCH(request, { params }) {
  try {
    const currentUser = await requireAdmin();
    await connectDB();

    const body = await request.json();
    const normalizedStationId = body.stationId ? body.stationId : undefined;
    const role = body.role;
    const stationId = role === 'admin' || role === 'auditor' ? undefined : normalizedStationId;
    const { name, email, isActive } = body;

    const { id } = await params;
    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const mainAdminEmail = process.env.SEED_ADMIN_EMAIL || process.env.MAIN_ADMIN_EMAIL;
    const isMainAdmin = user.role === 'admin' && (mainAdminEmail ? user.email === mainAdminEmail : !user.createdBy);
    if (isMainAdmin && isActive === false) {
      return NextResponse.json(
        { error: 'Main admin account cannot be deactivated' },
        { status: 403 }
      );
    }

    const allowedRoles = Object.values(ROLES);
    if (role && !allowedRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }

    // Update fields
    if (name) user.name = name;
    if (email) user.email = email.toLowerCase();
    if (role) user.role = role;
    if (stationId !== undefined) {
      user.stationId = stationId;
      if (stationId) {
        const Station = require('@/models/Station').default;
        const station = await Station.findById(stationId);
        user.stationName = station?.name || null;
      } else {
        user.stationName = null;
      }
    }
    if (isActive !== undefined) user.isActive = isActive;

    const hasInvalidRole = !allowedRoles.includes(user.role);
    await user.save({ validateBeforeSave: !hasInvalidRole });

    // Create audit log
    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.UPDATE,
      resource: AUDIT_RESOURCES.USER,
      resourceId: user._id.toString(),
      stationId: user.stationId,
      stationName: user.stationName,
      details: {
        updates: body,
      },
    });

    const userResponse = user.toObject();
    delete userResponse.password;

    return NextResponse.json({ user: userResponse });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update user' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// DELETE /api/users/[id] - Soft delete user (mark as inactive)
export async function DELETE(request, { params }) {
  try {
    const currentUser = await requireAdmin();
    await connectDB();

    const { id } = await params;
    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const mainAdminEmail = process.env.SEED_ADMIN_EMAIL || process.env.MAIN_ADMIN_EMAIL;
    const isMainAdmin = user.role === 'admin' && (mainAdminEmail ? user.email === mainAdminEmail : !user.createdBy);
    if (isMainAdmin) {
      return NextResponse.json(
        { error: 'Main admin account cannot be deleted' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const hardDelete = searchParams.get('hard') === 'true';

    if (hardDelete) {
      await User.deleteOne({ _id: user._id });
    } else {
      // Soft delete - mark as inactive
      user.isActive = false;
      await user.save();
    }

    // Create audit log
    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.DELETE,
      resource: AUDIT_RESOURCES.USER,
      resourceId: user._id.toString(),
      stationId: user.stationId,
      stationName: user.stationName,
      details: {
        email: user.email,
        role: user.role,
      },
    });

    return NextResponse.json({ message: hardDelete ? 'User deleted successfully' : 'User deactivated successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete user' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
