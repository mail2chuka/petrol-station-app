'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Card from '@/components/Card';
import Table from '@/components/Table';
import { PageLoader } from '@/components/Loading';

export default function CustomerDashboardPage() {
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
      setOrders((data.orders || []).slice(0, 5));
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

  const STATUS_COLORS = {
    pending: 'bg-amber-100 text-amber-700',
    fulfilled: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  const columns = [
    { header: 'Items', render: (r) => `${r.items?.length || 0} item(s)` },
    { header: 'Total', render: (r) => `₦${(r.totalAmount || 0).toLocaleString()}` },
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
      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">My Account</h1>
          <p className="text-slate-500 mt-1">Welcome back, {session?.user?.name}</p>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</div>}

        <div className="grid grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => router.push('/materials/customer/orders/new')}
            className="text-left p-6 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all"
          >
            <div className="text-3xl mb-2">🛒</div>
            <h3 className="font-semibold text-slate-900">Place Order</h3>
            <p className="text-sm text-slate-500 mt-1">Create a new materials order</p>
          </button>
          <button
            onClick={() => router.push('/materials/customer/orders')}
            className="text-left p-6 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all"
          >
            <div className="text-3xl mb-2">📋</div>
            <h3 className="font-semibold text-slate-900">My Orders</h3>
            <p className="text-sm text-slate-500 mt-1">View your order history</p>
          </button>
          <button
            onClick={() => router.push('/materials/customer/transactions')}
            className="text-left p-6 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all"
          >
            <div className="text-3xl mb-2">📊</div>
            <h3 className="font-semibold text-slate-900">Transactions</h3>
            <p className="text-sm text-slate-500 mt-1">View your transaction history</p>
          </button>
          <button
            onClick={() => router.push('/materials/customer/reports')}
            className="text-left p-6 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all"
          >
            <div className="text-3xl mb-2">🧾</div>
            <h3 className="font-semibold text-slate-900">Reports & Statement</h3>
            <p className="text-sm text-slate-500 mt-1">Filter orders, payments, and download a PDF statement</p>
          </button>
        </div>

        <h2 className="text-lg font-semibold text-slate-800 mb-3">Recent Orders</h2>
        <Table columns={columns} data={orders} loading={loading} emptyMessage="No orders yet" />
      </main>
    </div>
  );
}
