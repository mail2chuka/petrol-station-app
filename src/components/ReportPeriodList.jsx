'use client';

import { useState, useEffect, useCallback } from 'react';

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}

function prevMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
}

function nextMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

function monthLabel(m) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });
}

function fmtDate(dateVal) {
  return new Date(dateVal).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fmtN(n) {
  return `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function toDateStr(dateVal) {
  return new Date(dateVal).toISOString().split('T')[0];
}

const STATUS_MAP = {
  ended: { label: 'Ended', cls: 'bg-green-100 text-green-700' },
  in_progress: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700' },
  not_started: { label: 'Not Started', cls: 'bg-gray-100 text-gray-500' },
};

// ── Shared period-list component ─────────────────────────────────────────────
// Props:
//   stationId   – which station to load
//   onSelectDay – callback(dateStr: YYYY-MM-DD) when a row is clicked
export default function ReportPeriodList({ stationId, onSelectDay }) {
  const [mode, setMode] = useState('month');           // 'month' | 'range'
  const [currentMonth, setCurrentMonth] = useState(currentMonthStr());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchDays = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    setError('');
    try {
      let url;
      if (mode === 'month') {
        url = `/api/reports/period-summary?stationId=${stationId}&month=${currentMonth}`;
      } else {
        if (!startDate || !endDate || endDate < startDate) return;
        url = `/api/reports/period-summary?stationId=${stationId}&startDate=${startDate}&endDate=${endDate}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) setDays(data.days || []);
      else setError(data.error || 'Failed to load reports');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [stationId, mode, currentMonth, startDate, endDate]);

  // Auto-fetch on mount and when month/station changes
  useEffect(() => {
    if (mode === 'month') fetchDays();
  }, [stationId, currentMonth, mode]);

  // Auto-fetch when custom range is complete
  useEffect(() => {
    if (mode === 'range' && startDate && endDate && endDate >= startDate) {
      fetchDays();
    }
  }, [mode, startDate, endDate, stationId]);

  // Month totals for summary row
  const totals = days.reduce(
    (acc, d) => ({
      liters: acc.liters + d.totalLiters,
      expected: acc.expected + d.totalExpected,
      cash: acc.cash + d.totalCash,
      pos: acc.pos + d.totalPos,
      discrepancy: acc.discrepancy + d.discrepancy,
    }),
    { liters: 0, expected: 0, cash: 0, pos: 0, discrepancy: 0 }
  );

  const today = todayStr();
  const canGoNext = nextMonth(currentMonth) <= today.slice(0, 7);

  return (
    <div className="space-y-4">
      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Mode toggle */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {[{ key: 'month', label: 'Monthly' }, { key: 'range', label: 'Custom Range' }].map(opt => (
            <button
              key={opt.key}
              onClick={() => setMode(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === opt.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Month picker */}
        {mode === 'month' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentMonth(prevMonth(currentMonth))}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 transition-colors"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-gray-800 min-w-[130px] text-center">
              {monthLabel(currentMonth)}
            </span>
            <button
              onClick={() => setCurrentMonth(nextMonth(currentMonth))}
              disabled={!canGoNext}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ›
            </button>
          </div>
        )}

        {/* Custom range pickers */}
        {mode === 'range' && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 whitespace-nowrap">From</label>
              <input
                type="date"
                value={startDate}
                max={today}
                onChange={e => setStartDate(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-ecana-maroon"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 whitespace-nowrap">To</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={today}
                onChange={e => setEndDate(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-ecana-maroon"
              />
            </div>
            {endDate && startDate && endDate < startDate && (
              <p className="text-xs text-red-500">End date must be after start date.</p>
            )}
          </div>
        )}

        <button
          onClick={fetchDays}
          disabled={loading}
          className="ml-auto text-xs text-ecana-maroon hover:underline font-medium disabled:opacity-40"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {/* ── Loading ── */}
      {loading && <div className="flex justify-center py-10"><div className="spinner" /></div>}

      {/* ── Table ── */}
      {!loading && days.length > 0 && (
        <div className="card-modern overflow-hidden">
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-left">Date</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-left">Status</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-right">Liters (L)</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-right">Expected (₦)</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-right">Cash (₦)</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-right">POS (₦)</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-right">Discrepancy (₦)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {days.map((day, i) => {
                  const st = STATUS_MAP[day.status] || STATUS_MAP.not_started;
                  const disc = day.discrepancy;
                  return (
                    <tr
                      key={day.dayShiftId || i}
                      onClick={() => onSelectDay(toDateStr(day.date))}
                      className="hover:bg-blue-50 cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 group-hover:text-ecana-maroon whitespace-nowrap">
                        {fmtDate(day.date)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">
                        {Number(day.totalLiters).toLocaleString('en-NG', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">
                        {Number(day.totalExpected).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">
                        {Number(day.totalCash).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">
                        {Number(day.totalPos).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={`px-4 py-3 text-sm font-semibold text-right ${
                        disc < 0 ? 'text-red-600' : disc > 0 ? 'text-green-600' : 'text-gray-500'
                      }`}>
                        {disc >= 0 ? '+' : ''}{Math.abs(disc).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Period totals row */}
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide" colSpan={2}>
                    Period Total ({days.length} day{days.length !== 1 ? 's' : ''})
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{Number(totals.liters).toLocaleString('en-NG', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{Number(totals.expected).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{Number(totals.cash).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{Number(totals.pos).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className={`px-4 py-3 text-sm font-bold text-right ${
                    totals.discrepancy < 0 ? 'text-red-600' : totals.discrepancy > 0 ? 'text-green-600' : 'text-gray-500'
                  }`}>
                    {totals.discrepancy >= 0 ? '+' : ''}{Math.abs(totals.discrepancy).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && days.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <svg className="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-base font-medium">No reports found</p>
          <p className="text-sm mt-1">
            {mode === 'month' ? `No day shifts recorded for ${monthLabel(currentMonth)}` : 'No day shifts in the selected date range'}
          </p>
        </div>
      )}

      {/* ── Range hint ── */}
      {!loading && mode === 'range' && (!startDate || !endDate) && (
        <p className="text-sm text-gray-400 text-center py-8">Select a start and end date to view reports.</p>
      )}
    </div>
  );
}
