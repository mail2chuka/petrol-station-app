'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/Card';
import Table from '@/components/Table';
import { PageLoader } from '@/components/Loading';

export default function AdminMaterialsDashboard() {
  const { data: session } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/materials/dashboard');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStats(data);
    } catch (err) {
      setError(err.message || 'Failed to load materials dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-white via-blue-50 to-white rounded-2xl border-2 border-blue-100 shadow-lg p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-blue-500">
              Building Materials
            </h1>
            <p className="text-base text-gray-600 mt-1">Manage customers, products, orders and top-ups.</p>
          </div>
          <div className="text-right hidden sm:block bg-white/80 rounded-xl px-4 py-2 shadow-sm">
            <p className="text-xs text-gray-500">Signed in as</p>
            <p className="text-sm font-bold text-blue-700 truncate max-w-[10rem]">{session?.user?.name}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-800 px-5 py-4 rounded-xl">
          {error}
        </div>
      )}

      {/* KPI cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/admin/materials/customers"
            className="group bg-white rounded-2xl border-2 border-slate-200 hover:border-blue-300 shadow hover:shadow-md transition-all p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Customers</p>
            <p className="text-4xl font-black text-blue-700">{stats.totalCustomers}</p>
            {stats.flaggedCustomers > 0 && (
              <p className="text-xs text-red-500 mt-1">⚠ {stats.flaggedCustomers} flagged</p>
            )}
          </Link>

          <Link href="/admin/materials/orders"
            className="group bg-white rounded-2xl border-2 border-slate-200 hover:border-amber-300 shadow hover:shadow-md transition-all p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Pending Orders</p>
            <p className="text-4xl font-black text-amber-600">{stats.pendingOrders}</p>
            <p className="text-xs text-gray-400 mt-1">Awaiting fulfillment</p>
          </Link>

          <div className="bg-white rounded-2xl border-2 border-slate-200 shadow p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Today&#39;s Sales</p>
            <p className="text-3xl font-black text-emerald-600">₦{(stats.todaySales || 0).toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">{stats.todayOrderCount || 0} orders</p>
          </div>

          <div className="bg-white rounded-2xl border-2 border-slate-200 shadow p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Today&#39;s Top-ups</p>
            <p className="text-3xl font-black text-blue-600">₦{(stats.todayTopUps || 0).toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">{stats.todayTopUpCount || 0} top-ups</p>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'Customers', href: '/admin/materials/customers', icon: '👥' },
          { label: 'Products', href: '/admin/materials/products', icon: '📦' },
          { label: 'Staff', href: '/admin/materials/staff', icon: '🧑‍💼' },
          { label: 'Orders', href: '/admin/materials/orders', icon: '📋' },
          { label: 'Reports', href: '/admin/materials/reports', icon: '📈' },
        ].map((item) => (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            className="text-left p-5 bg-white rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all"
          >
            <div className="text-2xl mb-2">{item.icon}</div>
            <p className="font-semibold text-slate-900 text-sm">{item.label}</p>
          </button>
        ))}
      </div>

      {/* Recent pending orders */}
      {stats?.recentOrders?.length > 0 && (
        <Card
          title="Pending Orders"
          action={
            <Link href="/admin/materials/orders" className="text-sm font-medium text-blue-600 hover:underline">
              View All →
            </Link>
          }
        >
          <Table
            columns={[
              { header: 'Customer', render: (r) => r.customerName || '—' },
              { header: 'Items', render: (r) => `${r.items?.length || 0} item(s)` },
              {
                header: 'Amount',
                render: (r) => (
                  <span className="font-semibold">₦{(r.totalAmount || 0).toLocaleString()}</span>
                ),
              },
              { header: 'Date', render: (r) => new Date(r.createdAt).toLocaleDateString() },
            ]}
            data={stats.recentOrders}
          />
        </Card>
      )}
    </div>
  );
}
