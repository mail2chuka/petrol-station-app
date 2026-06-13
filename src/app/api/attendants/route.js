import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Attendant from '@/models/Attendant';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// GET /api/attendants?stationId=&includeInactive=true
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId') || currentUser.stationId;
    const includeInactive = searchParams.get('includeInactive') === 'true';

    if (!stationId) {
      return NextResponse.json({ error: 'stationId is required' }, { status: 400 });
    }

    const query = { stationId };
    if (!includeInactive) query.isActive = true;

    const attendants = await Attendant.find(query).sort({ staffNumber: 1 }).lean();
    return NextResponse.json({ attendants });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to load attendants' }, { status: 500 });
  }
}

// POST /api/attendants — manager creates a new attendant
export async function POST(request) {
  try {
    const currentUser = await requireAuth();
    if (![ROLES.MANAGER, ROLES.ADMIN].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Only manager or admin can register attendants' }, { status: 403 });
    }
    await connectDB();

    const body = await request.json();
    const { name, phone } = body;
    const stationId = currentUser.stationId || body.stationId;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
    }
    if (!stationId) {
      return NextResponse.json({ error: 'stationId is required' }, { status: 400 });
    }

    // Auto-generate next sequential STF number for this station
    const last = await Attendant.findOne({ stationId }).sort({ staffNumber: -1 }).lean();
    let nextNum = 1;
    if (last?.staffNumber) {
      const match = last.staffNumber.match(/STF-(\d+)/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const staffNumber = `STF-${String(nextNum).padStart(3, '0')}`;

    const attendant = await Attendant.create({
      stationId,
      staffNumber,
      name: name.trim(),
      phone: phone?.trim() || '',
      dateRegistered: new Date(),
      isActive: true,
      createdById: currentUser.id,
      createdByName: currentUser.name,
    });

    return NextResponse.json({ attendant }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to create attendant' }, { status: 500 });
  }
}
