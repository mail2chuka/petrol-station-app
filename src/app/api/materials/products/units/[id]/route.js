import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getProductUnitModel } from '@/models/materials/ProductUnit';
import { requireBusinessRole } from '@/lib/auth';

async function getModel() {
  const conn = await connectMaterialsDB();
  return getProductUnitModel(conn);
}

export async function PATCH(request, { params }) {
  try {
    await requireBusinessRole('materials', ['admin']);
    const ProductUnit = await getModel();
    const { id } = await params;
    const body = await request.json();

    const unit = await ProductUnit.findById(id);
    if (!unit) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    if (body.name !== undefined) unit.name = String(body.name).trim();
    if (body.pricePerUnit !== undefined) unit.pricePerUnit = Number(body.pricePerUnit);
    if (body.stockQuantity !== undefined) unit.stockQuantity = Number(body.stockQuantity);
    if (body.isActive !== undefined) unit.isActive = Boolean(body.isActive);

    await unit.save();
    return NextResponse.json({ unit });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to update unit' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
