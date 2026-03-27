import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getProductModel } from '@/models/materials/Product';
import { getProductUnitModel } from '@/models/materials/ProductUnit';
import { requireBusinessRole } from '@/lib/auth';

async function getModels() {
  const conn = await connectMaterialsDB();
  return { Product: getProductModel(conn), ProductUnit: getProductUnitModel(conn) };
}

// GET /api/materials/products/units?productId=xxx
export async function GET(request) {
  try {
    await requireBusinessRole('materials', ['admin', 'staff', 'auditor', 'customer']);
    const { ProductUnit } = await getModels();
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const query = { isActive: true };
    if (productId) query.productId = productId;
    const units = await ProductUnit.find(query).sort({ name: 1 });
    return NextResponse.json({ units });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch units' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// POST /api/materials/products/units
export async function POST(request) {
  try {
    const currentUser = await requireBusinessRole('materials', ['admin']);
    const { Product, ProductUnit } = await getModels();

    const body = await request.json();
    const { productId, name, pricePerUnit, stockQuantity } = body;

    if (!productId || !name || pricePerUnit === undefined) {
      return NextResponse.json(
        { error: 'productId, name, and pricePerUnit are required' },
        { status: 400 }
      );
    }

    const product = await Product.findById(productId);
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    const unit = await ProductUnit.create({
      productId,
      productName: product.name,
      name: name.trim(),
      pricePerUnit: Number(pricePerUnit),
      stockQuantity: Number(stockQuantity ?? 0),
      createdBy: currentUser.id,
    });

    return NextResponse.json({ unit }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to create unit' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
