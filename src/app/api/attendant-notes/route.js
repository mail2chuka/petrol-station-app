import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import AttendantNote from '@/models/AttendantNote';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// GET /api/attendant-notes?attendantId=
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const attendantId = searchParams.get('attendantId');
    if (!attendantId) return NextResponse.json({ error: 'attendantId is required' }, { status: 400 });

    const notes = await AttendantNote.find({ attendantId }).sort({ addedAt: -1 }).lean();
    return NextResponse.json({ notes });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to load notes' }, { status: 500 });
  }
}

// POST /api/attendant-notes — append-only
export async function POST(request) {
  try {
    const currentUser = await requireAuth();
    if (![ROLES.MANAGER, ROLES.ADMIN].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Only manager or admin can add notes' }, { status: 403 });
    }
    await connectDB();

    const body = await request.json();
    const { attendantId, note, stationId: bodyStationId } = body;
    const stationId = currentUser.stationId || bodyStationId;

    if (!attendantId || !note?.trim()) {
      return NextResponse.json({ error: 'attendantId and note are required' }, { status: 400 });
    }

    const created = await AttendantNote.create({
      attendantId,
      stationId: stationId || '',
      note: note.trim(),
      addedAt: new Date(),
      addedById: currentUser.id,
      addedByName: currentUser.name,
    });

    return NextResponse.json({ note: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to add note' }, { status: 500 });
  }
}
