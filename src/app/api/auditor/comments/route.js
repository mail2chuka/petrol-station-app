import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import AuditorComment from '@/models/AuditorComment';
import Station from '@/models/Station';
import { requireAuth, requireAdmin } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// GET /api/auditor/comments - Admin-only list of auditor comments
export async function GET(request) {
  try {
    const currentUser = await requireAdmin();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const date = searchParams.get('date');

    const query = {};
    if (stationId) query.stationId = stationId;
    if (date) query.date = date;

    const comments = await AuditorComment.find(query)
      .sort({ createdAt: -1 })
      .limit(200);

    return NextResponse.json({ comments });
  } catch (error) {
    console.error('Error fetching auditor comments:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch comments' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// POST /api/auditor/comments - Auditors (daily or external) submit comment
export async function POST(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (![ROLES.DAILY_AUDITOR, ROLES.EXTERNAL_AUDITOR].includes(currentUser.role)) {
      return NextResponse.json(
        { error: 'Only auditors can submit comments' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { stationId, date, comment } = body;

    if (!stationId || !date || !comment?.trim()) {
      return NextResponse.json(
        { error: 'Station, date, and comment are required' },
        { status: 400 }
      );
    }

    const station = await Station.findById(stationId);
    if (!station) {
      return NextResponse.json(
        { error: 'Station not found' },
        { status: 404 }
      );
    }

    const saved = await AuditorComment.create({
      stationId,
      stationName: station.name,
      date,
      auditorId: currentUser.id,
      auditorName: currentUser.name,
      comment: comment.trim(),
    });

    return NextResponse.json({ comment: saved }, { status: 201 });
  } catch (error) {
    console.error('Error saving auditor comment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save comment' },
      { status: 500 }
    );
  }
}
