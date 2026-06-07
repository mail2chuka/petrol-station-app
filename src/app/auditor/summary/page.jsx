'use client';

import { useEffect, useState, useCallback } from 'react';

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}
function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function fmtNum(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AuditorSummaryPage() {
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState('');
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayIso());
  const [productFilter, setProductFilter] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/stations')
      .then(r => r.json())
      .then(d => {
        const list = (d.stations || []).filter(s => s.isActive !== false);
        setStations(list);
        if (list.length > 0) setSelectedStation(list[0]._id);
      })
      .catch(() => {});
  }, []);

  const fetchRows = useCallback(async () => {
    if (!selectedStation) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/reports/summary-book?stationId=${selectedStation}&from=${from}&to=${to}`);
      const data = await res.json();
      if (res.ok) setRows(data.rows || []);
      else setError(data.error || 'Failed to load summary');
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, [selectedStation, from, to]);

  useEffect(() => { if (selectedStation) fetchRows(); }, [selectedStation]);

  const visibleRows = productFilter ? rows.filter(r => r.product === productFilter) : rows;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Summary Book</h1>
        <p className="text-sm text-gray-500 mt-1">Daily stock, sales, tolerance and shortage per product.</p>
      </div>

      {/* Filters */}
      <div className="card-modern p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Station</label>
          <select value={selectedStation} onChange={e => setSelectedStation(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-ecana-maroon bg-white">
            {stations.map(s => <option key={s._id} value={s._id}>{s.name} ({s.code})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={from} max={todayIso()} onChange={e => setFrom(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-ecana-maroon" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={to} min={from} max={todayIso()} onChange={e => setTo(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-ecana-maroon" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Product</label>
          <select value={productFilter} onChange={e => setProductFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-ecana-maroon bg-white">
            <option value="">All</option>
            {['PMS','AGO','LPG','DPK'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <button onClick={fetchRows} disabled={loading}
          className="px-4 py-1.5 text-sm bg-ecana-maroon text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium">
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
      {loading && <div className="flex justify-center py-10"><div className="spinner" /></div>}

      {!loading && visibleRows.length === 0 && !error && (
        <div className="text-center py-16 text-gray-400 text-sm">No summary data for this date range.</div>
      )}

      {!loading && visibleRows.length > 0 && (
        <div className="card-modern overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Date','Product','Opening Stock (L)','Stock In (L)','Tolerance (L)','Exp. Tolerance (L)','Sales (L)','Price/L (₦)','Sales Amount (₦)','Shortage Recorded (L)','Closing Stock (L)'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleRows.map((r, i) => {
                  const tolerance = (r.sales ?? 0) - ((r.openingStock ?? 0) + (r.stockIn ?? 0) - (r.closingStock ?? 0));
                  const expTol = r.expectedTolerance ?? 0;
                  const isFlagged = expTol > 0 && Math.abs(tolerance) > expTol * 1.2;
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium text-gray-900 whitespace-nowrap">{new Date(r.date + 'T12:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                      <td className="px-3 py-2.5 text-gray-700">{r.product || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-700">{fmtNum(r.openingStock)}</td>
                      <td className="px-3 py-2.5 text-gray-700">{fmtNum(r.stockIn)}</td>
                      <td className={`px-3 py-2.5 font-medium ${tolerance < 0 ? 'text-red-600' : tolerance > 0 ? 'text-green-600' : 'text-gray-700'}`}>
                        {fmtNum(tolerance)}
                      </td>
                      <td className={`px-3 py-2.5 ${isFlagged ? 'bg-amber-50 text-amber-800 font-semibold' : 'text-gray-700'}`}>
                        {fmtNum(expTol)}{isFlagged && <span className="ml-1 text-amber-600">⚠</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">{fmtNum(r.sales)}</td>
                      <td className="px-3 py-2.5 text-gray-700">{fmtNum(r.priceForDay)}</td>
                      <td className="px-3 py-2.5 text-gray-700">{fmtNum((r.priceForDay ?? 0) * (r.sales ?? 0))}</td>
                      <td className={`px-3 py-2.5 ${r.shortage > 0 ? 'text-red-600 font-medium' : 'text-gray-700'}`}>{fmtNum(r.shortage)}</td>
                      <td className="px-3 py-2.5 text-gray-700">{fmtNum(r.closingStock)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
