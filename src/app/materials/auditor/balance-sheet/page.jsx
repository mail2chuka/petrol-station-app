'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Card from '@/components/Card';
import Table from '@/components/Table';
import { PageLoader } from '@/components/Loading';

export default function BalanceSheetPage() {
  const { data: session, status } = useSession();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/materials/reports/balance-sheet');
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'loading' || !session) return;
    fetchData();
  }, [session, status, fetchData]);

  if (status === 'loading') return <PageLoader />;

  const columns = [
    { header: 'Customer', render: (r) => r.name },
    { header: 'Balance', render: (r) => <span className="font-semibold text-emerald-600">₦{(r.balance || 0).toLocaleString()}</span> },
    {
      header: 'Status',
      render: (r) => r.isFlagged
        ? <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">Flagged</span>
        : <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">Active</span>,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Balance Sheet</h1>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</div>}

        {!loading && data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <Card>
                <p className="text-sm text-slate-500">Total Customer Balances</p>
                <p className="text-lg sm:text-xl font-bold text-emerald-600 mt-1 break-words tabular-nums leading-tight">₦{(data.totalBalance || 0).toLocaleString()}</p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">Total Top-ups</p>
                <p className="text-lg sm:text-xl font-bold mt-1 break-words tabular-nums leading-tight">₦{(data.topups.totalAmount || 0).toLocaleString()}</p>
                <p className="text-xs text-slate-400">{data.topups.count} transactions</p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">Total Revenue</p>
                <p className="text-lg sm:text-xl font-bold mt-1 break-words tabular-nums leading-tight">₦{(data.orders.totalRevenue || 0).toLocaleString()}</p>
                <p className="text-xs text-slate-400">{data.orders.count} orders fulfilled</p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">Total Owed</p>
                <p className="text-lg sm:text-xl font-bold text-red-600 mt-1 break-words tabular-nums leading-tight">₦{(data.orders.totalOwed || 0).toLocaleString()}</p>
              </Card>
            </div>

            <h2 className="text-lg font-semibold text-slate-800 mb-3">Customer Balances</h2>
            <Table columns={columns} data={data.customers} loading={false} emptyMessage="No customers" />
          </>
        )}
      </main>
    </div>
  );
}
