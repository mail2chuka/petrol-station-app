import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import Flag from '@/models/Flag';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { ROLES } from '@/lib/constants';

const updateFlagStatusSchema = z.object({
  status: z.enum(['acknowledged', 'resolved']),
  resolutionNote: z.string().min(3).optional(),
});

// PATCH /api/flags/[id]/status
export async function PATCH(request, { params }) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (currentUser.role !== ROLES.ADMIN) {
      return NextResponse.json(
        { error: 'Only admins can update flag status' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const payload = updateFlagStatusSchema.parse(await request.json());

    const flag = await Flag.findById(id);
    if (!flag) {
      return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
    }

    flag.status = payload.status;

    if (payload.status === 'acknowledged') {
      flag.acknowledgedByAdminId = currentUser.id;
      flag.acknowledgedAt = new Date();
    }

    if (payload.status === 'resolved') {
      if (!payload.resolutionNote) {
        return NextResponse.json(
          { error: 'resolutionNote is required when resolving a flag' },
          { status: 400 }
        );
      }
      flag.resolvedByAdminId = currentUser.id;
      flag.resolvedByAdminName = currentUser.name;
      flag.resolvedAt = new Date();
      flag.resolutionNote = payload.resolutionNote;
    }

    await flag.save();

    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'flag',
      resourceId: flag._id.toString(),
      stationId: flag.stationId,
      stationName: flag.stationName,
      details: {
        status: payload.status,
        resolutionNote: payload.resolutionNote || null,
      },
    });

    return NextResponse.json({ flag });
  } catch (error) {
    console.error('Error updating flag status:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to update flag status' },
      { status: 500 }
    );
  }
}
