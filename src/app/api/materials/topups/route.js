import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getTopUpModel } from '@/models/materials/TopUp';
import { getCustomerModel } from '@/models/materials/Customer';
import { getTransactionModel } from '@/models/materials/Transaction';
import { requireBusinessRole } from '@/lib/auth';

async function getModels() {
  const conn = await connectMaterialsDB();
  return {
    TopUp: getTopUpModel(conn),
    Customer: getCustomerModel(conn),
    Transaction: getTransactionModel(conn),
  };
}

// GET /api/materials/topups
export async function GET(request) {
  try {
    const currentUser = await requireBusinessRole('materials', ['admin', 'staff', 'auditor', 'customer']);
    const { TopUp } = await getModels();
    const { searchParams } = new URL(request.url);

    const query = {};
    if (currentUser.role === 'customer') {
      query.customerId = currentUser.customerId;
    } else {
      const customerId = searchParams.get('customerId');
      const status = searchParams.get('status');
      if (customerId) query.customerId = customerId;
      if (status) query.status = status;
    }

    const topups = await TopUp.find(query).sort({ createdAt: -1 }).limit(200);
    return NextResponse.json({ topups });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch top-ups' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// POST /api/materials/topups - Staff records cash/bank top-up and immediately completes it
export async function POST(request) {
  try {
    const currentUser = await requireBusinessRole('materials', ['admin', 'staff']);
    const { TopUp, Customer, Transaction } = await getModels();

    const body = await request.json();
    const { customerId, amount, method, reference, notes } = body;

    if (!customerId || !amount || !method) {
      return NextResponse.json(
        { error: 'customerId, amount, and method are required' },
        { status: 400 }
      );
    }

    if (Number(amount) <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    const balanceBefore = customer.balance;
    customer.balance += Number(amount);
    await customer.save();

    const topup = await TopUp.create({
      customerId: customer._id,
      customerName: customer.name,
      amount: Number(amount),
      method,
      reference: reference?.trim(),
      status: 'completed',
      notes,
      confirmedBy: currentUser.id,
      confirmedByName: currentUser.name,
      confirmedAt: new Date(),
    });

    await Transaction.create({
      customerId: customer._id,
      customerName: customer.name,
      type: 'topup',
      amount: Number(amount),
      balanceBefore,
      balanceAfter: customer.balance,
      referenceType: 'TopUp',
      referenceId: topup._id,
      description: `Top-up via ${method}${reference ? ` (ref: ${reference})` : ''}${notes ? ` - ${notes}` : ''}`,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
    });

    return NextResponse.json({ topup, newBalance: customer.balance }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to record top-up' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
