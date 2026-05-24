import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import CashDeposit from '@/models/CashDeposit';
import User from '@/models/User';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { ROLES } from '@/lib/constants';

const createCashDepositSchema = z.object({
  stationId: z.string().min(1),
  date: z.string().min(1),
  amount: z.number().positive(),
  bankName: z.string().min(1),
  bankBranch: z.string().optional(),
  accountNumber: z.string().min(1),
  note: z.string().optional(),
});

// GET /api/cash-deposits
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const status = searchParams.get('status');
    const dateParam = searchParams.get('date');
    const monthParam = searchParams.get('month'); // YYYY-MM
    const limit = Math.min(Number(searchParams.get('limit') || 100), 500);

    const query = {};

    if (status) {
      query.status = status;
    }

    // Use explicit UTC date boundaries to avoid timezone-related mismatches
    if (monthParam) {
      const [y, m] = monthParam.split('-').map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)); // day-0 of next month = last day of this month
      lastDay.setUTCHours(23, 59, 59, 999);
      query.date = {
        $gte: new Date(Date.UTC(y, m - 1, 1)),
        $lte: lastDay,
      };
    } else if (dateParam) {
      // Parse as UTC date to match how deposits are stored (new Date('YYYY-MM-DD') = UTC midnight)
      query.date = {
        $gte: new Date(dateParam + 'T00:00:00.000Z'),
        $lte: new Date(dateParam + 'T23:59:59.999Z'),
      };
    }

    // Roles that can explicitly choose which station to query
    const canChooseStation = [
      ROLES.ADMIN,
      ROLES.MANAGER,
      ROLES.DAILY_AUDITOR,
      ROLES.EXTERNAL_AUDITOR,
    ].includes(currentUser.role);

    if (canChooseStation) {
      if (stationId) query.stationId = stationId;
    } else if (currentUser.stationId) {
      query.stationId = currentUser.stationId;
    }

    const cashDeposits = await CashDeposit.find(query)
      .sort({ date: -1, createdAt: -1 })
      .limit(limit);

    return NextResponse.json({ cashDeposits });
  } catch (error) {
    console.error('Error fetching cash deposits:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch cash deposits' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// POST /api/cash-deposits
export async function POST(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (currentUser.role !== ROLES.ACCOUNTANT) {
      return NextResponse.json(
        { error: 'Only accountants can initiate deposits' },
        { status: 403 }
      );
    }

    const payload = createCashDepositSchema.parse(await request.json());

    if (currentUser.stationId !== payload.stationId) {
      return NextResponse.json(
        { error: 'Access denied to this station' },
        { status: 403 }
      );
    }

    const stationUser = await User.findById(currentUser.id).select('stationName');

    const cashDeposit = await CashDeposit.create({
      stationId: payload.stationId,
      stationName: currentUser.stationName || stationUser?.stationName || 'Unknown Station',
      date: new Date(payload.date + 'T00:00:00.000Z'), // store as UTC midnight to match GET filter
      amount: payload.amount,
      bankName: payload.bankName,
      bankBranch: payload.bankBranch || '',
      accountNumber: payload.accountNumber,
      initiatedByAccountantId: currentUser.id,
      initiatedByAccountantName: currentUser.name,
      status: 'pending',
      adminNote: payload.note || null,
    });

    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.CREATE,
      resource: 'cash_deposit',
      resourceId: cashDeposit._id.toString(),
      stationId: cashDeposit.stationId,
      stationName: cashDeposit.stationName,
      details: {
        amount: cashDeposit.amount,
        bankName: cashDeposit.bankName,
        status: cashDeposit.status,
      },
    });

    return NextResponse.json({ cashDeposit }, { status: 201 });
  } catch (error) {
    console.error('Error creating cash deposit:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create cash deposit' },
      { status: 500 }
    );
  }
}
