'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Button from '@/components/Button';
import Table from '@/components/Table';
import { PageLoader } from '@/components/Loading';

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-700',
  fulfilled: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function MaterialsOrdersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fulfilling, setFulfilling] = useState(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/materials/orders');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrders(data.orders || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'loading' || !session) return;
    fetchOrders();
  }, [session, status, fetchOrders]);

  const handleFulfill = async (orderId) => {
    if (!confirm('Mark this order as fulfilled and deduct from customer balance?')) return;
    setFulfilling(orderId);
    try {
      const res = await fetch(`/api/materials/orders/${orderId}/fulfill`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchOrders();
    } catch (err) {
      setError(err.message);
    } finally {
      setFulfilling(null);
    }
  };

  if (status === 'loading') return <PageLoader />;

  const columns = [
    { header: 'Customer', render: (r) => r.customerName || '—' },
    { header: 'Items', render: (r) => `${r.items?.length || 0} item(s)` },
    { header: 'Total', render: (r) => <span className="font-semibold">₦{(r.totalAmount || 0).toLocaleString()}</span> },
    { header: 'Owed', render: (r) => r.amountOwed > 0 ? <span className="text-red-600">₦{r.amountOwed.toLocaleString()}</span> : '—' },
    {
      header: 'Status',
      render: (r) => (
        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[r.status] || ''}`}>
          {r.status}
        </span>
      ),
    },
    { header: 'Date', render: (r) => new Date(r.createdAt).toLocaleDateString() },
    {
      header: 'Actions',
      render: (r) => r.status === 'pending' ? (
        <Button
          size="sm"
          variant="primary"
          disabled={fulfilling === r._id}
          onClick={() => handleFulfill(r._id)}
        >
          {fulfilling === r._id ? 'Processing…' : 'Fulfill'}
        </Button>
      ) : null,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
          <Button onClick={() => router.push('/materials/staff/orders/new')}>+ New Order</Button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</div>}

        <Table columns={columns} data={orders} loading={loading} emptyMessage="No orders found" />
      </main>
    </div>
  );
}
