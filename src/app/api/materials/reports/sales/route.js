import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getOrderModel } from '@/models/materials/Order';
import { requireBusinessRole } from '@/lib/auth';

// GET /api/materials/reports/sales
export async function GET(request) {
  try {
    await requireBusinessRole('materials', ['admin', 'auditor']);
    const conn = await connectMaterialsDB();
    const Order = getOrderModel(conn);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') ? new Date(searchParams.get('from')) : null;
    const to = searchParams.get('to') ? new Date(searchParams.get('to')) : null;

    const matchStage = { status: 'fulfilled' };
    if (from || to) {
      matchStage.createdAt = {};
      if (from) matchStage.createdAt.$gte = from;
      if (to) matchStage.createdAt.$lte = to;
    }

    const [summary, byProduct, dailyTotals] = await Promise.all([
      Order.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            totalOwed: { $sum: '$amountOwed' },
            totalCollected: { $sum: '$balanceDeducted' },
            count: { $sum: 1 },
          },
        },
      ]),
      Order.aggregate([
        { $match: matchStage },
        { $unwind: '$items' },
        {
          $group: {
            _id: { productId: '$items.productId', productName: '$items.productName', unitName: '$items.unitName' },
            totalQuantity: { $sum: '$items.quantity' },
            totalRevenue: { $sum: '$items.subtotal' },
          },
        },
        { $sort: { totalRevenue: -1 } },
      ]),
      Order.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            totalRevenue: { $sum: '$totalAmount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return NextResponse.json({
      summary: summary[0] || { totalRevenue: 0, totalOwed: 0, totalCollected: 0, count: 0 },
      byProduct,
      dailyTotals,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to load sales report' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
