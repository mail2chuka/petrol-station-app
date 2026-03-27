import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getCustomerModel } from '@/models/materials/Customer';
import { getMaterialsUserModel } from '@/models/materials/User';
import { getTransactionModel } from '@/models/materials/Transaction';
import { getOrderModel } from '@/models/materials/Order';
import { getTopUpModel } from '@/models/materials/TopUp';
import { requireBusinessRole } from '@/lib/auth';

async function getModels() {
  const conn = await connectMaterialsDB();
  return {
    conn,
    Customer: getCustomerModel(conn),
    User: getMaterialsUserModel(conn),
    Transaction: getTransactionModel(conn),
    Order: getOrderModel(conn),
    TopUp: getTopUpModel(conn),
  };
}

// GET /api/materials/customers/[id]
export async function GET(request, { params }) {
  try {
    await requireBusinessRole('materials', ['admin', 'staff', 'auditor']);
    const { Customer } = await getModels();
    const { id } = await params;
    const customer = await Customer.findById(id);
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    return NextResponse.json({ customer });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch customer' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// PATCH /api/materials/customers/[id]
export async function PATCH(request, { params }) {
  try {
    await requireBusinessRole('materials', ['admin', 'staff']);
    const { Customer, User } = await getModels();

    const body = await request.json();
    const { name, phone, email, address, creditLimit, isActive } = body;

    const { id } = await params;
    const customer = await Customer.findById(id);
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    if (email !== undefined && !email?.trim()) {
      return NextResponse.json({ error: 'Customer email is required' }, { status: 400 });
    }

    if (name !== undefined) customer.name = name.trim();
    if (phone !== undefined) customer.phone = phone?.trim();
    if (email !== undefined) customer.email = email?.toLowerCase().trim();
    if (address !== undefined) customer.address = address?.trim();
    if (creditLimit !== undefined) customer.creditLimit = Number(creditLimit);
    if (isActive !== undefined) customer.isActive = isActive;

    await customer.save();

    if (customer.userId) {
      const linkedUser = await User.findById(customer.userId);
      if (linkedUser) {
        if (name !== undefined) linkedUser.name = name.trim();
        if (phone !== undefined) linkedUser.phone = phone?.trim();
        if (email !== undefined) linkedUser.email = email?.toLowerCase().trim();
        await linkedUser.save();
      }
    }

    return NextResponse.json({ customer });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to update customer' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
