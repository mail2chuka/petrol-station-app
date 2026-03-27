import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getOrderModel } from '@/models/materials/Order';
import { getTopUpModel } from '@/models/materials/TopUp';
import { getCustomerModel } from '@/models/materials/Customer';
import { requireBusinessRole } from '@/lib/auth';

// GET /api/materials/reports/balance-sheet
export async function GET(request) {
  try {
    await requireBusinessRole('materials', ['admin', 'auditor']);
    const conn = await connectMaterialsDB();
    const Customer = getCustomerModel(conn);
    const Order = getOrderModel(conn);
    const TopUp = getTopUpModel(conn);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') ? new Date(searchParams.get('from')) : null;
    const to = searchParams.get('to') ? new Date(searchParams.get('to')) : null;

    const dateFilter = {};
    if (from) dateFilter.$gte = from;
    if (to) dateFilter.$lte = to;
    const hasDates = from || to;

    const [customers, topupSummary, orderSummary] = await Promise.all([
      Customer.find({ isActive: true }).select('name balance isFlagged').sort({ balance: -1 }),
      TopUp.aggregate([
        {
          $match: {
            status: 'completed',
            ...(hasDates ? { createdAt: dateFilter } : {}),
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
      Order.aggregate([
        {
          $match: {
            status: 'fulfilled',
            ...(hasDates ? { createdAt: dateFilter } : {}),
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            totalOwed: { $sum: '$amountOwed' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const totalBalance = customers.reduce((s, c) => s + c.balance, 0);

    return NextResponse.json({
      customers,
      totalBalance,
      topups: topupSummary[0] || { totalAmount: 0, count: 0 },
      orders: orderSummary[0] || { totalRevenue: 0, totalOwed: 0, count: 0 },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to load balance sheet' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
