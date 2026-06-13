import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import Attendant from '@/models/Attendant';
import AttendantAssignment from '@/models/AttendantAssignment';
import MeterReading from '@/models/MeterReading';
import PaymentRecord from '@/models/PaymentRecord';
import DayShift from '@/models/DayShift';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

/**
 * GET /api/attendant-performance?stationId=&from=YYYY-MM-DD&to=YYYY-MM-DD&attendantId=
 *
 * Returns performance rows:
 *  Per attendant, per day:
 *   - pumps worked, meter sales value, cash collected, shortage, overage
 *
 * The "shortage" here is financial:
 *   shortage = max(0, meterSalesValue - cashCollected)
 *   overage  = max(0, cashCollected - meterSalesValue)
 */
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    const allowedRoles = [ROLES.ADMIN, ROLES.MANAGER];
    if (!allowedRoles.includes(currentUser.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    await connectDB();

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId') || currentUser.stationId;
    const from = searchParams.get('from');
    const to = searchParams.get('to') || from;
    const attendantIdFilter = searchParams.get('attendantId');

    if (!stationId || !from) {
      return NextResponse.json({ error: 'stationId and from are required' }, { status: 400 });
    }

    // Date range for string-based date field
    const dateQuery = { $gte: from, $lte: to || from };

    // 1. Pull assignments for the period
    const assignmentQuery = { stationId, date: dateQuery };
    if (attendantIdFilter) assignmentQuery.attendantId = new mongoose.Types.ObjectId(attendantIdFilter);

    const assignments = await AttendantAssignment.find(assignmentQuery).lean();
    if (assignments.length === 0) {
      return NextResponse.json({ rows: [], byDay: [] });
    }

    // 2. Collect unique dates and dispenserIds in range
    const dates = [...new Set(assignments.map(a => a.date))];
    const dispenserIds = [...new Set(assignments.map(a => a.dispenserId))];

    const stationObjId = new mongoose.Types.ObjectId(stationId);

    // 3. Fetch MeterReadings, PaymentRecords, DayShifts for those dates/dispensers
    const [meterReadings, paymentRecords, dayShifts] = await Promise.all([
      MeterReading.find({ stationId: stationObjId, date: { $gte: new Date(from + 'T00:00:00Z'), $lte: new Date((to || from) + 'T23:59:59Z') }, pumpId: { $in: dispenserIds } }).lean(),
      PaymentRecord.find({ stationId: stationObjId, date: { $gte: new Date(from + 'T00:00:00Z'), $lte: new Date((to || from) + 'T23:59:59Z') }, dispenserId: { $in: dispenserIds } }).lean(),
      DayShift.find({ stationId: stationObjId, date: { $gte: new Date(from + 'T00:00:00Z'), $lte: new Date((to || from) + 'T23:59:59Z') } }).lean(),
    ]);

    // Index meter readings: date+pumpId → reading
    const meterMap = {};
    for (const r of meterReadings) {
      const d = new Date(r.date).toISOString().split('T')[0];
      meterMap[`${d}|${r.pumpId}`] = r;
    }

    // Index payment records: date+dispenserId → sum of totalReceived
    const paymentMap = {};
    for (const p of paymentRecords) {
      const d = new Date(p.date).toISOString().split('T')[0];
      const key = `${d}|${p.dispenserId}`;
      paymentMap[key] = (paymentMap[key] || 0) + (p.totalReceived || 0);
    }

    // Index day shifts: date → pricesAtStart
    const shiftMap = {};
    for (const s of dayShifts) {
      const d = new Date(s.date).toISOString().split('T')[0];
      shiftMap[d] = s.pricesAtStart || {};
    }

    // 4. Build per-day rows grouped by attendant
    // byDay: { attendantId|date → { pumps, meterSales, cashCollected, shortage, overage } }
    const dayMap = {}; // key: attendantId_date

    for (const a of assignments) {
      const key = `${a.attendantId}|${a.date}`;
      if (!dayMap[key]) {
        dayMap[key] = {
          attendantId: a.attendantId.toString(),
          attendantStaffNumber: a.attendantStaffNumber,
          attendantName: a.attendantName,
          date: a.date,
          pumps: [],
          meterSales: 0,
          cashCollected: 0,
        };
      }
      const row = dayMap[key];
      if (!row.pumps.includes(a.dispenserName || a.dispenserId)) {
        row.pumps.push(a.dispenserName || a.dispenserId);
      }

      const reading = meterMap[`${a.date}|${a.dispenserId}`];
      const prices = shiftMap[a.date] || {};
      const price = prices[a.fuelType] || 0;

      if (reading) {
        const netSold = Math.max(0, (reading.closing || 0) - (reading.opening || 0) - (reading.rtt || 0));
        row.meterSales += netSold * price;
      }

      row.cashCollected += paymentMap[`${a.date}|${a.dispenserId}`] || 0;
    }

    // Compute shortage/overage per day-row
    const byDay = Object.values(dayMap).map(row => {
      const shortage = Math.max(0, row.meterSales - row.cashCollected);
      const overage = Math.max(0, row.cashCollected - row.meterSales);
      return { ...row, shortage, overage };
    }).sort((a, b) => a.date < b.date ? 1 : -1);

    // 5. Aggregate by attendant
    const attendantMap = {};
    for (const row of byDay) {
      const id = row.attendantId;
      if (!attendantMap[id]) {
        attendantMap[id] = {
          attendantId: id,
          attendantStaffNumber: row.attendantStaffNumber,
          attendantName: row.attendantName,
          daysWorked: 0,
          totalMeterSales: 0,
          totalCashCollected: 0,
          totalShortage: 0,
          totalOverage: 0,
          shortageOccurrences: 0,
          pumpsSet: new Set(),
        };
      }
      const ag = attendantMap[id];
      ag.daysWorked += 1;
      ag.totalMeterSales += row.meterSales;
      ag.totalCashCollected += row.cashCollected;
      ag.totalShortage += row.shortage;
      ag.totalOverage += row.overage;
      if (row.shortage > 0) ag.shortageOccurrences += 1;
      for (const p of row.pumps) ag.pumpsSet.add(p);
    }

    const rows = Object.values(attendantMap).map(ag => {
      const { pumpsSet, ...rest } = ag;
      return { ...rest, pumps: [...pumpsSet] };
    }).sort((a, b) => a.attendantStaffNumber.localeCompare(b.attendantStaffNumber));

    return NextResponse.json({ rows, byDay });
  } catch (error) {
    console.error('attendant-performance error:', error);
    return NextResponse.json({ error: error.message || 'Failed to compute performance' }, { status: 500 });
  }
}
