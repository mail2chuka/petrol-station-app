'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Table from '@/components/Table';
import { PageLoader } from '@/components/Loading';

export default function AdminMaterialsProductsPage() {
  const { data: session, status } = useSession();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showProductForm, setShowProductForm] = useState(false);
  const [productForm, setProductForm] = useState({ name: '', category: '', description: '' });
  const [submittingProduct, setSubmittingProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editProductForm, setEditProductForm] = useState({ name: '', category: '', description: '' });
  const [savingProductEdit, setSavingProductEdit] = useState(false);

  const [showUnitForm, setShowUnitForm] = useState(null); // productId
  const [unitForm, setUnitForm] = useState({ name: '', pricePerUnit: '', stockQuantity: '' });
  const [submittingUnit, setSubmittingUnit] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [editUnitForm, setEditUnitForm] = useState({ name: '', pricePerUnit: '', stockQuantity: '' });
  const [savingUnitEdit, setSavingUnitEdit] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/materials/products?withUnits=true');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProducts(data.products || []);
    } catch (err) {
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'loading' || !session) return;
    fetchProducts();
  }, [session, status, fetchProducts]);

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    setSubmittingProduct(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/materials/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Product created');
      setProductForm({ name: '', category: '', description: '' });
      setShowProductForm(false);
      fetchProducts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingProduct(false);
    }
  };

  const handleAddUnit = async (e, productId) => {
    e.preventDefault();
    setSubmittingUnit(true);
    setError('');
    setSuccess('');
    try {
      const product = products.find((p) => p._id === productId);
      const res = await fetch('/api/materials/products/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          productName: product?.name,
          name: unitForm.name,
          pricePerUnit: parseFloat(unitForm.pricePerUnit),
          stockQuantity: parseFloat(unitForm.stockQuantity || 0),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Unit added');
      setUnitForm({ name: '', pricePerUnit: '', stockQuantity: '' });
      setShowUnitForm(null);
      fetchProducts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingUnit(false);
    }
  };

  const openEditProduct = (product) => {
    setEditingProduct(product);
    setEditProductForm({
      name: product.name || '',
      category: product.category || '',
      description: product.description || '',
    });
  };

  const saveProductEdit = async () => {
    if (!editingProduct?._id) return;
    setSavingProductEdit(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/materials/products/${editingProduct._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editProductForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Product updated');
      setEditingProduct(null);
      fetchProducts();
    } catch (err) {
      setError(err.message || 'Failed to update product');
    } finally {
      setSavingProductEdit(false);
    }
  };

  const openEditUnit = (unit) => {
    setEditingUnit(unit);
    setEditUnitForm({
      name: unit.name || '',
      pricePerUnit: unit.pricePerUnit ?? '',
      stockQuantity: unit.stockQuantity ?? 0,
    });
  };

  const saveUnitEdit = async () => {
    if (!editingUnit?._id) return;
    setSavingUnitEdit(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/materials/products/units/${editingUnit._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editUnitForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Inventory updated');
      setEditingUnit(null);
      fetchProducts();
    } catch (err) {
      setError(err.message || 'Failed to update unit');
    } finally {
      setSavingUnitEdit(false);
    }
  };

  if (status === 'loading') return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Products & Pricing</h1>
        <Button onClick={() => setShowProductForm(!showProductForm)}>
          {showProductForm ? 'Cancel' : '+ New Product'}
        </Button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</div>}
      {success && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl">{success}</div>}

      {showProductForm && (
        <Card title="New Product" className="border border-slate-200">
          <form onSubmit={handleCreateProduct} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Product Name" value={productForm.name} onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))} required />
            <Input label="Category" value={productForm.category} onChange={(e) => setProductForm((p) => ({ ...p, category: e.target.value }))} />
            <Input label="Description" value={productForm.description} onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))} />
            <p className="text-xs text-slate-500 sm:col-span-2">Product code is auto-generated as a unique 5-digit number.</p>
            <div className="sm:col-span-2">
              <Button type="submit" isLoading={submittingProduct}>Create Product</Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <PageLoader />
      ) : products.length === 0 ? (
        <p className="text-slate-500 text-center py-8">No products yet.</p>
      ) : (
        <div className="space-y-4">
          {products.map((product) => (
            <Card key={product._id} className="border border-slate-200">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">{product.name}</h2>
                  <div className="text-xs text-slate-500 space-x-3">
                    {product.code && <span>Code: {product.code}</span>}
                    {product.category && <span>Category: {product.category}</span>}
                    {product.description && <span>{product.description}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEditProduct(product)}>Edit Product</Button>
                  <Button size="sm" onClick={() => setShowUnitForm(showUnitForm === product._id ? null : product._id)}>
                    {showUnitForm === product._id ? 'Done' : '+ Add Unit'}
                  </Button>
                </div>
              </div>

              {showUnitForm === product._id && (
                <form onSubmit={(e) => handleAddUnit(e, product._id)} className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t pt-4">
                  <Input label="Unit Name (e.g. Bag, Ton)" value={unitForm.name} onChange={(e) => setUnitForm((u) => ({ ...u, name: e.target.value }))} required />
                  <Input label="Price Per Unit (₦)" type="number" min="0" step="0.01" value={unitForm.pricePerUnit} onChange={(e) => setUnitForm((u) => ({ ...u, pricePerUnit: e.target.value }))} required />
                  <Input label="Opening Stock" type="number" min="0" step="0.001" value={unitForm.stockQuantity} onChange={(e) => setUnitForm((u) => ({ ...u, stockQuantity: e.target.value }))} />
                  <div className="flex items-end sm:col-span-3">
                    <Button type="submit" isLoading={submittingUnit}>Add Unit</Button>
                  </div>
                </form>
              )}

              {product.units && product.units.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b text-slate-500">
                        <th className="py-1 pr-4">Unit</th>
                        <th className="py-1">Price</th>
                        <th className="py-1">Stock</th>
                        <th className="py-1">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.units.map((unit) => (
                        <tr key={unit._id} className="border-b last:border-0">
                          <td className="py-1 pr-4">{unit.name}</td>
                          <td className="py-1">₦{unit.pricePerUnit?.toLocaleString()}</td>
                          <td className="py-1">{Number(unit.stockQuantity || 0).toLocaleString()}</td>
                          <td className="py-1">
                            <Button size="sm" variant="secondary" onClick={() => openEditUnit(unit)}>Edit Stock</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(!product.units || product.units.length === 0) && (
                <p className="text-xs text-slate-400 mt-3">No units yet — add a unit to enable ordering.</p>
              )}
            </Card>
          ))}
        </div>
      )}

      {editingProduct && (
        <Card title={`Edit Product: ${editingProduct.name}`} className="border border-slate-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Product Name" value={editProductForm.name} onChange={(e) => setEditProductForm((p) => ({ ...p, name: e.target.value }))} required />
            <Input label="Category" value={editProductForm.category} onChange={(e) => setEditProductForm((p) => ({ ...p, category: e.target.value }))} />
            <Input label="Description" value={editProductForm.description} onChange={(e) => setEditProductForm((p) => ({ ...p, description: e.target.value }))} className="sm:col-span-2" />
            <div className="sm:col-span-2 flex gap-2">
              <Button isLoading={savingProductEdit} onClick={saveProductEdit}>Save Changes</Button>
              <Button variant="secondary" onClick={() => setEditingProduct(null)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {editingUnit && (
        <Card title={`Edit Inventory: ${editingUnit.productName} - ${editingUnit.name}`} className="border border-slate-200">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Unit Name" value={editUnitForm.name} onChange={(e) => setEditUnitForm((p) => ({ ...p, name: e.target.value }))} required />
            <Input label="Price Per Unit (₦)" type="number" min="0" step="0.01" value={editUnitForm.pricePerUnit} onChange={(e) => setEditUnitForm((p) => ({ ...p, pricePerUnit: e.target.value }))} required />
            <Input label="Stock Quantity" type="number" min="0" step="0.001" value={editUnitForm.stockQuantity} onChange={(e) => setEditUnitForm((p) => ({ ...p, stockQuantity: e.target.value }))} required />
            <div className="sm:col-span-3 flex gap-2">
              <Button isLoading={savingUnitEdit} onClick={saveUnitEdit}>Save Inventory</Button>
              <Button variant="secondary" onClick={() => setEditingUnit(null)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
