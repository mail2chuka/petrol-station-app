import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getTransactionModel } from '@/models/materials/Transaction';
import { requireBusinessRole } from '@/lib/auth';

// GET /api/materials/transactions
export async function GET(request) {
  try {
    const currentUser = await requireBusinessRole('materials', ['admin', 'staff', 'auditor', 'customer']);
    const conn = await connectMaterialsDB();
    const Transaction = getTransactionModel(conn);

    const { searchParams } = new URL(request.url);
    const query = {};

    if (currentUser.role === 'customer') {
      query.customerId = currentUser.customerId;
    } else {
      const customerId = searchParams.get('customerId');
      const type = searchParams.get('type');
      if (customerId) query.customerId = customerId;
      if (type) query.type = type;
    }

    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    const transactions = await Transaction.find(query).sort({ createdAt: -1 }).limit(500);
    return NextResponse.json({ transactions });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch transactions' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
