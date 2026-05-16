"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Select from '@/components/Select';
import Input, { Textarea } from '@/components/Input';
import Button from '@/components/Button';
import Table, { TableBadge } from '@/components/Table';
import Loading from '@/components/Loading';

function ManagerPriceChangesPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const activeStationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [station, setStation] = useState(null);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ fuelType: 'PMS', price: '', reason: '' });

  useEffect(() => {
    fetchData();
  }, [activeStationId]);

  const fetchData = async () => {
    if (!activeStationId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/stations/${activeStationId}/prices?limit=20`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load price changes');
        return;
      }
      setStation(data.station || null);
      setRequests(data.priceRequests || []);
    } catch (fetchError) {
      setError('Failed to load price changes');
    } finally {
      setLoading(false);
    }
  };

  const submitRequest = async () => {
    setError('');
    setSuccess('');

    const price = Number(form.price);
    if (!Number.isFinite(price) || price <= 0) {
      setError('Enter a valid positive price.');
      return;
    }
    if (!form.reason.trim()) {
      setError('Reason is required for a mid-day price change request.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/stations/${activeStationId}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: activeStationId,
          fuelType: form.fuelType,
          price,
          reason: form.reason.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to submit price change request');
        return;
      }

      setSuccess(data.message || 'Price change request submitted.');
      setForm((current) => ({ ...current, price: '', reason: '' }));
      await fetchData();
    } catch (submitError) {
      setError('Failed to submit price change request');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { header: 'Fuel', field: 'fuelType' },
    { header: 'Current', render: (row) => `N${Number(row.previousPrice || 0).toFixed(2)}` },
    { header: 'Requested', render: (row) => `N${Number(row.newPrice || 0).toFixed(2)}` },
    { header: 'Status', render: (row) => (
      <TableBadge variant={row.approvalStatus === 'approved' ? 'success' : row.approvalStatus === 'rejected' ? 'danger' : 'warning'}>
        {row.approvalStatus}
      </TableBadge>
    ) },
    { header: 'Reason', field: 'reason' },
    { header: 'When', render: (row) => new Date(row.createdAt).toLocaleString() },
  ];

  if (!activeStationId) {
    return (
      <Card title="Select Station">
        <p className="text-sm text-gray-600">Choose a station from the Admin Stations page to manage.</p>
      </Card>
    );
  }

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Mid-Day Price Changes</h1>
        <p className="mt-2 text-sm text-gray-600">Request a PMS or AGO price change during an active day. Admin approval is required before it takes effect.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-800">{success}</div>}

      <Card title="Current Station Prices">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">PMS</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">N{Number(station?.currentPrices?.PMS || 0).toFixed(2)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AGO</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">N{Number(station?.currentPrices?.AGO || 0).toFixed(2)}</p>
          </div>
        </div>
      </Card>

      <Card title="Request New Price">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Select
            label="Fuel Type"
            name="fuelType"
            value={form.fuelType}
            onChange={(e) => setForm((current) => ({ ...current, fuelType: e.target.value }))}
            options={[{ value: 'PMS', label: 'PMS' }, { value: 'AGO', label: 'AGO' }]}
          />
          <Input
            label="New Price (N/L)"
            type="number"
            name="price"
            value={form.price}
            onChange={(e) => setForm((current) => ({ ...current, price: e.target.value }))}
            step="0.01"
            min="0.01"
            placeholder="Enter new regulated price"
          />
        </div>
        <div className="mt-4">
          <Textarea
            label="Reason"
            name="reason"
            value={form.reason}
            onChange={(e) => setForm((current) => ({ ...current, reason: e.target.value }))}
            rows={3}
            placeholder="Explain the official price change and why it must take effect during the day"
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" size="lg" onClick={submitRequest} disabled={saving}>
            {saving ? 'Submitting...' : 'Submit Price Change Request'}
          </Button>
        </div>
      </Card>

      <Card title="Recent Requests">
        <Table columns={columns} data={requests} emptyMessage="No price change requests yet" />
      </Card>
    </div>
  );
}

export default function ManagerPriceChangesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ManagerPriceChangesPageContent />
    </Suspense>
  );
}