'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

const NIGERIAN_BANKS = [
  'Access Bank', 'Citibank', 'Ecobank', 'Fidelity Bank', 'First Bank',
  'First City Monument Bank (FCMB)', 'GTBank', 'Heritage Bank', 'Keystone Bank',
  'Kuda Bank', 'Moniepoint', 'OPay', 'Palmpay', 'Polaris Bank', 'Providus Bank',
  'Stanbic IBTC', 'Standard Chartered', 'Sterling Bank', 'SunTrust Bank',
  'Titan Trust Bank', 'UBA', 'Union Bank', 'Unity Bank', 'Wema Bank', 'Zenith Bank', 'Other',
];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}
function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtN(n) {
  return `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }) {
  const map = {
    pending:  'bg-amber-100 text-amber-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

// ── Mini Calendar ─────────────────────────────────────────────────────────────
function MiniCalendar({ month, onMonthChange, dateStatus, selectedDate, onSelectDate }) {
  const [y, m] = month.split('-').map(Number);
  const today = todayStr();

  // Build grid
  const firstDay = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function prevMonth() {
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    onMonthChange(prev);
  }
  function nextMonth() {
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    if (next <= currentMonthStr()) onMonthChange(next);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">‹</button>
        <span className="text-sm font-semibold text-gray-800">{MONTHS[m - 1]} {y}</span>
        <button onClick={nextMonth} disabled={month >= currentMonthStr()}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-30">›</button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 px-2 pt-2">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 pb-1">{d}</div>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7 px-2 pb-3 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateKey = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = dateKey === today;
          const isFuture = dateKey > today;
          const isSelected = dateKey === selectedDate;
          const info = dateStatus[dateKey];

          // Dot color
          let dotColor = null;
          if (info?.status === 'complete') dotColor = 'bg-green-500';
          else if (info?.status === 'partial') dotColor = 'bg-amber-500';
          else if (info?.status === 'none') dotColor = 'bg-red-500';

          return (
            <button
              key={dateKey}
              disabled={isFuture}
              onClick={() => !isFuture && onSelectDate(dateKey)}
              className={[
                'relative flex flex-col items-center justify-center h-9 rounded-lg text-sm transition-all',
                isFuture ? 'text-gray-200 cursor-default' : 'cursor-pointer hover:bg-gray-100',
                isSelected ? 'bg-ecana-maroon text-white font-bold shadow-sm' : '',
                isToday && !isSelected ? 'ring-2 ring-ecana-maroon font-bold text-gray-800' : '',
                !isSelected && !isFuture ? 'text-gray-800' : '',
              ].filter(Boolean).join(' ')}
            >
              <span>{day}</span>
              {dotColor && !isSelected && (
                <span className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${dotColor}`} />
              )}
              {dotColor && isSelected && (
                <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-white/70" />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-3 justify-center text-xs text-gray-500 pb-3">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />No deposit</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Partial</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Complete</span>
      </div>
    </div>
  );
}

