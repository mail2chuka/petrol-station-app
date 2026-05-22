'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
}

const STATUS_STYLES = {
  pending:  { pill: 'bg-gray-100 text-gray-600',   label: 'Pending' },
  approved: { pill: 'bg-green-100 text-green-700',  label: 'Approved' },
  queried:  { pill: 'bg-amber-100 text-amber-700',  label: 'Queried' },
};

function AccountantEntriesContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const stationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;

  const [date, setDate] = useState(todayStr());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState('');

  useEffect(() => {
    if (stationId) fetchRecords();
  }, [stationId, date]);

  async function fetchRecords() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/payments?stationId=${stationId}&date=${date}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load payment records');
      } else {
        setRecords(data.paymentRecords || []);
      }
    } catch {
      setError('Failed to load payment records');
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
    try {
      const res = await fetch(`/api/payments/${reviewTarget.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: reviewTarget.action, note: reviewNote.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReviewError(data.error || 'Failed to submit review');
        return;
      }
      closeReview();
      await fetchRecords();
    } catch {
      setReviewError('Network error. Please try again.');
    } finally {
      setReviewing(false);
    }
  }

  const pending  = records.filter(r => (r.managerReviewStatus || 'pending') === 'pending').length;
  const approved = records.filter(r => r.managerReviewStatus === 'approved').length;
  const queried  = records.filter(r => r.managerReviewStatus === 'queried').length;

  if (!stationId) {
    return (
      <Card title="Select Station">
        <p className="text-sm text-gray-600">Choose a station from the Admin Stations page to manage.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Accountant Entries</h1>
        <p className="text-sm text-gray-600 mt-1">
          Review payment records submitted by the accountant — approve confirmed collections or query discrepancies.
        </p>
      </div>

      {/* Date picker */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              className="input-modern"
              value={date}
              max={todayStr()}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <button
            onClick={fetchRecords}
            disabled={loading}
            className="btn-modern btn-primary px-5 py-3 disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}
      </Card>

      {loading && (
        <div className="flex justify-center py-12"><div className="spinner" /></div>
      )}

      {!loading && records.length > 0 && (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card-modern p-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Pending</p>
              <p className={`text-2xl font-bold ${pending > 0 ? 'text-amber-600' : 'text-gray-800'}`}>{pending}</p>
            </div>
            <div className="card-modern p-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Approved</p>
              <p className="text-2xl font-bold text-green-700">{approved}</p>
            </div>
            <div className="card-modern p-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Queried</p>
              <p className={`text-2xl font-bold ${queried > 0 ? 'text-amber-700' : 'text-gray-800'}`}>{queried}</p>
            </div>
          </div>

          {/* Records table */}
          <Card title="Payment Records">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-200">
                    <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Supervisor</th>
                    <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Recorded By</th>
                    <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide text-right">Cash</th>
                    <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide text-right">POS</th>
                    <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide text-right">Total</th>
                    <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Status</th>
                    <th className="pb-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.map(record => {
                    const status = record.managerReviewStatus || 'pending';
                    const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
                    return (
                      <tr key={record._id}>
                        <td className="py-3 pr-4">
                          <p className="font-medium text-gray-800">{record.supervisorName}</p>
                          {record.notes && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[140px]">{record.notes}</p>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-gray-600 text-xs">{record.recordedByName}</td>
                        <td className="py-3 pr-4 text-right text-gray-700">₦{fmt(record.cashReceived)}</td>
                        <td className="py-3 pr-4 text-right text-gray-700">₦{fmt(record.posReceived)}</td>
                        <td className="py-3 pr-4 text-right font-semibold text-gray-800">₦{fmt(record.totalReceived)}</td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.pill}`}>
                            {style.label}
                          </span>
                          {record.managerReviewNote && (
                            <p className="text-xs text-gray-400 mt-0.5 max-w-[160px] truncate">{record.managerReviewNote}</p>
                          )}
                        </td>
                        <td className="py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => openReview(record._id, 'approve')}
                              className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 font-medium transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => openReview(record._id, 'query')}
                              className="text-xs px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium transition-colors"
                            >
                              Query
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {!loading && records.length === 0 && !error && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">No payment records for this date.</p>
        </div>
      )}

      {/* Review modal */}
      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={closeReview}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">
              {reviewTarget.action === 'approve' ? 'Approve Entry' : 'Query Entry'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {reviewTarget.action === 'approve'
                ? 'Confirm this payment collection is accurate.'
                : 'Describe what needs clarification or correction.'}
            </p>
            <textarea
              className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-gray-900 placeholder-slate-400 focus:border-ecana-maroon focus:outline-none focus:ring-4 focus:ring-ecana-maroon/10 resize-none"
              rows={4}
              placeholder={
                reviewTarget.action === 'approve'
                  ? 'e.g. Collection verified and confirmed.'
                  : 'e.g. Cash amount does not match supervisor sheet — please recheck.'
              }
              value={reviewNote}
              onChange={e => { setReviewNote(e.target.value); setReviewError(''); }}
              autoFocus
            />
            {reviewError && <p className="mt-2 text-sm text-red-600">{reviewError}</p>}
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={closeReview} disabled={reviewing}>Cancel</Button>
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

export default function AccountantEntriesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AccountantEntriesContent />
    </Suspense>
  );
}
