import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { requireAdmin } from '@/lib/auth';

// POST /api/users/[id]/reset-password
export async function POST(request, { params }) {
  try {
    await requireAdmin();
    await connectDB();
    const { id } = await params;

    const { newPassword } = await request.json();
    if (!newPassword || String(newPassword).length < 6) {
      return NextResponse.json(
        { error: 'newPassword is required and must be at least 6 characters' },
        { status: 400 }
      );
    }

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    user.password = String(newPassword);
    await user.save();

    return NextResponse.json({ message: 'Password reset successfully' });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to reset password' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
