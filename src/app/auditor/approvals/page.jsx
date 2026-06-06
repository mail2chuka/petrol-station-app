'use client';

import { useEffect, useState, useCallback } from 'react';
import Card from '@/components/Card';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function fmtN(n) {
  return `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  return new Date(d).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

const STATUS_PILL = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  queried:  'bg-red-100 text-red-700',
  query:    'bg-red-100 text-red-700',
};

function Pill({ status }) {
  const label = status === 'query' ? 'queried' : status;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_PILL[status] || 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  );
}

// ── Inline action row for deposits ────────────────────────────────────────────
function DepositActionRow({ deposit, onDone }) {
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  async function submit(status) {
    if (!note.trim() || note.trim().length < 3) { setError('Note must be at least 3 characters'); return; }
    setActing(true);
    setError('');
    try {
      const res = await fetch(`/api/cash-deposits/${deposit._id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminNote: note }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed'); return; }
      onDone(deposit._id, status);
    } catch {
      setError('Network error.');
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <input
        type="text"
        placeholder="Note (required)"
        value={note}
        onChange={e => setNote(e.target.value)}
        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-ecana-maroon"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => submit('approved')} disabled={acting}
          className="flex-1 text-sm py-1.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50">
          {acting ? '…' : 'Approve'}
        </button>
        <button onClick={() => submit('rejected')} disabled={acting}
          className="flex-1 text-sm py-1.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50">
          {acting ? '…' : 'Reject'}
        </button>
      </div>
    </div>
  );
}

