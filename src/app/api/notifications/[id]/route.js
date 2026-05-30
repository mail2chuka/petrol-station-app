import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Notification from '@/models/Notification';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// PATCH /api/notifications/[id] — mark a single notification as read
export async function PATCH(request, { params }) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { id } = await params;
    const notification = await Notification.findById(id);

    if (!notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    // Only the recipient or admin can mark as read
    const isRecipient =
      notification.recipientId?.toString() === currentUser.id ||
      notification.recipientRole === currentUser.role;

    if (currentUser.role !== ROLES.ADMIN && !isRecipient) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    return NextResponse.json({ notification });
  } catch (error) {
    console.error('Error marking notification read:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
