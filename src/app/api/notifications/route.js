import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Notification from '@/models/Notification';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// GET /api/notifications — fetch notifications for the current user
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unread') === 'true';
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

    let query;

    if (currentUser.role === ROLES.ADMIN) {
      // Admin sees all notifications
      query = {};
    } else {
      // Other users see notifications addressed to them by ID or role
      query = {
        $or: [
          { recipientId: currentUser.id },
          { recipientRole: currentUser.role, stationId: currentUser.stationId || null },
          // station-scoped role notifications
          ...(currentUser.stationId
            ? [{ recipientRole: currentUser.role, stationId: currentUser.stationId }]
            : []),
        ],
      };
    }

    if (unreadOnly) query.isRead = false;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);

    const unreadCount = await Notification.countDocuments({ ...query, isRead: false });

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch notifications' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// PATCH /api/notifications — mark all as read
export async function PATCH(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    let query;
    if (currentUser.role === ROLES.ADMIN) {
      query = { isRead: false };
    } else {
      query = {
        isRead: false,
        $or: [
          { recipientId: currentUser.id },
          { recipientRole: currentUser.role },
        ],
      };
    }

    await Notification.updateMany(query, { isRead: true, readAt: new Date() });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking notifications read:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
