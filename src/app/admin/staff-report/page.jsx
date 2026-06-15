'use client';

import { useState, useEffect, useCallback } from 'react';
import Select from '@/components/Select';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// Get Monday of the week containing dateStr
function weekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function monthStart(dateStr) {
  return dateStr.slice(0, 7) + '-01';
}

function daysInMonth(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function shortLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric' });
}

function shortDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return String(d.getDate());
}

function fmtN(n) {
  return `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Cell component
function HeatCell({ day, dayData, isFuture, onClick }) {
  if (isFuture) {
    return (
      <td className="border border-gray-100 px-1 py-1 text-center align-middle min-w-[2.5rem]">
        <div className="w-full h-8 rounded bg-gray-100 flex items-center justify-center text-gray-300 text-xs">—</div>
      </td>
    );
  }
  if (!dayData) {
    return (
      <td className="border border-gray-100 px-1 py-1 text-center align-middle min-w-[2.5rem]">
        <div className="w-full h-8 rounded bg-gray-50 flex items-center justify-center text-gray-300 text-xs">·</div>
      </td>
    );
  }

  const bg = dayData.shortage > 0 ? 'bg-amber-200 hover:bg-amber-300' : 'bg-green-200 hover:bg-green-300';
  const label = dayData.shortage > 0 ? fmtN(dayData.shortage) : '✓';
  const textColor = dayData.shortage > 0 ? 'text-amber-900' : 'text-green-900';

  return (
    <td className="border border-gray-100 px-1 py-1 text-center align-middle min-w-[2.5rem]">
      <button
        onClick={() => onClick && onClick(day, dayData)}
        className={`w-full h-8 rounded text-xs font-medium transition-colors ${bg} ${textColor} truncate px-1`}
        title={`${day}: ${dayData.pumps?.join(', ')} — Shortage: ${fmtN(dayData.shortage)}`}
      >
        {dayData.shortage > 0 ? '₦' : '✓'}
      </button>
    </td>
  );
}

// Day detail popup
function DayPopup({ attendantName, day, dayData, onClose }) {
  if (!dayData) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl">
        <h2 className="text-lg font-bold text-gray-900 mb-1">{attendantName}</h2>
        <p className="text-sm text-gray-500 mb-4">{new Date(day + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Pump(s)</dt>
            <dd className="text-gray-900 font-medium">{dayData.pumps?.join(', ') || '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Meter Sales</dt>
            <dd className="text-gray-900 font-medium">{fmtN(dayData.meterSales)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Cash Collected</dt>
            <dd className="text-gray-900 font-medium">{fmtN(dayData.cashCollected)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Shortage</dt>
            <dd className={`font-semibold ${dayData.shortage > 0 ? 'text-amber-700' : 'text-green-700'}`}>
              {dayData.shortage > 0 ? fmtN(dayData.shortage) : '—'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Overage</dt>
            <dd className={`font-semibold ${dayData.overage > 0 ? 'text-green-700' : 'text-gray-400'}`}>
              {dayData.overage > 0 ? fmtN(dayData.overage) : '—'}
            </dd>
          </div>
        </dl>
        <button onClick={onClose}
          className="mt-5 w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200">
          Close
        </button>
      </div>
    </div>
  );
}

export default function StaffReportPage() {
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState('');
  const [mode, setMode] = useState('weekly'); // 'weekly' | 'monthly'
  const [anchor, setAnchor] = useState(todayStr()); // reference date for navigation
  const [rows, setRows] = useState([]);
  const [byDay, setByDay] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'shortage' | 'amount'

  // Popup
  const [popup, setPopup] = useState(null); // { attendantId, attendantName, day, dayData }

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

  // Compute date range from anchor + mode
  const from = mode === 'weekly' ? weekStart(anchor) : monthStart(anchor);
  const to = mode === 'weekly'
    ? addDays(from, 6)
    : addDays(from, daysInMonth(anchor) - 1);

  // Generate column date strings
  const cols = [];
  let cur = from;
  while (cur <= to) {
    cols.push(cur);
    cur = addDays(cur, 1);
  }

  const fetchData = useCallback(async () => {
    if (!selectedStation) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/attendant-performance?stationId=${selectedStation}&from=${from}&to=${to}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed'); return; }
      setRows(data.rows || []);
      setByDay(data.byDay || []);
    } catch { setError('Network error.'); }
    finally { setLoading(false); }
  }, [selectedStation, from, to]);

  useEffect(() => { if (selectedStation) fetchData(); }, [selectedStation, from, to]);

  // Build lookup: attendantId → { date → dayData }
  const attendantDayMap = {};
  for (const d of byDay) {
    if (!attendantDayMap[d.attendantId]) attendantDayMap[d.attendantId] = {};
    attendantDayMap[d.attendantId][d.date] = d;
  }

  // Filter + sort rows
  const filteredRows = rows
    .filter(r => !search || r.attendantName.toLowerCase().includes(search.toLowerCase()) || r.attendantStaffNumber.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'shortage') return b.totalShortage - a.totalShortage;
      if (sortBy === 'amount') return b.totalMeterSales - a.totalMeterSales;
      return a.attendantStaffNumber.localeCompare(b.attendantStaffNumber);
    });

  function navigate(dir) {
    if (mode === 'weekly') {
      setAnchor(addDays(anchor, dir * 7));
    } else {
      const d = new Date(anchor + 'T12:00:00');
      d.setMonth(d.getMonth() + dir);
      setAnchor(d.toISOString().split('T')[0]);
    }
  }

  const rangeLabel = mode === 'weekly'
    ? `${new Date(from + 'T12:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })} – ${new Date(to + 'T12:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : new Date(from + 'T12:00:00').toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });

  const stationOptions = stations.map(s => ({ value: s._id, label: `${s.name} (${s.code})` }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Staff Performance Heatmap</h1>
        <div className="w-64">
          <Select label="Station" name="station" value={selectedStation}
            onChange={e => setSelectedStation(e.target.value)} options={stationOptions} />
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Mode toggle */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {['weekly', 'monthly'].map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {m}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[16rem] text-center">{rangeLabel}</span>
          <button onClick={() => navigate(1)} disabled={to >= todayStr()}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button onClick={() => setAnchor(todayStr())} className="text-sm text-ecana-maroon hover:underline font-medium">Today</button>
        </div>

        {/* Search */}
        <input type="text" placeholder="Search attendant…" value={search} onChange={e => setSearch(e.target.value)}
          className="text-sm border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:border-ecana-maroon w-48" />

        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="text-sm border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:border-ecana-maroon">
          <option value="name">Sort: Name</option>
          <option value="shortage">Sort: Total Shortage</option>
          <option value="amount">Sort: Sales Amount</option>
        </select>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-600 flex-wrap">
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-green-200" /> Worked, no shortage</div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-amber-200" /> Worked, shortage</div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-gray-50 border border-gray-200" /> Not assigned</div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-gray-100" /> Future</div>
      </div>

      {error && <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><div className="spinner" /></div>
      ) : filteredRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <p className="text-base font-medium">No attendant data for this period</p>
          <p className="text-sm mt-1">Assign attendants to pumps to see performance data here.</p>
        </div>
      ) : (
        <div className="card-modern overflow-hidden">
          <div className="overflow-auto max-h-[60vh]">
            <table className="text-xs border-collapse w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide sticky left-0 bg-gray-50 z-10 min-w-[8rem] border-r border-gray-200">
                    Attendant
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide min-w-[3.5rem] border-r border-gray-100">
                    STF#
                  </th>
                  {cols.map(col => (
                    <th key={col} className="px-1 py-2.5 text-center font-medium text-gray-500 min-w-[2.5rem] border border-gray-100">
                      {mode === 'weekly' ? shortLabel(col) : shortDay(col)}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-600 text-xs uppercase tracking-wide sticky right-0 bg-gray-50 z-10 border-l border-gray-200">
                    Summary
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => {
                  const dayMap = attendantDayMap[row.attendantId] || {};
                  const today = todayStr();
                  const weekShortage = Object.values(dayMap).reduce((s, d) => s + (d.shortage || 0), 0);
                  return (
                    <tr key={row.attendantId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2 font-medium text-gray-900 sticky left-0 bg-white z-10 border-r border-gray-200 whitespace-nowrap">
                        {row.attendantName}
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-500 border-r border-gray-100 whitespace-nowrap">
                        {row.attendantStaffNumber}
                      </td>
                      {cols.map(col => (
                        <HeatCell
                          key={col}
                          day={col}
                          dayData={dayMap[col] || null}
                          isFuture={col > today}
                          onClick={(day, data) => setPopup({ attendantId: row.attendantId, attendantName: row.attendantName, day, dayData: data })}
                        />
                      ))}
                      <td className="px-3 py-2 text-right sticky right-0 bg-white z-10 border-l border-gray-200 whitespace-nowrap">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-gray-600">{row.daysWorked}d</span>
                          {weekShortage > 0 && (
                            <span className="text-amber-700 font-medium">{fmtN(weekShortage)}</span>
                          )}
                          {weekShortage === 0 && row.daysWorked > 0 && (
                            <span className="text-green-600 font-medium">Clean</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Day detail popup */}
      {popup && (
        <DayPopup
          attendantName={popup.attendantName}
          day={popup.day}
          dayData={popup.dayData}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}
