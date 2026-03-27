import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { requireAuth } from '@/lib/auth';
import { passwordChangeSchema } from '@/lib/validation';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';

// POST /api/users/change-password - Change current user's password
export async function POST(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const body = await request.json();
    const validatedData = passwordChangeSchema.parse(body);

    const user = await User.findById(currentUser.id);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const isMatch = await user.comparePassword(validatedData.currentPassword);
    if (!isMatch) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 400 }
      );
    }

    user.password = validatedData.newPassword;
    await user.save();

    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.CHANGE_PASSWORD,
      resource: AUDIT_RESOURCES.USER,
      resourceId: currentUser.id,
      stationId: currentUser.stationId,
      stationName: currentUser.stationName,
      details: {
        changedBy: currentUser.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error changing password:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to change password' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
