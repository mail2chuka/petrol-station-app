import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getProductModel } from '@/models/materials/Product';
import { getProductUnitModel } from '@/models/materials/ProductUnit';
import { requireBusinessRole } from '@/lib/auth';

async function getModels() {
  const conn = await connectMaterialsDB();
  return { Product: getProductModel(conn), ProductUnit: getProductUnitModel(conn) };
}

// GET /api/materials/products/[id]
export async function GET(request, { params }) {
  try {
    await requireBusinessRole('materials', ['admin', 'staff', 'auditor', 'customer']);
    const { Product, ProductUnit } = await getModels();
    const { id } = await params;
    const product = await Product.findById(id);
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    const units = await ProductUnit.find({ productId: product._id, isActive: true });
    return NextResponse.json({ product, units });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch product' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// PATCH /api/materials/products/[id]
export async function PATCH(request, { params }) {
  try {
    await requireBusinessRole('materials', ['admin']);
    const { Product } = await getModels();
    const { id } = await params;

    const body = await request.json();
    const product = await Product.findById(id);
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    const { name, code, description, category, isActive } = body;
    if (name !== undefined) product.name = name.trim();
    if (code !== undefined) product.code = code?.trim();
    if (description !== undefined) product.description = description;
    if (category !== undefined) product.category = category?.trim();
    if (isActive !== undefined) product.isActive = isActive;

    await product.save();
    return NextResponse.json({ product });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to update product' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
