'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Loading from '@/components/Loading';

function firstDayOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}
function fmtNum(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Same palette as meter-readings page
const TANK_COLORS = [
  { border: 'border-l-blue-400',   bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-400'   },
  { border: 'border-l-green-400',  bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-400'  },
  { border: 'border-l-amber-400',  bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400'  },
  { border: 'border-l-purple-400', bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-400' },
  { border: 'border-l-rose-400',   bg: 'bg-rose-50',   text: 'text-rose-700',   dot: 'bg-rose-400'   },
];

export default function SupervisorReportPage() {
  const { data: session } = useSession();
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(todayStr());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pumpTankMap, setPumpTankMap] = useState({}); // pumpId -> { tankId, tankLabel }

  useEffect(() => {
    if (session) {
      fetchReport();
      // Fetch station data for pump→tank mapping
      if (session.user?.stationId) {
        fetch(`/api/stations/${session.user.stationId}`)
          .then((r) => r.json())
          .then((data) => {
            const dispensers = data.station?.dispensers || [];
            const tanks = data.station?.tanks || [];
            const map = {};
            dispensers.forEach((d) => {
              if (d.tankId) {
                const tank = tanks.find((t) => t._id === d.tankId);
                map[d.dispenserId] = { tankId: d.tankId, tankLabel: tank?.label || d.tankId };
              }
            });
            setPumpTankMap(map);
          })
          .catch(() => {});
      }
    }
  }, [session]);

  async function fetchReport() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/reports/supervisor-summary?from=${from}&to=${to}`);
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Failed to load report');
      else setRows(data.rows || []);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  // Group rows by date for visual separation
  const byDate = rows.reduce((acc, r) => {
    if (!acc[r.date]) acc[r.date] = [];
    acc[r.date].push(r);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort();

  // Build tankId → TANK_COLORS index (same logic as meter-readings)
  const tankColorIndex = {};
  let _ci = 0;
  Object.values(pumpTankMap).forEach(({ tankId }) => {
    if (tankId && !(tankId in tankColorIndex)) {
      tankColorIndex[tankId] = _ci++ % TANK_COLORS.length;
    }
  });

  function tankColor(pumpId) {
    const tankId = pumpTankMap[pumpId]?.tankId;
    const idx = tankId !== undefined ? tankColorIndex[tankId] : undefined;
    return idx !== undefined ? TANK_COLORS[idx] : null;
  }

  // Legend: unique tanks that have a color assigned
  const legendEntries = Object.entries(tankColorIndex).map(([tankId, idx]) => {
    // find a label from pumpTankMap
    const label = Object.values(pumpTankMap).find((v) => v.tankId === tankId)?.tankLabel || tankId;
    return { tankId, label, color: TANK_COLORS[idx] };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Summary Report</h1>
        <p className="text-sm text-slate-500 mt-1">
          Meter readings per pump by date — opening, closing, difference, RTT, actual sold, and tank closing stock.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input type="date" value={from} max={todayStr()}
              onChange={e => setFrom(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-ecana-maroon" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input type="date" value={to} min={from} max={todayStr()}
              onChange={e => setTo(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-ecana-maroon" />
          </div>
          <button onClick={fetchReport} disabled={loading}
            className="px-4 py-1.5 text-sm bg-ecana-maroon text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium">
            {loading ? 'Loading…' : 'Load Report'}
          </button>
        </div>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {/* Color legend */}
      {legendEntries.length > 0 && (
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Tank</span>
          {legendEntries.map(({ tankId, label, color }) => (
            <div key={tankId} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color.dot}`} />
              <span className={`text-xs font-medium ${color.text}`}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {loading ? <Loading /> : rows.length === 0 && !error ? (
        <div className="text-center py-16 text-gray-400 text-sm">No readings found for this date range.</div>
      ) : (
        <div className="card-modern overflow-hidden">
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Pump</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tank</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Fuel</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Opening</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Closing</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Difference (L)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">RTT (L)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actual Sold (L)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Tank Closing Stock (L)</th>
                </tr>
              </thead>
              <tbody>
                {dates.map((date, di) => {
                  const dateRows = byDate[date];
                  return dateRows.map((r, ri) => (
                    <tr key={`${date}-${r.pumpId}`}
                      className={`border-b border-gray-100 border-l-4 ${ri === 0 && di > 0 ? 'border-t-2 border-t-gray-200' : ''} ${tankColor(r.pumpId)?.bg || ''} ${tankColor(r.pumpId)?.border || 'border-l-transparent'} hover:brightness-95 transition-all`}>
                      {/* Date cell only on first pump of that date */}
                      {ri === 0 ? (
                        <td className="px-4 py-2.5 font-semibold text-gray-900 whitespace-nowrap align-top"
                          rowSpan={dateRows.length}>
                          {new Date(date + 'T12:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </td>
                      ) : null}
                      <td className="px-4 py-2.5 font-medium text-gray-800">{r.pumpLabel}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${tankColor(r.pumpId)?.bg || 'bg-slate-50'} ${tankColor(r.pumpId)?.text || 'text-gray-600'}`}>
                          {pumpTankMap[r.pumpId]?.tankLabel || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{r.fuelType || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{fmtNum(r.opening)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{r.closing != null ? fmtNum(r.closing) : <span className="text-amber-500 text-xs font-medium">Pending</span>}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{fmtNum(r.difference)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{fmtNum(r.rtt)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmtNum(r.actualSold)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{fmtNum(r.tankClosingStock)}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
