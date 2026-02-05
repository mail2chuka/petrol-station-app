import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import AuditLog from '@/models/AuditLog';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// GET /api/audit - Get audit logs
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    // Only admins and managers can view audit logs
    if (![ROLES.ADMIN, ROLES.MANAGER].includes(currentUser.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const userId = searchParams.get('userId');
    const action = searchParams.get('action');
    const resource = searchParams.get('resource');
    const limit = parseInt(searchParams.get('limit') || '100');

    let query = {};

    if (stationId) {
      query.stationId = stationId;
    } else if (currentUser.role === ROLES.MANAGER && currentUser.stationId) {
      // Managers can only see logs for their station
      query.stationId = currentUser.stationId;
    }

    if (userId) query.userId = userId;
    if (action) query.action = action;
    if (resource) query.resource = resource;

    const auditLogs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .limit(Math.min(limit, 500));

    return NextResponse.json({ auditLogs });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}