// ── Inline action row for payment collections ─────────────────────────────────
function PaymentActionRow({ payment, onDone }) {
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  async function submit(action) {
    if (!note.trim() || note.trim().length < 2) { setError('Note must be at least 2 characters'); return; }
    setActing(true);
    setError('');
    try {
      const res = await fetch(`/api/payments/${payment._id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed'); return; }
      onDone(payment._id, action === 'approve' ? 'approved' : 'queried');
    } catch {
      setError('Network error.');
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <input
        type="text"
        placeholder="Note (required)"
        value={note}
        onChange={e => setNote(e.target.value)}
        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-ecana-maroon"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => submit('approve')} disabled={acting}
          className="flex-1 text-sm py-1.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50">
          {acting ? '…' : 'Approve'}
        </button>
        <button onClick={() => submit('query')} disabled={acting}
          className="flex-1 text-sm py-1.5 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50">
          {acting ? '…' : 'Query'}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AuditorApprovalsPage() {
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState('');
  const [date, setDate] = useState(todayStr());
  const [tab, setTab] = useState('deposits');

  const [deposits, setDeposits] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetch('/api/stations')
      .then(r => r.json())
      .then(d => {
        const list = d.stations || [];
        setStations(list);
        if (list.length > 0) setSelectedStation(list[0]._id);
      })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    if (!selectedStation) return;
    setLoading(true);
    setError('');
    try {
      const [depRes, payRes] = await Promise.all([
        fetch(`/api/cash-deposits?stationId=${selectedStation}&date=${date}&limit=200`),
        fetch(`/api/payments?stationId=${selectedStation}&date=${date}&limit=200`),
      ]);
      const depData = await depRes.json();
      const payData = await payRes.json();
      if (depRes.ok) setDeposits(depData.cashDeposits || []);
      else setError(depData.error || 'Failed to load deposits');
      if (payRes.ok) setPayments(payData.paymentRecords || []);
      else setError(e => e || payData.error || 'Failed to load payments');
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, [selectedStation, date]);

  useEffect(() => {
    if (selectedStation) fetchData();
  }, [selectedStation, date]);

  function handleDepositDone(id, newStatus) {
    setDeposits(prev => prev.map(d => d._id === id ? { ...d, status: newStatus } : d));
    setExpandedId(null);
  }

  function handlePaymentDone(id, newStatus) {
    setPayments(prev => prev.map(p => p._id === id ? { ...p, managerReviewStatus: newStatus } : p));
    setExpandedId(null);
  }

  const pendingDeposits = deposits.filter(d => d.status === 'pending');
  const reviewedDeposits = deposits.filter(d => d.status !== 'pending');
  const pendingPayments = payments.filter(p => !p.managerReviewStatus || p.managerReviewStatus === 'pending');
  const reviewedPayments = payments.filter(p => p.managerReviewStatus && p.managerReviewStatus !== 'pending');

  const stationOptions = stations.map(s => ({ value: s._id, label: `${s.name} (${s.code})` }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Approvals</h1>
        <p className="text-sm text-gray-500 mt-1">Review and approve bank deposits and payment collections.</p>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Station</label>
            <select
              value={selectedStation}
              onChange={e => setSelectedStation(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-ecana-maroon"
            >
              {stationOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={date}
              max={todayStr()}
              onChange={e => setDate(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-ecana-maroon"
            />
          </div>
          <button onClick={fetchData} disabled={loading}
            className="px-4 py-1.5 text-sm bg-ecana-maroon text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium">
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </Card>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: 'deposits', label: `Bank Deposits${pendingDeposits.length > 0 ? ` (${pendingDeposits.length} pending)` : ''}` },
          { key: 'payments', label: `Collections${pendingPayments.length > 0 ? ` (${pendingPayments.length} pending)` : ''}` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── BANK DEPOSITS TAB ── */}
      {tab === 'deposits' && (
        <div className="space-y-4">
          {/* Pending */}
          <Card title={`Pending (${pendingDeposits.length})`}>
            {pendingDeposits.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No pending deposits for this date.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {pendingDeposits.map(dep => (
                  <div key={dep._id} className="py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-gray-900">{fmtN(dep.amount)}</p>
                        <p className="text-xs text-gray-500">{dep.bankName}{dep.bankBranch ? ` — ${dep.bankBranch}` : ''}</p>
                        <p className="text-xs text-gray-500">By: {dep.initiatedByCashierName}</p>
                        <p className="text-xs text-gray-400">{fmtDate(dep.createdAt)}</p>
                        {dep.accountNumber && <p className="text-xs text-gray-400">A/C: {dep.accountNumber}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Pill status="pending" />
                        <button
                          onClick={() => setExpandedId(expandedId === dep._id ? null : dep._id)}
                          className="text-xs font-medium text-ecana-maroon hover:underline">
                          {expandedId === dep._id ? 'Cancel' : 'Review'}
                        </button>
                      </div>
                    </div>
                    {expandedId === dep._id && (
                      <DepositActionRow deposit={dep} onDone={handleDepositDone} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Reviewed */}
          {reviewedDeposits.length > 0 && (
            <Card title={`Reviewed (${reviewedDeposits.length})`}>
              <div className="divide-y divide-gray-100">
                {reviewedDeposits.map(dep => (
                  <div key={dep._id} className="py-3 flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-gray-900">{fmtN(dep.amount)}</p>
                      <p className="text-xs text-gray-500">{dep.bankName}</p>
                      <p className="text-xs text-gray-500">By: {dep.initiatedByCashierName}</p>
                      {dep.adminNote && <p className="text-xs text-gray-400 italic">"{dep.adminNote}"</p>}
                      {dep.approvedByAdminName && <p className="text-xs text-gray-400">Reviewed by: {dep.approvedByAdminName}</p>}
                    </div>
                    <Pill status={dep.status} />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── PAYMENT COLLECTIONS TAB ── */}
      {tab === 'payments' && (
        <div className="space-y-4">
          {/* Pending */}
          <Card title={`Pending (${pendingPayments.length})`}>
            {pendingPayments.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No pending collections for this date.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {pendingPayments.map(pay => (
                  <div key={pay._id} className="py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-gray-900">{fmtN(pay.totalReceived)}</p>
                        <p className="text-xs text-gray-500">
                          Cash: {fmtN(pay.cashReceived)} &nbsp;·&nbsp; POS: {fmtN(pay.posReceived)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {pay.dispenserName || '—'} &nbsp;·&nbsp; {pay.fuelType || '—'}
                        </p>
                        <p className="text-xs text-gray-500">Supervisor: {pay.supervisorName || '—'}</p>
                        <p className="text-xs text-gray-400">{pay.createdAt ? fmtDate(pay.createdAt) : '—'}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Pill status="pending" />
                        <button
                          onClick={() => setExpandedId(expandedId === pay._id ? null : pay._id)}
                          className="text-xs font-medium text-ecana-maroon hover:underline">
                          {expandedId === pay._id ? 'Cancel' : 'Review'}
                        </button>
                      </div>
                    </div>
                    {expandedId === pay._id && (
                      <PaymentActionRow payment={pay} onDone={handlePaymentDone} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Reviewed */}
          {reviewedPayments.length > 0 && (
            <Card title={`Reviewed (${reviewedPayments.length})`}>
              <div className="divide-y divide-gray-100">
                {reviewedPayments.map(pay => (
                  <div key={pay._id} className="py-3 flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-gray-900">{fmtN(pay.totalReceived)}</p>
                      <p className="text-xs text-gray-500">
                        {pay.dispenserName || '—'} &nbsp;·&nbsp; {pay.supervisorName || '—'}
                      </p>
                      {pay.managerReviewNote && <p className="text-xs text-gray-400 italic">"{pay.managerReviewNote}"</p>}
                      {pay.reviewedByManagerName && <p className="text-xs text-gray-400">Reviewed by: {pay.reviewedByManagerName}</p>}
                    </div>
                    <Pill status={pay.managerReviewStatus} />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
