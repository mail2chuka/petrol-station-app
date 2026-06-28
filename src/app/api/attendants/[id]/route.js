import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Attendant from '@/models/Attendant';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { extractAttendantHrFields } from '@/lib/hr';

// PATCH /api/attendants/[id] — update name, phone, or status
export async function PATCH(request, { params }) {
  try {
    const currentUser = await requireAuth();
    if (![ROLES.MANAGER, ROLES.ADMIN].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Only manager or admin can update attendants' }, { status: 403 });
    }
    await connectDB();

    const { id } = await params;
    const body = await request.json();
    const { name, phone, isActive } = body;

    const attendant = await Attendant.findById(id);
    if (!attendant) {
      return NextResponse.json({ error: 'Attendant not found' }, { status: 404 });
    }

    if (name !== undefined) attendant.name = name.trim();
    if (phone !== undefined) attendant.phone = phone.trim();
    if (isActive !== undefined) attendant.isActive = Boolean(isActive);

    // Apply any HR profile fields present in the body
    const hrFields = extractAttendantHrFields(body);
    for (const [k, v] of Object.entries(hrFields)) {
      attendant[k] = v;
    }

    await attendant.save();
    return NextResponse.json({ attendant });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to update attendant' }, { status: 500 });
  }
}
