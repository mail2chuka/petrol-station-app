import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import POSTerminal from '@/models/POSTerminal';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// GET /api/pos-terminals?stationId=
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');

    if (!stationId) {
      return NextResponse.json({ error: 'stationId is required' }, { status: 400 });
    }

    if (currentUser.role !== ROLES.ADMIN && currentUser.stationId !== stationId) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    const terminals = await POSTerminal.find({ stationId, isActive: true }).sort({ label: 1 });
    return NextResponse.json({ terminals });
  } catch (error) {
    console.error('Error fetching POS terminals:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch POS terminals' }, { status: 500 });
  }
}
