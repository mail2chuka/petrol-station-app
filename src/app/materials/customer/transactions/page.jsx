'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Table from '@/components/Table';
import { PageLoader } from '@/components/Loading';

const TYPE_COLORS = {
  topup: 'text-emerald-600',
  order: 'text-red-600',
  refund: 'text-blue-600',
  adjustment: 'text-amber-600',
};

export default function CustomerTransactionsPage() {
  const { data: session, status } = useSession();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch('/api/materials/transactions');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTransactions(data.transactions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'loading' || !session) return;
    fetchTransactions();
  }, [session, status, fetchTransactions]);

  if (status === 'loading') return <PageLoader />;

  const columns = [
    {
      header: 'Type',
      render: (r) => (
        <span className={`capitalize font-medium ${TYPE_COLORS[r.type] || ''}`}>{r.type}</span>
      ),
    },
    {
      header: 'Amount',
      render: (r) => (
        <span className={r.amount >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
          {r.amount >= 0 ? '+' : ''}₦{Math.abs(r.amount).toLocaleString()}
        </span>
      ),
    },
    {
      header: 'Balance After',
      render: (r) => `₦${(r.balanceAfter || 0).toLocaleString()}`,
    },
    { header: 'Description', render: (r) => r.description || '—' },
    { header: 'Date', render: (r) => new Date(r.createdAt).toLocaleString() },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">My Transactions</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</div>
        )}

        <Table
          columns={columns}
          data={transactions}
          loading={loading}
          emptyMessage="No transactions yet"
        />
      </main>
    </div>
  );
}
