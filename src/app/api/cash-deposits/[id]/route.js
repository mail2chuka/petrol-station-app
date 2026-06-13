import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import CashDeposit from '@/models/CashDeposit';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { ROLES } from '@/lib/constants';

// PATCH /api/cash-deposits/[id] — admin edits deposit amount
export async function PATCH(request, { params }) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (currentUser.role !== ROLES.ADMIN) {
      return NextResponse.json({ error: 'Only admin can edit deposit amount' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const amount = parseFloat(body.amount);

    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'A valid positive amount is required' }, { status: 400 });
    }

    const cashDeposit = await CashDeposit.findById(id);
    if (!cashDeposit) {
      return NextResponse.json({ error: 'Cash deposit not found' }, { status: 404 });
    }

    const previousAmount = cashDeposit.amount;
    cashDeposit.amount = amount;
    await cashDeposit.save();

    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'cash_deposit',
      resourceId: cashDeposit._id.toString(),
      stationId: cashDeposit.stationId,
      stationName: cashDeposit.stationName,
      details: { previousAmount, newAmount: amount, editedByAdmin: currentUser.name },
    });

    return NextResponse.json({ cashDeposit });
  } catch (error) {
    console.error('Error updating cash deposit amount:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update deposit' },
      { status: 500 }
    );
  }
}
