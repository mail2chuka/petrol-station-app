'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Card from '@/components/Card';
import Table from '@/components/Table';
import Button from '@/components/Button';
import { PageLoader } from '@/components/Loading';

export default function MaterialsAuditorPage() {
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
    if (status === 'loading' || !session) return;
    fetchStats();
  }, [session, status, fetchStats]);

  if (status === 'loading') return <PageLoader />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Auditor Dashboard</h1>
          <p className="text-slate-500 mt-1">Read-only view of building materials operations</p>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</div>}

        {!loading && stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card><p className="text-sm text-slate-500">Total Customers</p><p className="text-3xl font-bold mt-1">{stats.totalCustomers}</p></Card>
            <Card><p className="text-sm text-slate-500">Flagged</p><p className="text-3xl font-bold text-red-600 mt-1">{stats.flaggedCustomers}</p></Card>
            <Card><p className="text-sm text-slate-500">Today&apos;s Sales</p><p className="text-3xl font-bold text-emerald-600 mt-1">₦{(stats.todaySales || 0).toLocaleString()}</p></Card>
            <Card><p className="text-sm text-slate-500">Today&apos;s Top-ups</p><p className="text-3xl font-bold text-blue-600 mt-1">₦{(stats.todayTopUps || 0).toLocaleString()}</p></Card>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Customers', href: '/materials/auditor/customers', icon: '👥', desc: 'View all customers and balances' },
            { label: 'Transactions', href: '/materials/auditor/transactions', icon: '📊', desc: 'Full transaction history' },
            { label: 'Balance Sheet', href: '/materials/auditor/balance-sheet', icon: '📋', desc: 'Receivables & fund overview' },
            { label: 'Reports', href: '/materials/auditor/reports', icon: '📈', desc: 'Review income, sales value, and debt by period' },
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
