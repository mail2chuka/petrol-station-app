'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Table from '@/components/Table';
import Button from '@/components/Button';
import { PageLoader } from '@/components/Loading';

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-700',
  fulfilled: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function CustomerOrdersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOrders = useCallback(async () => {
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

  if (status === 'loading') return <PageLoader />;

  const columns = [
    { header: 'Items', render: (r) => `${r.items?.length || 0} item(s)` },
    { header: 'Total', render: (r) => `₦${(r.totalAmount || 0).toLocaleString()}` },
    { header: 'Paid', render: (r) => `₦${(r.balanceDeducted || 0).toLocaleString()}` },
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
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">My Orders</h1>
          <Button onClick={() => router.push('/materials/customer/orders/new')}>+ New Order</Button>
        </div>
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</div>}
        <Table columns={columns} data={orders} loading={loading} emptyMessage="You have no orders yet" />
      </main>
    </div>
  );
}
