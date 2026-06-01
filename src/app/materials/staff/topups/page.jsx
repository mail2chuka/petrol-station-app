'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Table from '@/components/Table';
import { PageLoader } from '@/components/Loading';

export default function MaterialsTopupsPage() {
  const { data: session, status } = useSession();
  const [customers, setCustomers] = useState([]);
  const [topups, setTopups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ customerId: '', amount: '', method: 'cash', reference: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [custRes, topupRes] = await Promise.all([
        fetch('/api/materials/customers'),
        fetch('/api/materials/topups'),
      ]);
      const [custData, topupData] = await Promise.all([custRes.json(), topupRes.json()]);
      setCustomers(custData.customers || []);
      setTopups(topupData.topups || []);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'loading' || !session) return;
    loadData();
  }, [session, status, loadData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/materials/topups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, amount: Number(formData.amount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Top-up recorded. New balance: ₦${(data.newBalance || 0).toLocaleString()}`);
      setFormData({ customerId: '', amount: '', method: 'cash', reference: '', notes: '' });
      setShowForm(false);
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading') return <PageLoader />;

  const customerOptions = customers.map((c) => ({
    value: c._id,
    label: `${c.name} — ₦${(c.balance || 0).toLocaleString()}`,
  }));

  const methodOptions = [
    { value: 'cash', label: 'Cash' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'paystack', label: 'Paystack' },
  ];

  const columns = [
    { header: 'Customer', render: (r) => r.customerName },
    { header: 'Amount', render: (r) => <span className="font-semibold text-emerald-600">₦{r.amount.toLocaleString()}</span> },
    { header: 'Method', render: (r) => <span className="capitalize">{r.method.replace('_', ' ')}</span> },
    { header: 'Reference', render: (r) => r.reference || '—' },
    { header: 'Confirmed By', render: (r) => r.confirmedByName || '—' },
    { header: 'Date', render: (r) => new Date(r.createdAt).toLocaleDateString() },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Top-ups</h1>
          <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ Record Top-up'}</Button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</div>}
        {success && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl">{success}</div>}

        {showForm && (
          <Card title="Record Top-up" className="mb-6">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Select label="Customer" value={formData.customerId} onChange={(e) => setFormData((p) => ({ ...p, customerId: e.target.value }))} options={customerOptions} required />
              </div>
              <Input label="Amount (₦)" type="text" inputMode="decimal" value={formData.amount} onChange={(e) => setFormData((p) => ({ ...p, amount: e.target.value }))} required />
              <Select label="Method" value={formData.method} onChange={(e) => setFormData((p) => ({ ...p, method: e.target.value }))} options={methodOptions} />
              <Input label="Reference / Receipt No." value={formData.reference} onChange={(e) => setFormData((p) => ({ ...p, reference: e.target.value }))} placeholder="Optional" />
              <Input label="Notes" value={formData.notes} onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional" />
              <div className="sm:col-span-2">
                <Button type="submit" isLoading={submitting}>Confirm Top-up</Button>
              </div>
            </form>
          </Card>
        )}

        <Table columns={columns} data={topups} loading={loading} emptyMessage="No top-ups recorded" />
      </main>
    </div>
  );
}
