import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { buildSummaryBookRows } from '@/lib/summaryBookRows';

// GET /api/reports/summary-book?stationId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const from = searchParams.get('from');
    const to = searchParams.get('to') || from;

    if (!stationId || !from) {
      return NextResponse.json({ error: 'stationId and from are required' }, { status: 400 });
    }

    const auditorRoles = [ROLES.DAILY_AUDITOR, ROLES.EXTERNAL_AUDITOR];
    if (currentUser.role !== ROLES.ADMIN && !auditorRoles.includes(currentUser.role) && currentUser.stationId !== stationId) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    const { rows } = await buildSummaryBookRows(stationId, from, to);

    // Latest date first; within a date, shift order then product.
    rows.sort((a, b) =>
      a.date > b.date ? -1 : a.date < b.date ? 1 :
      a.shiftOrder !== b.shiftOrder ? a.shiftOrder - b.shiftOrder :
      a.product.localeCompare(b.product)
    );

    return NextResponse.json({
      stationId,
      from,
      to,
      rows,
    });
  } catch (error) {
    console.error('Error generating summary book:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate summary book' }, { status: 500 });
  }
}
