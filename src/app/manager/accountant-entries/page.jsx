'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Loading from '@/components/Loading';
import DateCalendar from '@/components/DateCalendar';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
}

const STATUS_STYLES = {
  pending:  { pill: 'bg-amber-100 text-amber-700',  label: 'Pending' },
  approved: { pill: 'bg-green-100 text-green-700',  label: 'Approved' },
  queried:  { pill: 'bg-red-100 text-red-700',      label: 'Queried' },
};

const DEPOSIT_STATUS_STYLES = {
  pending:  { pill: 'bg-amber-100 text-amber-700',  label: 'Pending' },
  approved: { pill: 'bg-green-100 text-green-700',  label: 'Approved' },
  rejected: { pill: 'bg-red-100 text-red-700',      label: 'Rejected' },
};

function AccountantEntriesContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const stationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Calendar month marks: { [YYYY-MM-DD]: { pending, total } }
  const [paymentMarks, setPaymentMarks] = useState({});
  const [depositMarks, setDepositMarks] = useState({});
  const [loadingMonth, setLoadingMonth] = useState(false);

  // Merge payment + deposit marks for the calendar
  const markedDates = useMemo(() => {
    const merged = { ...paymentMarks };
    for (const [d, mark] of Object.entries(depositMarks)) {
      if (merged[d]) {
        merged[d] = { pending: merged[d].pending + mark.pending, total: merged[d].total + mark.total };
      } else {
        merged[d] = mark;
      }
    }
    return merged;
  }, [paymentMarks, depositMarks]);

  // Cash deposits
  const [deposits, setDeposits] = useState([]);
  const [depositsLoading, setDepositsLoading] = useState(false);
  const [depositsError, setDepositsError] = useState('');

  // Deposit review modal
  const [depositTarget, setDepositTarget] = useState(null);
  const [depositNote, setDepositNote] = useState('');
  const [depositReviewing, setDepositReviewing] = useState(false);
  const [depositReviewError, setDepositReviewError] = useState('');

  // Payment review modal
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // Fetch month-level data for calendar marks
  const fetchMonthMarks = useCallback(async (monthStr) => {
    if (!stationId) return;
    setLoadingMonth(true);
    try {
      const res = await fetch(`/api/payments?stationId=${stationId}&month=${monthStr}`);
      const data = await res.json();
      if (!res.ok) return;
      const grouped = {};
      for (const rec of data.paymentRecords || []) {
        const d = new Date(rec.date).toISOString().split('T')[0];
        if (!grouped[d]) grouped[d] = { pending: 0, total: 0 };
        grouped[d].total += 1;
        if ((rec.managerReviewStatus || 'pending') === 'pending') {
          grouped[d].pending += 1;
        }
      }
      setPaymentMarks(prev => ({ ...prev, ...grouped }));
    } catch {
      // silent — calendar marks are decorative
    } finally {
      setLoadingMonth(false);
    }
  }, [stationId]);

  // Fetch cash deposits for this station
  const fetchDeposits = useCallback(async () => {
    if (!stationId) return;
    setDepositsLoading(true);
    setDepositsError('');
    try {
      const res = await fetch(`/api/cash-deposits?stationId=${stationId}&limit=100`);
      const data = await res.json();
      if (!res.ok) {
        setDepositsError(data.error || 'Failed to load cash deposits');
      } else {
        setDeposits(data.cashDeposits || []);
      }
    } catch {
      setDepositsError('Failed to load cash deposits');
    } finally {
      setDepositsLoading(false);
    }
  }, [stationId]);

  // Fetch day records
  const fetchRecords = useCallback(async (date) => {
    if (!stationId || !date) return;
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
  }, [stationId]);

  // Recompute deposit calendar marks whenever deposits list changes
  useEffect(() => {
    const marks = {};
    for (const dep of deposits) {
      const d = new Date(dep.date).toISOString().split('T')[0];
      if (!marks[d]) marks[d] = { pending: 0, total: 0 };
      marks[d].total += 1;
      if (dep.status === 'pending') marks[d].pending += 1;
    }
    setDepositMarks(marks);
  }, [deposits]);

  // On mount: load current month marks + today's records + deposits
  useEffect(() => {
    if (!stationId) return;
    fetchMonthMarks(currentMonthStr());
    fetchRecords(todayStr());
    fetchDeposits();
  }, [stationId, fetchMonthMarks, fetchRecords, fetchDeposits]);

  // When user picks a date on the calendar
  const handleDateChange = (date) => {
    setSelectedDate(date);
    fetchRecords(date);
  };

  // When user navigates to a different month on the calendar
  const handleMonthChange = (monthStr) => {
    fetchMonthMarks(monthStr);
  };

  // Deposit review actions
  function openDepositReview(deposit, action) {
    setDepositTarget({ id: deposit._id, action, amount: deposit.amount, bankName: deposit.bankName });
    setDepositNote('');
    setDepositReviewError('');
  }

  function closeDepositReview() {
    setDepositTarget(null);
    setDepositNote('');
    setDepositReviewError('');
  }

  async function submitDepositReview() {
    if (!depositNote.trim()) {
      setDepositReviewError('Please enter a note before submitting.');
      return;
    }
    setDepositReviewing(true);
    setDepositReviewError('');
    try {
      const res = await fetch(`/api/cash-deposits/${depositTarget.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: depositTarget.action === 'approve' ? 'approved' : 'rejected',
          adminNote: depositNote.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDepositReviewError(data.error || 'Failed to submit review');
        return;
      }
      closeDepositReview();
      fetchDeposits();
    } catch {
      setDepositReviewError('Network error. Please try again.');
    } finally {
      setDepositReviewing(false);
    }
  }

  // Payment review actions
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
      // Refresh both the day records and the month marks
      await fetchRecords(selectedDate);
      const m = selectedDate.slice(0, 7);
      await fetchMonthMarks(m);
    } catch {
      setReviewError('Network error. Please try again.');
    } finally {
      setReviewing(false);
    }
  }

  const pending  = records.filter(r => (r.managerReviewStatus || 'pending') === 'pending').length;
  const approved = records.filter(r => r.managerReviewStatus === 'approved').length;
  const queried  = records.filter(r => r.managerReviewStatus === 'queried').length;

  const selectedLabel = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '';

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
          Review payment records — approve confirmed collections or query discrepancies.
          Amber dots mark days with pending entries.
        </p>
      </div>

      {/* Cash Deposits section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">
            Cash Deposits
            {deposits.filter(d => d.status === 'pending').length > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                {deposits.filter(d => d.status === 'pending').length} pending
              </span>
            )}
          </h2>
          <button
            onClick={fetchDeposits}
            disabled={depositsLoading}
            className="text-sm text-ecana-maroon hover:underline font-medium disabled:opacity-50"
          >
            {depositsLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {depositsError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{depositsError}</div>
        )}

        {depositsLoading && (
          <div className="flex justify-center py-6"><div className="spinner" /></div>
        )}

        {!depositsLoading && deposits.length === 0 && !depositsError && (
          <p className="text-sm text-gray-400 py-3">No cash deposits recorded for this station.</p>
        )}

        {!depositsLoading && deposits.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {deposits.map(dep => {
              const dStyle = DEPOSIT_STATUS_STYLES[dep.status] || DEPOSIT_STATUS_STYLES.pending;
              const depDate = new Date(dep.date).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
              return (
                <div key={dep._id} className="card-modern p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-bold text-gray-800">₦{fmt(dep.amount)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{depDate}</p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${dStyle.pill}`}>
                      {dStyle.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mb-0.5">{dep.bankName}{dep.bankBranch ? ` — ${dep.bankBranch}` : ''}</p>
                  <p className="text-xs text-gray-500 mb-2">By {dep.initiatedByAccountantName}</p>
                  {dep.adminNote && (
                    <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2 mb-2">{dep.adminNote}</p>
                  )}
                  {dep.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => openDepositReview(dep, 'approve')}
                        className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 font-medium transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => openDepositReview(dep, 'reject')}
                        className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 font-medium transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
        {/* Left: calendar */}
        <div className="space-y-3">
          <DateCalendar
            value={selectedDate}
            onChange={handleDateChange}
            onMonthChange={handleMonthChange}
            markedDates={markedDates}
            maxDate={todayStr()}
          />
          {loadingMonth && (
            <p className="text-xs text-center text-gray-400">Loading month data…</p>
          )}
        </div>

        {/* Right: records for selected date */}
        <div className="space-y-4">
          {/* Selected date header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">{selectedLabel}</h2>
              {records.length > 0 && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {records.length} record{records.length !== 1 ? 's' : ''} found
                </p>
              )}
            </div>
            <button
              onClick={() => fetchRecords(selectedDate)}
              disabled={loading}
              className="text-sm text-ecana-maroon hover:underline font-medium disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-12"><div className="spinner" /></div>
          )}

          {!loading && records.length > 0 && (
            <>
              {/* Summary tiles */}
              <div className="grid grid-cols-3 gap-3">
                <div className="card-modern p-3 text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Pending</p>
                  <p className={`text-2xl font-bold ${pending > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{pending}</p>
                </div>
                <div className="card-modern p-3 text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Approved</p>
                  <p className="text-2xl font-bold text-green-700">{approved}</p>
                </div>
                <div className="card-modern p-3 text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Queried</p>
                  <p className={`text-2xl font-bold ${queried > 0 ? 'text-red-600' : 'text-gray-400'}`}>{queried}</p>
                </div>
              </div>

              {/* Records */}
              <div className="space-y-3">
                {records.map(record => {
                  const status = record.managerReviewStatus || 'pending';
                  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
                  return (
                    <div key={record._id} className="card-modern p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="font-semibold text-gray-800">{record.supervisorName}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Recorded by {record.recordedByName}
                            {record.notes && <> · <em>{record.notes}</em></>}
                          </p>
                        </div>
                        <span className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.pill}`}>
                          {style.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Cash</p>
                          <p className="font-semibold text-gray-800">₦{fmt(record.cashReceived)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">POS</p>
                          <p className="font-semibold text-gray-800">₦{fmt(record.posReceived)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Total</p>
                          <p className="font-bold text-gray-800">₦{fmt(record.totalReceived)}</p>
                        </div>
                      </div>

                      {record.managerReviewNote && (
                        <p className="text-xs text-gray-500 italic mb-3 border-l-2 border-gray-200 pl-2">
                          {record.managerReviewNote} — {record.reviewedByManagerName}
                        </p>
                      )}

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
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {!loading && records.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <svg className="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-base font-medium">No payment records for this date</p>
              <p className="text-sm mt-1">Select a marked day on the calendar to view records</p>
            </div>
          )}
        </div>
      </div>

      {/* Deposit review modal */}
      {depositTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={closeDepositReview}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">
              {depositTarget.action === 'approve' ? 'Approve Deposit' : 'Reject Deposit'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              ₦{fmt(depositTarget.amount)} — {depositTarget.bankName}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {depositTarget.action === 'approve'
                ? 'Confirm this bank deposit is verified.'
                : 'Explain why this deposit is being rejected.'}
            </p>
            <textarea
              className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-gray-900 placeholder-slate-400 focus:border-ecana-maroon focus:outline-none focus:ring-4 focus:ring-ecana-maroon/10 resize-none"
              rows={4}
              placeholder={
                depositTarget.action === 'approve'
                  ? 'e.g. Deposit confirmed with bank statement.'
                  : 'e.g. Amount does not match teller receipt — please resubmit.'
              }
              value={depositNote}
              onChange={e => { setDepositNote(e.target.value); setDepositReviewError(''); }}
              autoFocus
            />
            {depositReviewError && <p className="mt-2 text-sm text-red-600">{depositReviewError}</p>}
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={closeDepositReview} disabled={depositReviewing}>Cancel</Button>
              <Button
                variant={depositTarget.action === 'approve' ? 'success' : 'danger'}
                onClick={submitDepositReview}
                isLoading={depositReviewing}
              >
                {depositTarget.action === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Payment review modal */}
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
