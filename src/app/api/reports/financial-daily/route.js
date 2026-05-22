import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
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

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const [salesEntries, paymentRecords, stockMovements] = await Promise.all([
      SalesEntry.find({
        stationId,
        createdAt: { $gte: startDate, $lte: endDate },
      }),
      PaymentRecord.find({
        stationId,
        createdAt: { $gte: startDate, $lte: endDate },
      }),
      StockMovement.find({
        stationId,
        date: { $gte: startDate, $lte: endDate },
      }),
    ]);

    const totalSalesExpected = salesEntries.reduce((sum, s) => sum + (s.expectedAmount || 0), 0);
    const totalSalesActual = salesEntries.reduce((sum, s) => sum + (s.totalAmount || 0), 0);

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
