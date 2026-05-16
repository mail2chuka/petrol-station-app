"use client";

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Table, { TableBadge, TableAction } from '@/components/Table';
import Loading from '@/components/Loading';

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

export default function SupervisorEntriesPage() {
  const { data: session } = useSession();
  const stationId = session?.user?.stationId;
  const [loading, setLoading] = useState(true);
  const [readings, setReadings] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (stationId) fetchReadings();
  }, [stationId]);

  async function fetchReadings() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/meter-readings?stationId=${stationId}&date=${todayIso()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load supervisor entries');
      } else {
        setReadings(data.readings || []);
      }
    } catch {
      setError('Failed to load supervisor entries');
    } finally {
      setLoading(false);
    }
  }

  async function review(id, action) {
    const note = window.prompt(action === 'approve' ? 'Approval note' : 'Query note');
    if (!note) return;

    const res = await fetch(`/api/meter-readings/${id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to review entry');
      return;
    }
    await fetchReadings();
  }

  if (loading) return <Loading />;

  const columns = [
    { header: 'Pump', field: 'pumpLabel' },
    { header: 'Supervisor', field: 'supervisorName' },
    { header: 'Opening', render: (r) => r.opening?.toFixed(2) },
    { header: 'Closing', render: (r) => r.closing?.toFixed(2) },
    { header: 'RTT', render: (r) => r.rtt?.toFixed(2) },
    {
      header: 'Status',
      render: (r) => {
        const status = r.managerReviewStatus || 'pending';
        const variant = status === 'approved' ? 'success' : status === 'query' ? 'warning' : 'info';
        return <TableBadge variant={variant}>{status}</TableBadge>;
      },
    },
    {
      header: 'Action',
      render: (r) => (
        <div className="flex gap-2">
          <TableAction variant="success" onClick={() => review(r._id, 'approve')}>Approve</TableAction>
          <TableAction variant="primary" onClick={() => review(r._id, 'query')}>Query</TableAction>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Supervisor Entries</h1>
        <p className="text-sm text-gray-600 mt-1">Review meter readings and RTT submissions, then approve or query.</p>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded">{error}</div>}

      <Card title="Today Submissions">
        <Table columns={columns} data={readings} emptyMessage="No supervisor entries for today" />
      </Card>
    </div>
  );
}
