import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getCustomerModel } from '@/models/materials/Customer';
import { getOrderModel } from '@/models/materials/Order';
import { getTopUpModel } from '@/models/materials/TopUp';
import { requireBusinessRole } from '@/lib/auth';

// GET /api/materials/dashboard
export async function GET() {
  try {
    await requireBusinessRole('materials', ['admin', 'staff', 'auditor']);
    const conn = await connectMaterialsDB();
    const Customer = getCustomerModel(conn);
    const Order = getOrderModel(conn);
    const TopUp = getTopUpModel(conn);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalCustomers,
      flaggedCustomers,
      pendingOrders,
      todayOrders,
      todayTopUps,
      recentOrders,
    ] = await Promise.all([
      Customer.countDocuments({ isActive: true }),
      Customer.countDocuments({ isFlagged: true, isActive: true }),
      Order.countDocuments({ status: 'pending' }),
      Order.aggregate([
        { $match: { createdAt: { $gte: today, $lt: tomorrow }, status: 'fulfilled' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
      TopUp.aggregate([
        { $match: { createdAt: { $gte: today, $lt: tomorrow }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Order.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(10),
    ]);

    return NextResponse.json({
      totalCustomers,
      flaggedCustomers,
      pendingOrders,
      todaySales: todayOrders[0]?.total ?? 0,
      todayOrderCount: todayOrders[0]?.count ?? 0,
      todayTopUps: todayTopUps[0]?.total ?? 0,
      todayTopUpCount: todayTopUps[0]?.count ?? 0,
      recentOrders,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to load dashboard' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
