"use client";

import { useEffect, useState, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Table, { TableBadge, TableAction } from '@/components/Table';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}

function SupervisorEntriesContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const stationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;

  const [loading, setLoading] = useState(true);
  const [readings, setReadings] = useState([]);
  const [error, setError] = useState('');

  // Inline review modal state
  const [reviewTarget, setReviewTarget] = useState(null); // { id, action: 'approve'|'query' }
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState('');

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

  function openReview(id, action) {
    setReviewTarget({ id, action });
    setReviewNote('');
    setReviewError('');
  }

  function closeReview() {
    setReviewTarget(null);
    setReviewNote('');
    setReviewError('');
  }

  async function submitReview() {
    if (!reviewNote.trim()) {
      setReviewError('Please enter a note before submitting.');
      return;
    }

    setReviewing(true);
    setReviewError('');

    const res = await fetch(`/api/meter-readings/${reviewTarget.id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: reviewTarget.action, note: reviewNote.trim() }),
    });
    const data = await res.json();

    setReviewing(false);

    if (!res.ok) {
      setReviewError(data.error || 'Failed to submit review');
      return;
    }

    closeReview();
    await fetchReadings();
  }

  if (loading) return <Loading />;

  const columns = [
    { header: 'Pump', field: 'pumpLabel' },
    { header: 'Supervisor', field: 'supervisorName' },
    { header: 'Opening', render: (r) => r.opening != null ? r.opening.toFixed(2) : '-' },
    {
      header: 'Closing',
      render: (r) => r.closing != null
        ? r.closing.toFixed(2)
        : <span className="text-amber-600 text-xs font-medium">Pending</span>,
    },
    { header: 'RTT', render: (r) => r.closing != null ? (r.rtt ?? 0).toFixed(2) : '-' },
    {
      header: 'Net (L)',
      render: (r) => r.closing != null
        ? (r.closing - r.opening - (r.rtt ?? 0)).toFixed(2)
        : '-',
    },
    {
      header: 'Flags',
      render: (r) => r.discrepancyFlag
        ? <TableBadge variant="warning">Discrepancy</TableBadge>
        : null,
    },
    {
      header: 'Review',
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
          <TableAction variant="success" onClick={() => openReview(r._id, 'approve')}>Approve</TableAction>
          <TableAction variant="primary" onClick={() => openReview(r._id, 'query')}>Query</TableAction>
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

      {/* Inline review modal */}
      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close review dialog"
            onClick={closeReview}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 capitalize">
              {reviewTarget.action === 'approve' ? 'Approve Entry' : 'Query Entry'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {reviewTarget.action === 'approve'
                ? 'Add an approval note (required).'
                : 'Describe what needs to be corrected.'}
            </p>

            <textarea
              className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-gray-900 placeholder-slate-400 focus:border-ecana-maroon focus:outline-none focus:ring-4 focus:ring-ecana-maroon/10 resize-none"
              rows={4}
              placeholder={reviewTarget.action === 'approve' ? 'e.g. Figures verified and correct.' : 'e.g. Closing reading appears too high — please recheck pump meter.'}
              value={reviewNote}
              onChange={(e) => { setReviewNote(e.target.value); setReviewError(''); }}
              autoFocus
            />

            {reviewError && (
              <p className="mt-2 text-sm text-red-600">{reviewError}</p>
            )}

            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={closeReview} disabled={reviewing}>
                Cancel
              </Button>
              <Button
                variant={reviewTarget.action === 'approve' ? 'success' : 'primary'}
                onClick={submitReview}
                isLoading={reviewing}
              >
                {reviewTarget.action === 'approve' ? 'Approve' : 'Send Query'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupervisorEntriesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SupervisorEntriesContent />
    </Suspense>
  );
}