// ── Deposit Form ──────────────────────────────────────────────────────────────
function DepositForm({ stationId, forDate, onSubmitted }) {
  const today = todayStr();
  const [form, setForm] = useState({ amount: '', bankName: '', bankBranch: '', accountNumber: '', note: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.bankName.trim()) { setError('Bank name is required.'); return; }
    if (!form.accountNumber.trim()) { setError('Account number is required.'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Enter a valid amount greater than zero.'); return; }

    setSubmitting(true); setError('');
    try {
      const res = await fetch('/api/cash-deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          date: today,
          forDate,
          amount: parseFloat(form.amount),
          bankName: form.bankName.trim(),
          bankBranch: form.bankBranch.trim(),
          accountNumber: form.accountNumber.trim(),
          note: form.note.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to record deposit.'); return; }
      setForm({ amount: '', bankName: '', bankBranch: '', accountNumber: '', note: '' });
      onSubmitted();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-3 border-t border-gray-100 mt-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Deposit for {forDate}</p>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Amount (₦) <span className="text-red-500">*</span></label>
        <input type="text" inputMode="decimal" name="amount" value={form.amount}
          onChange={handleChange} placeholder="0"
          className="w-full px-4 py-3 text-sm border-2 border-slate-200 rounded-xl focus:outline-none focus:border-ecana-maroon" />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Bank Name <span className="text-red-500">*</span></label>
        <select name="bankName" value={form.bankName} onChange={handleChange}
          className="w-full px-4 py-3 text-sm border-2 border-slate-200 rounded-xl focus:outline-none focus:border-ecana-maroon bg-white">
          <option value="">Select bank...</option>
          {NIGERIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Branch <span className="text-gray-400 font-normal">(optional)</span></label>
          <input type="text" name="bankBranch" value={form.bankBranch} onChange={handleChange} placeholder="e.g. Ikeja"
            className="w-full px-4 py-3 text-sm border-2 border-slate-200 rounded-xl focus:outline-none focus:border-ecana-maroon" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Account No. <span className="text-red-500">*</span></label>
          <input type="text" name="accountNumber" value={form.accountNumber} onChange={handleChange} placeholder="10-digit"
            className="w-full px-4 py-3 text-sm border-2 border-slate-200 rounded-xl focus:outline-none focus:border-ecana-maroon" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Note <span className="text-gray-400 font-normal">(teller slip, reference, etc.)</span></label>
        <textarea name="note" value={form.note} onChange={handleChange} rows={2}
          className="w-full px-4 py-3 text-sm border-2 border-slate-200 rounded-xl focus:outline-none focus:border-ecana-maroon resize-none" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={submitting}
        className="w-full py-3 rounded-xl bg-ecana-maroon text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
        {submitting ? 'Submitting…' : 'Submit Deposit for Approval'}
      </button>
    </form>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CashDepositsPage() {
  const { data: session } = useSession();
  const stationId = session?.user?.stationId;

  const [month, setMonth] = useState(currentMonthStr());
  const [dateStatus, setDateStatus] = useState({});
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [deposits, setDeposits] = useState([]);
  const [loadingDeposits, setLoadingDeposits] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [success, setSuccess] = useState('');

  const fetchSummary = useCallback(async () => {
    if (!stationId) return;
    try {
      const res = await fetch(`/api/cash-deposits/summary?stationId=${stationId}&month=${month}`);
      const data = await res.json();
      if (res.ok) setDateStatus(data.dates || {});
    } catch {}
  }, [stationId, month]);

  const fetchDeposits = useCallback(async (date) => {
    if (!stationId) return;
    setLoadingDeposits(true);
    try {
      const res = await fetch(`/api/cash-deposits?stationId=${stationId}&forDate=${date}&limit=50`);
      const data = await res.json();
      if (res.ok) setDeposits(data.cashDeposits || []);
    } catch {}
    finally { setLoadingDeposits(false); }
  }, [stationId]);

  useEffect(() => {
    if (stationId) { fetchSummary(); fetchDeposits(selectedDate); }
  }, [session]);

  useEffect(() => { if (stationId) fetchSummary(); }, [month, stationId]);

  function handleSelectDate(date) {
    setSelectedDate(date);
    setShowForm(false);
    setSuccess('');
    fetchDeposits(date);
  }

  async function handleDeposited() {
    setSuccess('Deposit submitted successfully.');
    setShowForm(false);
    await Promise.all([fetchSummary(), fetchDeposits(selectedDate)]);
  }

  const info = dateStatus[selectedDate];
  const totalDeposited = deposits.filter(d => d.status !== 'rejected').reduce((s, d) => s + (d.amount || 0), 0);
  const dateLabel = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bank Deposits</h1>
        <p className="text-sm text-slate-500 mt-1">Select an operating day to record or view bank deposits for that day's cash.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Calendar */}
        <div className="w-full lg:w-72 shrink-0">
          <MiniCalendar
            month={month}
            onMonthChange={setMonth}
            dateStatus={dateStatus}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
          />
        </div>

        {/* Selected date panel */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            {/* Date header */}
            <div className="px-4 py-4 border-b border-gray-100">
              <p className="font-bold text-gray-900">{dateLabel}</p>
              <div className="flex items-center gap-4 mt-2 text-sm">
                {info ? (
                  <>
                    <span className="text-gray-500">Cash collected: <span className="font-semibold text-gray-900">{fmtN(info.collected)}</span></span>
                    <span className="text-gray-500">Deposited: <span className={`font-semibold ${info.status === 'complete' ? 'text-green-700' : info.status === 'partial' ? 'text-amber-700' : 'text-red-600'}`}>{fmtN(info.deposited)}</span></span>
                    {info.status === 'complete' && <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Complete</span>}
                    {info.status === 'partial' && <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Partial</span>}
                    {info.status === 'none' && <span className="text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">No deposit</span>}
                  </>
                ) : (
                  <span className="text-gray-400 text-sm">No cash collection recorded for this day.</span>
                )}
              </div>
            </div>

            <div className="px-4 py-4 space-y-3">
              {/* Existing deposits list */}
              {loadingDeposits && <p className="text-sm text-gray-400 text-center py-4">Loading…</p>}

              {!loadingDeposits && deposits.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No deposits recorded for this day yet.</p>
              )}

              {!loadingDeposits && deposits.length > 0 && (
                <div className="divide-y divide-gray-100">
                  {deposits.map((dep, i) => (
                    <div key={dep._id} className="py-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900">#{i + 1} — {fmtN(dep.amount)}</p>
                          <StatusBadge status={dep.status} />
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">{dep.bankName}{dep.bankBranch ? ` — ${dep.bankBranch}` : ''}</p>
                        <p className="text-xs text-gray-400">Acct: {dep.accountNumber}</p>
                        {dep.adminNote && dep.status !== 'pending' && (
                          <p className="text-xs text-gray-500 mt-1 italic">Note: {dep.adminNote}</p>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 shrink-0">{dep.createdAt ? fmtTime(dep.createdAt) : ''}</p>
                    </div>
                  ))}
                  <div className="pt-2 flex justify-between text-sm font-semibold text-gray-700">
                    <span>Total deposited (excl. rejected)</span>
                    <span>{fmtN(totalDeposited)}</span>
                  </div>
                </div>
              )}

              {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-xl">{success}</p>}

              {/* Add deposit button / form */}
              {!showForm && selectedDate <= todayStr() && (
                <button onClick={() => { setShowForm(true); setSuccess(''); }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-ecana-maroon/40 text-ecana-maroon font-medium text-sm hover:bg-ecana-maroon/5 transition-colors">
                  <span className="text-lg leading-none">+</span>
                  {deposits.length === 0 ? 'Record First Deposit for this Day' : 'Add Another Deposit'}
                </button>
              )}

              {showForm && (
                <>
                  <DepositForm stationId={stationId} forDate={selectedDate} onSubmitted={handleDeposited} />
                  <button onClick={() => setShowForm(false)} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
