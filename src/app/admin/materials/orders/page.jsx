'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import Button from '@/components/Button';
import Select from '@/components/Select';
import Table from '@/components/Table';
import { PageLoader } from '@/components/Loading';

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-700',
  fulfilled: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export default function AdminMaterialsOrdersPage() {
  const { data: session, status } = useSession();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionId, setActionId] = useState(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch('/api/materials/orders?' + params.toString());
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrders(data.orders || []);
    } catch (err) {
      setError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (status === 'loading' || !session) return;
    fetchOrders();
  }, [session, status, fetchOrders]);

  const handleAction = async (orderId, action) => {
    if (!confirm(`${action === 'fulfill' ? 'Fulfill' : 'Cancel'} this order?`)) return;
    setActionId(orderId);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/materials/orders/${orderId}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Order ${action === 'fulfill' ? 'fulfilled' : 'cancelled'}`);
      fetchOrders();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionId(null);
    }
  };

  if (status === 'loading') return <PageLoader />;

  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'fulfilled', label: 'Fulfilled' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const columns = [
    { header: 'Order #', render: (r) => <span className="font-mono text-xs">{r._id.slice(-6).toUpperCase()}</span> },
    { header: 'Customer', render: (r) => r.customerName || '—' },
    {
      header: 'Items',
      render: (r) =>
        r.items?.map((item, i) => (
          <div key={i} className="text-xs">
            {item.quantity} × {item.unitName} of {item.productName}
          </div>
        )),
    },
    {
      header: 'Total',
      render: (r) => {
        const total = r.items?.reduce((sum, i) => sum + (i.subtotal || 0), 0) || 0;
        return `₦${total.toLocaleString()}`;
      },
    },
    {
      header: 'Status',
      render: (r) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || ''}`}>
          {r.status}
        </span>
      ),
    },
    {
      header: 'Date',
      render: (r) => r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—',
    },
    {
      header: 'Actions',
      render: (r) =>
        r.status === 'pending' ? (
          <div className="flex gap-2">
            <Button size="sm" disabled={actionId === r._id} onClick={() => handleAction(r._id, 'fulfill')}>
              Fulfill
            </Button>
            <Button size="sm" variant="secondary" disabled={actionId === r._id} onClick={() => handleAction(r._id, 'cancel')}>
              Cancel
            </Button>
          </div>
        ) : (
          <span className="text-xs text-slate-400 capitalize">{r.status}</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-900">All Orders</h1>
        <div className="w-48">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={statusOptions} />
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</div>}
      {success && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl">{success}</div>}

      <Table columns={columns} data={orders} loading={loading} emptyMessage="No orders found" />
    </div>
  );
}
