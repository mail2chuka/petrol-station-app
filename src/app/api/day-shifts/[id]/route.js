import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import DayShift from '@/models/DayShift';
import Station from '@/models/Station';
import PumpOpening from '@/models/PumpOpening';
import MeterReading from '@/models/MeterReading';
import SalesEntry from '@/models/SalesEntry';
import PaymentRecord from '@/models/PaymentRecord';
import StockMovement from '@/models/StockMovement';
import { requireAuth, requireStationAccess } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { ROLES, DAY_STATUS } from '@/lib/constants';

// GET /api/day-shifts/[id] - Get a specific day shift
export async function GET(request, { params }) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const dayShift = await DayShift.findById(params.id);

    if (!dayShift) {
      return NextResponse.json(
        { error: 'Day shift not found' },
        { status: 404 }
      );
    }

    // Check access
    await requireStationAccess(dayShift.stationId.toString());

    return NextResponse.json({ dayShift });
  } catch (error) {
    console.error('Error fetching day shift:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch day shift' },
      { status: 500 }
    );
  }
}

// PATCH /api/day-shifts/[id]
// Admin/manager overrides on a day shift. Body: { action, ...fields }
//   action=add-pump    { pumpId }          — add a dispenser to an in-progress shift
//   action=remove-pump { pumpId, force? }  — remove a dispenser (force = admin, drops its records)
//   action=reopen                          — admin-only: re-open an ended day
export async function PATCH(request, { params }) {
  let session = null;
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (![ROLES.ADMIN, ROLES.MANAGER].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Only admins or managers can modify a day shift' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    session = await mongoose.startSession();
    session.startTransaction();

    const dayShift = await DayShift.findById(id).session(session);
    if (!dayShift) {
      await session.abortTransaction();
      return NextResponse.json({ error: 'Day shift not found' }, { status: 404 });
    }

    if (currentUser.role === ROLES.MANAGER && currentUser.stationId !== dayShift.stationId.toString()) {
      await session.abortTransaction();
      return NextResponse.json({ error: 'Access denied to this station' }, { status: 403 });
    }

    const stationId = dayShift.stationId;
    const dateStr = new Date(dayShift.date).toISOString().split('T')[0];
    const startDate = new Date(dateStr + 'T00:00:00.000Z');
    const endDate = new Date(dateStr + 'T23:59:59.999Z');

    // ── ADD PUMP ──────────────────────────────────────────────────────────────
    if (action === 'add-pump') {
      const { pumpId } = body;
      if (!pumpId) {
        await session.abortTransaction();
        return NextResponse.json({ error: 'pumpId is required' }, { status: 400 });
      }
      if (dayShift.status !== DAY_STATUS.IN_PROGRESS) {
        await session.abortTransaction();
        return NextResponse.json({ error: 'Pumps can only be added to a day that is in progress. Re-open the day first.' }, { status: 400 });
      }
      if (dayShift.dispenserAssignments.some(d => d.dispenserId === pumpId)) {
        await session.abortTransaction();
        return NextResponse.json({ error: 'Pump is already part of this shift' }, { status: 400 });
      }

      const station = await Station.findById(stationId).session(session);
      const dispenser = (station?.dispensers || []).find(d => d.dispenserId === pumpId && d.isActive !== false);
      if (!dispenser) {
        await session.abortTransaction();
        return NextResponse.json({ error: 'Pump not found or inactive on this station' }, { status: 400 });
      }

      const mappedTank = dispenser.tankId ? (station.tanks || []).find(t => t._id === dispenser.tankId) : null;
      dayShift.dispenserAssignments.push({
        dispenserId: dispenser.dispenserId,
        dispenserName: dispenser.name,
        fuelType: dispenser.fuelType,
        tankId: dispenser.tankId || null,
        tankLabel: mappedTank?.label || dispenser.tankId || '',
        supervisorId: null,
        supervisorName: '',
        initialReading: 0,
        totalLiters: 0,
      });
      await dayShift.save({ session });

      // Keep the PumpOpening list in sync so the open-pumps view matches.
      await PumpOpening.updateOne(
        { stationId, date: { $gte: startDate, $lte: endDate }, 'pumps._id': { $ne: pumpId } },
        { $push: { pumps: { _id: pumpId, pumpLabel: dispenser.name, openedAt: new Date(), addedLate: true } } },
        { session }
      );

      await session.commitTransaction();
      await createAuditLog({
        userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role,
        action: AUDIT_ACTIONS.ADD_PUMP, resource: AUDIT_RESOURCES.DAY_SHIFT,
        resourceId: dayShift._id.toString(), stationId, stationName: dayShift.stationName,
        details: { date: dateStr, pumpId, pumpName: dispenser.name },
      });
      return NextResponse.json({ dayShift });
    }

    // ── REMOVE PUMP ───────────────────────────────────────────────────────────
    if (action === 'remove-pump') {
      const { pumpId, force } = body;
      if (!pumpId) {
        await session.abortTransaction();
        return NextResponse.json({ error: 'pumpId is required' }, { status: 400 });
      }
      if (dayShift.status !== DAY_STATUS.IN_PROGRESS) {
        await session.abortTransaction();
        return NextResponse.json({ error: 'Pumps can only be removed from a day that is in progress.' }, { status: 400 });
      }
      const idx = dayShift.dispenserAssignments.findIndex(d => d.dispenserId === pumpId);
      if (idx < 0) {
        await session.abortTransaction();
        return NextResponse.json({ error: 'Pump is not part of this shift' }, { status: 400 });
      }

      const existingReading = await MeterReading.findOne({
        stationId, pumpId, date: { $gte: startDate, $lte: endDate },
      }).session(session);

      let droppedRecords = null;
      if (existingReading) {
        // Removing a pump that already has readings is a data-losing correction.
        // Only an admin may force it; the pump's readings/sales/payments are dropped.
        if (!force || currentUser.role !== ROLES.ADMIN) {
          await session.abortTransaction();
          return NextResponse.json(
            { error: 'This pump already has recorded readings. Only an admin can remove it, which will delete its readings, sales and collections for the day.', requiresForce: true },
            { status: 409 }
          );
        }
        const [mr, se, pr] = await Promise.all([
          MeterReading.deleteMany({ stationId, pumpId, date: { $gte: startDate, $lte: endDate } }, { session }),
          SalesEntry.deleteMany({ stationId, dayShiftId: dayShift._id, dispenserId: pumpId }, { session }),
          PaymentRecord.deleteMany({ stationId, dayShiftId: dayShift._id, dispenserId: pumpId }, { session }),
        ]);
        droppedRecords = { meterReadings: mr.deletedCount, salesEntries: se.deletedCount, paymentRecords: pr.deletedCount };
      }

      dayShift.dispenserAssignments.splice(idx, 1);
      await dayShift.save({ session });

      await PumpOpening.updateOne(
        { stationId, date: { $gte: startDate, $lte: endDate } },
        { $pull: { pumps: { _id: pumpId } } },
        { session }
      );

      await session.commitTransaction();
      await createAuditLog({
        userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role,
        action: AUDIT_ACTIONS.REMOVE_PUMP, resource: AUDIT_RESOURCES.DAY_SHIFT,
        resourceId: dayShift._id.toString(), stationId, stationName: dayShift.stationName,
        details: { date: dateStr, pumpId, forced: !!droppedRecords, droppedRecords },
      });
      return NextResponse.json({ dayShift, droppedRecords });
    }

    // ── RE-OPEN DAY ───────────────────────────────────────────────────────────
    if (action === 'reopen') {
      if (currentUser.role !== ROLES.ADMIN) {
        await session.abortTransaction();
        return NextResponse.json({ error: 'Only an admin can re-open a day' }, { status: 403 });
      }
      if (dayShift.status !== DAY_STATUS.ENDED) {
        await session.abortTransaction();
        return NextResponse.json({ error: 'Only an ended day can be re-opened' }, { status: 400 });
      }
      // Guard: don't re-open a past day while another day is currently in progress.
      const otherActive = await DayShift.findOne({
        stationId, status: DAY_STATUS.IN_PROGRESS, _id: { $ne: dayShift._id },
      }).session(session);
      if (otherActive) {
        await session.abortTransaction();
        return NextResponse.json({ error: 'Another day is currently in progress. End it before re-opening a past day.' }, { status: 400 });
      }

      // Drop the end-of-day closing StockMovements this shift created, so re-ending
      // the day won't create duplicate stock-movement records.
      const removed = await StockMovement.deleteMany(
        { stationId, referenceId: dayShift._id, movementType: 'sale' },
        { session }
      );

      dayShift.status = DAY_STATUS.IN_PROGRESS;
      dayShift.endedBy = null;
      dayShift.endedByName = null;
      dayShift.endTime = null;
      await dayShift.save({ session });

      await session.commitTransaction();
      await createAuditLog({
        userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role,
        action: AUDIT_ACTIONS.REOPEN_DAY, resource: AUDIT_RESOURCES.DAY_SHIFT,
        resourceId: dayShift._id.toString(), stationId, stationName: dayShift.stationName,
        details: { date: dateStr, removedClosingMovements: removed.deletedCount },
      });
      return NextResponse.json({ dayShift });
    }

    await session.abortTransaction();
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    if (session) { try { await session.abortTransaction(); } catch {} }
    console.error('Error updating day shift:', error);
    return NextResponse.json({ error: error.message || 'Failed to update day shift' }, { status: 500 });
  } finally {
    if (session) { try { session.endSession(); } catch {} }
  }
}
