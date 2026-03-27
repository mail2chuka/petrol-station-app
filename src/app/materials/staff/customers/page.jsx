'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Table from '@/components/Table';
import { PageLoader } from '@/components/Loading';

export default function MaterialsCustomersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');

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
      setError(err.message || 'Failed to load customers');
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
        ? <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">Flagged</span>
        : <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">Active</span>,
    },
    {
      header: 'Actions',
      render: (r) => (
        <Button size="sm" variant="outline" onClick={() => router.push(`/api/materials/customers/${r._id}/statement`)}>
          Statement
        </Button>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <Button onClick={() => router.push('/admin/materials/customers')}>
            Manage Customer Accounts
          </Button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</div>}
        {success && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl">{success}</div>}

        <div className="mb-4">
          <Input
            placeholder="Search by name, phone or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Table columns={columns} data={customers} loading={loading} emptyMessage="No customers found" />
      </main>
    </div>
  );
}
