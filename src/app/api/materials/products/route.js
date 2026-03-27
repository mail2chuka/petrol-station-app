import { NextResponse } from 'next/server';
import connectMaterialsDB from '@/lib/db-materials';
import { getProductModel } from '@/models/materials/Product';
import { getProductUnitModel } from '@/models/materials/ProductUnit';
import { requireBusinessRole } from '@/lib/auth';

async function getModels() {
  const conn = await connectMaterialsDB();
  return { conn, Product: getProductModel(conn), ProductUnit: getProductUnitModel(conn) };
}

async function generateUniqueFiveDigitCode(Product) {
  // 10000 - 99999 => exactly 5 digits.
  const min = 10000;
  const max = 99999;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = String(Math.floor(Math.random() * (max - min + 1)) + min);
    const exists = await Product.findOne({ code }).select('_id');
    if (!exists) return code;
  }

  throw new Error('Unable to generate unique product code. Please try again.');
}

// GET /api/materials/products
export async function GET(request) {
  try {
    await requireBusinessRole('materials', ['admin', 'staff', 'auditor', 'customer']);
    const { Product, ProductUnit } = await getModels();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const withUnits = searchParams.get('withUnits') === 'true';

    const query = { isActive: true };
    if (category) query.category = category;

    const products = await Product.find(query).sort({ category: 1, name: 1 });

    if (!withUnits) return NextResponse.json({ products });

    const productIds = products.map((p) => p._id);
    const units = await ProductUnit.find({ productId: { $in: productIds }, isActive: true });

    const unitsMap = {};
    units.forEach((u) => {
      const key = u.productId.toString();
      if (!unitsMap[key]) unitsMap[key] = [];
      unitsMap[key].push(u);
    });

    const productsWithUnits = products.map((p) => ({
      ...p.toObject(),
      units: unitsMap[p._id.toString()] || [],
    }));

    return NextResponse.json({ products: productsWithUnits });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch products' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// POST /api/materials/products
export async function POST(request) {
  try {
    const currentUser = await requireBusinessRole('materials', ['admin']);
    const { Product } = await getModels();

    const body = await request.json();
    const { name, description, category } = body;

    if (!name) return NextResponse.json({ error: 'Product name is required' }, { status: 400 });

    const code = await generateUniqueFiveDigitCode(Product);

    const product = await Product.create({
      name: name.trim(),
      code,
      description,
      category: category?.trim(),
      createdBy: currentUser.id,
      createdByName: currentUser.name,
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to create product' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
