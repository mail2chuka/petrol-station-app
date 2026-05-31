import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import Station from '@/models/Station';
import DayShift from '@/models/DayShift';
import MeterReading from '@/models/MeterReading';
import SalesEntry from '@/models/SalesEntry';
import PumpOpening from '@/models/PumpOpening';
import StockMovement from '@/models/StockMovement';
import TankStockEntry from '@/models/TankStockEntry';
import CashDeposit from '@/models/CashDeposit';
import PaymentRecord from '@/models/PaymentRecord';
import Notification from '@/models/Notification';
import Flag from '@/models/Flag';
import AuditLog from '@/models/AuditLog';

// POST /api/admin/reset
// Resets selected operational data for a station.
// Body: { stationId, targets: string[], confirmPhrase: string }
export async function POST(request) {
  let session = null;

  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (currentUser.role !== ROLES.ADMIN) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { stationId, targets = [], confirmPhrase } = body;

    if (!stationId) {
      return NextResponse.json({ error: 'stationId is required' }, { status: 400 });
    }

    const station = await Station.findById(stationId);
    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const expected = `RESET ${station.name.toUpperCase()}`;
    if (confirmPhrase?.trim().toUpperCase() !== expected) {
      return NextResponse.json(
        { error: `Type "${expected}" exactly to confirm the reset.` },
        { status: 400 }
      );
    }

    if (!targets.length) {
      return NextResponse.json({ error: 'Select at least one data type to reset.' }, { status: 400 });
    }

    const sid = station._id;
    const deleted = {};

    session = await mongoose.startSession();
    session.startTransaction();

    // ── Day Shifts ──────────────────────────────────────────────────────────────
    if (targets.includes('day_shifts')) {
      const r = await DayShift.deleteMany({ stationId: sid }, { session });
      deleted.day_shifts = r.deletedCount;
    }

    // ── Meter Readings ──────────────────────────────────────────────────────────
    if (targets.includes('meter_readings')) {
      const r = await MeterReading.deleteMany({ stationId: sid }, { session });
      deleted.meter_readings = r.deletedCount;
    }

    // ── Sales Entries ───────────────────────────────────────────────────────────
    if (targets.includes('sales')) {
      const r = await SalesEntry.deleteMany({ stationId: sid }, { session });
      deleted.sales = r.deletedCount;
    }

    // ── Pump Openings ───────────────────────────────────────────────────────────
    if (targets.includes('pump_openings')) {
      const r = await PumpOpening.deleteMany({ stationId: sid }, { session });
      deleted.pump_openings = r.deletedCount;
    }

    // ── Stock Movements ─────────────────────────────────────────────────────────
    if (targets.includes('stock_movements')) {
      const r = await StockMovement.deleteMany({ stationId: sid }, { session });
      deleted.stock_movements = r.deletedCount;
    }

    // ── Tank Stock Entries ──────────────────────────────────────────────────────
    if (targets.includes('tank_stock')) {
      const r = await TankStockEntry.deleteMany({ stationId: sid }, { session });
      deleted.tank_stock = r.deletedCount;
    }

    // ── Cash Deposits ───────────────────────────────────────────────────────────
    if (targets.includes('cash_deposits')) {
      const r = await CashDeposit.deleteMany({ stationId: sid }, { session });
      deleted.cash_deposits = r.deletedCount;
    }

    // ── Payment Records ─────────────────────────────────────────────────────────
    if (targets.includes('payments')) {
      const r = await PaymentRecord.deleteMany({ stationId: sid }, { session });
      deleted.payments = r.deletedCount;
    }

    // ── Notifications ───────────────────────────────────────────────────────────
    if (targets.includes('notifications')) {
      const r = await Notification.deleteMany({ stationId: sid }, { session });
      deleted.notifications = r.deletedCount;
    }

    // ── Flags ───────────────────────────────────────────────────────────────────
    if (targets.includes('flags')) {
      const r = await Flag.deleteMany({ stationId: sid }, { session });
      deleted.flags = r.deletedCount;
    }

    // ── Audit Logs ──────────────────────────────────────────────────────────────
    if (targets.includes('audit_logs')) {
      const r = await AuditLog.deleteMany({ stationId: sid }, { session });
      deleted.audit_logs = r.deletedCount;
    }

    // ── Station stock reset — always set to 0 (never null/undefined) ────────────
    if (targets.includes('station_stock')) {
      const products = station.availableProducts?.length
        ? station.availableProducts
        : ['PMS', 'AGO'];

      const newStock = new Map();
      for (const p of products) {
        newStock.set(p, 0);
      }
      station.currentStock = newStock;
      station.markModified('currentStock');
      await station.save({ session });
      deleted.station_stock = `reset to 0 for: ${products.join(', ')}`;
    }

    await session.commitTransaction();

    return NextResponse.json({
      success: true,
      stationName: station.name,
      deleted,
    });
  } catch (error) {
    if (session) { try { await session.abortTransaction(); } catch {} }
    console.error('Reset error:', error);
    return NextResponse.json({ error: error.message || 'Reset failed' }, { status: 500 });
  } finally {
    if (session) { try { session.endSession(); } catch {} }
  }
}

// GET /api/admin/reset?stationId=... — preview counts before resetting
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    if (currentUser.role !== ROLES.ADMIN) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    if (!stationId) return NextResponse.json({ counts: {} });

    const sid = stationId;

    const [
      day_shifts, meter_readings, sales, pump_openings,
      stock_movements, tank_stock, cash_deposits, payments,
      notifications, flags, audit_logs,
    ] = await Promise.all([
      DayShift.countDocuments({ stationId: sid }),
      MeterReading.countDocuments({ stationId: sid }),
      SalesEntry.countDocuments({ stationId: sid }),
      PumpOpening.countDocuments({ stationId: sid }),
      StockMovement.countDocuments({ stationId: sid }),
      TankStockEntry.countDocuments({ stationId: sid }),
      CashDeposit.countDocuments({ stationId: sid }),
      PaymentRecord.countDocuments({ stationId: sid }),
      Notification.countDocuments({ stationId: sid }),
      Flag.countDocuments({ stationId: sid }),
      AuditLog.countDocuments({ stationId: sid }),
    ]);

    return NextResponse.json({
      counts: {
        day_shifts, meter_readings, sales, pump_openings,
        stock_movements, tank_stock, cash_deposits, payments,
        notifications, flags, audit_logs,
      },
    });
  } catch (error) {
    console.error('Reset preview error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch counts' }, { status: 500 });
  }
}
