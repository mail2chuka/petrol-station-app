import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import DayShift from '@/models/DayShift';
import SalesEntry from '@/models/SalesEntry';
import PaymentRecord from '@/models/PaymentRecord';
import StockMovement from '@/models/StockMovement';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// GET /api/reports/financial-daily - Daily inflow/outflow summary
export async function GET(request) {
  try {
    const currentUser = await requireAuth();
    await connectDB();

    const auditRoles = [ROLES.ADMIN, ROLES.DAILY_AUDITOR, ROLES.EXTERNAL_AUDITOR];
    if (!auditRoles.includes(currentUser.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    const date = searchParams.get('date');

    if (!stationId || !date) {
      return NextResponse.json(
        { error: 'Station ID and date are required' },
        { status: 400 }
      );
    }

    const startDate = new Date(date + 'T00:00:00.000Z');
    const endDate = new Date(date + 'T23:59:59.999Z');

    // Look up every DayShift for this date (there can be more than one now) so
    // we can query by dayShiftId (prevents createdAt timezone mismatches where
    // records saved near midnight fall on the wrong day). Summing across all
    // of the date's shifts — querying just one arbitrary shift here would
    // silently drop the other shifts' sales/payments.
    const dayShifts = await DayShift.find({
      stationId,
      date: { $gte: startDate, $lte: endDate },
    });

    if (!dayShifts.length) {
      return NextResponse.json({
        summary: {
          totalSalesExpected: 0,
          totalSalesActual: 0,
          totalPaymentsCash: 0,
          totalPaymentsPos: 0,
          totalPaymentsReceived: 0,
          totalStockCost: 0,
          netPosition: 0,
        },
        counts: { salesEntries: 0, paymentRecords: 0, stockReceipts: 0 },
      });
    }

    const dayShiftIds = dayShifts.map((d) => d._id);
    const [salesEntries, paymentRecords, stockMovements] = await Promise.all([
      SalesEntry.find({ dayShiftId: { $in: dayShiftIds } }),
      PaymentRecord.find({ dayShiftId: { $in: dayShiftIds } }),
      StockMovement.find({
        stationId,
        date: { $gte: startDate, $lte: endDate },
      }),
    ]);

    const totalSalesExpected = salesEntries.reduce((sum, s) => sum + (s.expectedAmount || 0), 0);
    // totalAmount on SalesEntry is never populated; use cashier payment records instead
    const totalSalesActual = paymentRecords.reduce((sum, p) => sum + (p.totalReceived || 0), 0);

    const totalPaymentsCash = paymentRecords.reduce((sum, p) => sum + (p.cashReceived || 0), 0);
    const totalPaymentsPos = paymentRecords.reduce((sum, p) => sum + (p.posReceived || 0), 0);
    const totalPaymentsReceived = paymentRecords.reduce((sum, p) => sum + (p.totalReceived || 0), 0);

    const stockReceipts = stockMovements.filter((m) => m.movementType === 'receipt');
    const totalStockCost = stockReceipts.reduce((sum, m) => sum + (m.totalCost || 0), 0);

    const summary = {
      totalSalesExpected,
      totalSalesActual,
      totalPaymentsCash,
      totalPaymentsPos,
      totalPaymentsReceived,
      totalStockCost,
      netPosition: totalPaymentsReceived - totalStockCost,
    };

    return NextResponse.json({
      summary,
      counts: {
        salesEntries: salesEntries.length,
        paymentRecords: paymentRecords.length,
        stockReceipts: stockReceipts.length,
      },
    });
  } catch (error) {
    console.error('Error generating financial daily report:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate financial report' },
      { status: 500 }
    );
  }
}
