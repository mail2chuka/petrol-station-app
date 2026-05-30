import { NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import CashDeposit from '@/models/CashDeposit';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { ROLES } from '@/lib/constants';
import { notifyCashierDepositStatus } from '@/lib/notifications';

const updateStatusSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  adminNote: z.string().min(3),
});

// PATCH /api/cash-deposits/[id]/status
export async function PATCH(request, { params }) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (![ROLES.ADMIN, ROLES.MANAGER].includes(currentUser.role)) {
      return NextResponse.json(
        { error: 'Only manager/admin can approve or reject deposits' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const payload = updateStatusSchema.parse(await request.json());

    const cashDeposit = await CashDeposit.findById(id);
    if (!cashDeposit) {
      return NextResponse.json({ error: 'Cash deposit not found' }, { status: 404 });
    }

    if (currentUser.role === ROLES.MANAGER && currentUser.stationId !== cashDeposit.stationId.toString()) {
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    cashDeposit.status = payload.status;
    cashDeposit.approvedByAdminId = currentUser.id;
    cashDeposit.approvedByAdminName = currentUser.name;
    cashDeposit.approvedAt = new Date();
    cashDeposit.adminNote = payload.adminNote;
    if (payload.status === 'rejected') {
      cashDeposit.rejectionReason = payload.adminNote;
    }

    await cashDeposit.save();

    // Notify the cashier of the approval/rejection
    await notifyCashierDepositStatus({
      cashierId: cashDeposit.initiatedByCashierId,
      stationId: cashDeposit.stationId,
      stationName: cashDeposit.stationName,
      adminName: currentUser.name,
      amount: cashDeposit.amount,
      status: payload.status,
      note: payload.adminNote,
      depositId: cashDeposit._id,
    });

    await createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: AUDIT_ACTIONS.UPDATE,
      resource: 'cash_deposit',
      resourceId: cashDeposit._id.toString(),
      stationId: cashDeposit.stationId,
      stationName: cashDeposit.stationName,
      details: {
        status: payload.status,
        adminNote: payload.adminNote,
      },
    });

    return NextResponse.json({ cashDeposit });
  } catch (error) {
    console.error('Error updating cash deposit status:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to update cash deposit status' },
      { status: 500 }
    );
  }
}
