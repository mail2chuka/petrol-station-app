import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import Flag from '@/models/Flag';
import Station from '@/models/Station';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { ROLES } from '@/lib/constants';

const createFlagSchema = z.object({
  stationId: z.string().min(1),
  targetType: z.enum(['meter_reading', 'tank_stock', 'sales', 'payment', 'stock_movement', 'general']),
  targetId: z.string().optional(),
  targetRef: z.string().optional(),
  severity: z.enum(['info', 'warning', 'critical']).default('warning'),
  reason: z.string().min(5),
  additionalDetails: z.string().optional(),
});

// GET /api/flags
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const limit = Math.min(Number(searchParams.get('limit') || 100), 500);

    const query = {};

    if (status) query.status = status;
    if (severity) query.severity = severity;

    const globalRoles = [ROLES.ADMIN, ROLES.DAILY_AUDITOR, ROLES.EXTERNAL_AUDITOR];
    if (globalRoles.includes(currentUser.role)) {
      if (stationId) query.stationId = stationId;
    } else if (currentUser.stationId) {
      query.stationId = currentUser.stationId;
    }

    const flags = await Flag.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);

    return NextResponse.json({ flags });
  } catch (error) {
    console.error('Error fetching flags:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch flags' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// POST /api/flags
export async function POST(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const canFlag = [ROLES.DAILY_AUDITOR, ROLES.EXTERNAL_AUDITOR].includes(currentUser.role);
    if (!canFlag) {
      return NextResponse.json(
        { error: 'Only auditors can raise flags' },
        { status: 403 }
      );
    }

    const payload = createFlagSchema.parse(await request.json());

    const station = await Station.findById(payload.stationId).lean();
    const stationName = station?.name || currentUser.stationName || 'Unknown Station';

    const flag = await Flag.create({
      stationId: payload.stationId,
      stationName,
      raisedByUserId: currentUser.id,
      raisedByUserName: currentUser.name,
      raisedByUserRole: currentUser.role,
      targetType: payload.targetType,
      targetId: payload.targetId || null,
      targetRef: payload.targetRef || null,
      severity: payload.severity,
      reason: payload.reason,
      additionalDetails: payload.additionalDetails || '',
      status: 'open',
    });

    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.CREATE,
      resource: 'flag',
      resourceId: flag._id.toString(),
      stationId: flag.stationId,
      stationName: flag.stationName,
      details: {
        targetType: flag.targetType,
        severity: flag.severity,
        reason: flag.reason,
      },
    });

    return NextResponse.json({ flag }, { status: 201 });
  } catch (error) {
    console.error('Error creating flag:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create flag' },
      { status: 500 }
    );
  }
}
