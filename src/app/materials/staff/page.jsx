'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Card from '@/components/Card';
import { PageLoader } from '@/components/Loading';

export default function MaterialsStaffPage() {
  const { data: session, status } = useSession();
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
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session || session.user.business !== 'materials') return;
    fetchStats();
  }, [session, status, fetchStats]);

  if (status === 'loading') return <PageLoader />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Staff Dashboard</h1>
          <p className="text-slate-500 mt-1">Building Materials — {session?.user?.name}</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <p className="text-sm text-slate-500">Total Customers</p>
              <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{stats.totalCustomers}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Pending Orders</p>
              <p className="text-2xl font-bold text-amber-600 mt-1 tabular-nums">{stats.pendingOrders}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Today&apos;s Sales</p>
              <p className="text-lg sm:text-xl font-bold text-emerald-600 mt-1 break-words tabular-nums leading-tight">
                ₦{(stats.todaySales || 0).toLocaleString()}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Today&apos;s Top-ups</p>
              <p className="text-lg sm:text-xl font-bold text-blue-600 mt-1 break-words tabular-nums leading-tight">
                ₦{(stats.todayTopUps || 0).toLocaleString()}
              </p>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: 'Customers', href: '/materials/staff/customers', icon: '👥', desc: 'Manage customer accounts & balances' },
            { label: 'New Order', href: '/materials/staff/orders/new', icon: '🛒', desc: 'Create a new customer order' },
            { label: 'Orders', href: '/materials/staff/orders', icon: '📋', desc: 'View & fulfill pending orders' },
            { label: 'Top-ups', href: '/materials/staff/topups', icon: '💳', desc: 'Record customer balance top-ups' },
            { label: 'Reports', href: '/materials/staff/reports', icon: '📈', desc: 'View quantity-based sales activity without prices' },
          ].map((item) => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className="text-left p-6 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all"
            >
              <div className="text-3xl mb-3">{item.icon}</div>
              <h3 className="font-semibold text-slate-900">{item.label}</h3>
              <p className="text-sm text-slate-500 mt-1">{item.desc}</p>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
