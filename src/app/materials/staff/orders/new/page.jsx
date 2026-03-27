'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Select from '@/components/Select';
import Input from '@/components/Input';
import { PageLoader } from '@/components/Loading';

export default function NewOrderPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [items, setItems] = useState([{ unitId: '', quantity: '' }]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = useCallback(async () => {
    const [custRes, prodRes] = await Promise.all([
      fetch('/api/materials/customers'),
      fetch('/api/materials/products?withUnits=true'),
    ]);
    const [custData, prodData] = await Promise.all([custRes.json(), prodRes.json()]);
    setCustomers(custData.customers || []);
    setProducts(prodData.products || []);
  }, []);

  useEffect(() => {
    if (status === 'loading' || !session) return;
    loadData();
  }, [session, status, loadData]);

  const allUnits = products.flatMap((p) =>
    (p.units || []).map((u) => ({
      value: u._id,
      label: `${p.name} — ${u.name} (₦${u.pricePerUnit.toLocaleString()})`,
      pricePerUnit: u.pricePerUnit,
    }))
  );

  const addItem = () => setItems((prev) => [...prev, { unitId: '', quantity: '' }]);
  const removeItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const updateItem = (i, field, value) =>
    setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));

  const computedTotal = items.reduce((sum, item) => {
    const unit = allUnits.find((u) => u.value === item.unitId);
    return sum + (unit ? unit.pricePerUnit * Number(item.quantity || 0) : 0);
  }, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const validItems = items.filter((i) => i.unitId && Number(i.quantity) > 0);
    if (!selectedCustomer || validItems.length === 0) {
      setError('Please select a customer and add at least one valid item.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/materials/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: selectedCustomer, items: validItems, notes, confirmOrder: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Order confirmed successfully!');
      setTimeout(() => router.push('/materials/staff/orders'), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading') return <PageLoader />;

  const customerOptions = customers.map((c) => ({
    value: c._id,
    label: `${c.name}${c.isFlagged ? ' ⚠ Flagged' : ''} — Balance: ₦${(c.balance || 0).toLocaleString()}`,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="outline" size="sm" onClick={() => router.back()}>← Back</Button>
          <h1 className="text-2xl font-bold text-slate-900">New Order</h1>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</div>}
        {success && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl">{success}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card title="Customer">
            <Select
              label="Select Customer"
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              options={customerOptions}
              required
            />
          </Card>

          <Card title="Order Items">
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Select
                      label="Product / Unit"
                      value={item.unitId}
                      onChange={(e) => updateItem(i, 'unitId', e.target.value)}
                      options={allUnits}
                      required
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      label="Qty"
                      type="number"
                      min="0.001"
                      step="any"
                      value={item.quantity}
                      onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                      required
                    />
                  </div>
                  {items.length > 1 && (
                    <Button type="button" variant="danger" size="sm" onClick={() => removeItem(i)}>✕</Button>
                  )}
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={addItem}>
              + Add Item
            </Button>
          </Card>

          <Card title="Summary">
            <div className="flex justify-between items-center text-lg">
              <span className="text-slate-600">Total Amount</span>
              <span className="font-bold text-slate-900">₦{computedTotal.toLocaleString()}</span>
            </div>
            <Input
              label="Notes (optional)"
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special instructions…"
              className="mt-4"
            />
          </Card>

          <Button type="submit" fullWidth size="lg" isLoading={submitting}>
            Create Order
          </Button>
        </form>
      </main>
    </div>
  );
}
