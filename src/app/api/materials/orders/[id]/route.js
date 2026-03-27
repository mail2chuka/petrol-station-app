import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getOrderModel } from '@/models/materials/Order';
import { requireBusinessRole } from '@/lib/auth';

async function getModels() {
  const conn = await connectMaterialsDB();
  return { Order: getOrderModel(conn) };
}

// GET /api/materials/orders/[id]
export async function GET(request, { params }) {
  try {
    await requireBusinessRole('materials', ['admin', 'staff', 'auditor', 'customer']);
    const { Order } = await getModels();
    const { id } = await params;
    const order = await Order.findById(id);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch order' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
