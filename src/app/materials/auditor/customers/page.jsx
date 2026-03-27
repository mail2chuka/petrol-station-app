'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Table from '@/components/Table';
import Input from '@/components/Input';
import { PageLoader } from '@/components/Loading';

export default function AuditorCustomersPage() {
  const { data: session, status } = useSession();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch(`/api/materials/customers?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCustomers(data.customers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (status === 'loading' || !session) return;
    fetchCustomers();
  }, [session, status, fetchCustomers]);

  if (status === 'loading') return <PageLoader />;

  const columns = [
    { header: 'Name', render: (r) => r.name },
    { header: 'Phone', render: (r) => r.phone || '—' },
    { header: 'Balance', render: (r) => <span className="font-semibold text-emerald-600">₦{(r.balance || 0).toLocaleString()}</span> },
    {
      header: 'Status',
      render: (r) => r.isFlagged
        ? <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">⚠ Flagged</span>
        : <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">Active</span>,
    },
    { header: 'Flag Reason', render: (r) => r.isFlagged ? r.flagReason || '—' : '—' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Customers (Read-only)</h1>
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</div>}
        <div className="mb-4">
          <Input placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Table columns={columns} data={customers} loading={loading} emptyMessage="No customers found" />
      </main>
    </div>
  );
}
