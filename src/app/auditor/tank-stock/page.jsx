'use client';

import { useEffect, useState, useCallback } from 'react';
import Card from '@/components/Card';
import Select from '@/components/Select';
import DateCalendar from '@/components/DateCalendar';
import Loading from '@/components/Loading';

function todayStr() { return new Date().toISOString().split('T')[0]; }

function fmt(n) {
  return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

export default function AuditorTankStockPage() {
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState('');
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [markedDates, setMarkedDates] = useState({});
  const [loadingMonth, setLoadingMonth] = useState(false);

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

  const fetchMonthMarks = useCallback(async (monthStr, stId) => {
    const sid = stId || selectedStation;
    if (!sid) return;
    setLoadingMonth(true);
    try {
      const res = await fetch(`/api/tank-stock?stationId=${sid}&month=${monthStr}`);
      const data = await res.json();
      if (!res.ok) return;
      const hasClosure = {};
      const hasSomething = {};
      for (const e of data.entries || []) {
        const d = new Date(e.date).toISOString().split('T')[0];
        hasSomething[d] = true;
        if (e.period === 'closing') hasClosure[d] = true;
      }
      const marks = {};
      for (const d of Object.keys(hasSomething)) {
        marks[d] = { total: 1, pending: hasClosure[d] ? 0 : 1 };
      }
      setMarkedDates(marks);
    } catch {} finally { setLoadingMonth(false); }
  }, [selectedStation]);

  const fetchEntries = useCallback(async (date, stId) => {
    const sid = stId || selectedStation;
    if (!sid || !date) return;
    setLoading(true);
    setFetched(false);
    try {
      const res = await fetch(`/api/tank-stock?stationId=${sid}&date=${date}`);
      const data = await res.json();
      setEntries(data.entries || []);
      setFetched(true);
    } catch {} finally { setLoading(false); }
  }, [selectedStation]);

  useEffect(() => {
    if (!selectedStation) return;
    setMarkedDates({});
    setEntries([]);
    setFetched(false);
    const m = new Date().toISOString().slice(0, 7);
    fetchMonthMarks(m, selectedStation);
    fetchEntries(selectedDate, selectedStation);
  }, [selectedStation]);

  const handleDateChange = (date) => {
    setSelectedDate(date);
    fetchEntries(date);
  };

  const stationName = stations.find(s => s._id === selectedStation)?.name || '';

  const byTank = {};
  for (const e of entries) {
    if (!byTank[e.tankId]) byTank[e.tankId] = { label: e.tankLabel || e.tankId, product: e.product, opening: null, closing: null };
    byTank[e.tankId][e.period] = e;
  }

  return (
    <>
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold">Tank Stock Report</h1>
        <p className="text-sm">{stationName} — {selectedDate}</p>
      </div>

      <div className="space-y-6">
        <div className="print:hidden flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tank Stock</h1>
            <p className="text-sm text-slate-500 mt-1">View supervisor tank stock entries (opening and closing) by station and date.</p>
          </div>
          {entries.length > 0 && (
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all shadow-sm shrink-0 print:hidden"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print / Save PDF
            </button>
          )}
        </div>

        <div className="print:hidden max-w-xs">
          <Select
            label="Station"
            name="station"
            value={selectedStation}
            onChange={e => setSelectedStation(e.target.value)}
            options={stations.map(s => ({ value: s._id, label: s.name }))}
          />
        </div>

        <div className="print:hidden grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
          {/* Calendar */}
          <div className="space-y-2">
            <DateCalendar
              value={selectedDate}
              onChange={handleDateChange}
              onMonthChange={(m) => fetchMonthMarks(m, selectedStation)}
              markedDates={markedDates}
              maxDate={todayStr()}
            />
            {loadingMonth && <p className="text-xs text-center text-gray-400">Loading month data…</p>}
          </div>

          {/* Content */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </h2>
              <button onClick={() => fetchEntries(selectedDate)} disabled={loading} className="text-sm text-ecana-maroon hover:underline font-medium disabled:opacity-50">
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {loading && <div className="flex justify-center py-12"><div className="spinner" /></div>}

            {fetched && !loading && entries.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg className="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-base font-medium">No tank stock entries for this date</p>
              </div>
            )}

            {!fetched && !loading && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg className="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-base font-medium">Select a marked day to view tank stock</p>
              </div>
            )}

            {Object.keys(byTank).length > 0 && !loading && (
              <Card title={`Tank Stock — ${selectedDate}`}>
                <div className="overflow-auto max-h-[60vh]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase tracking-wide">
                        <th className="pb-2 pr-4">Tank</th>
                        <th className="pb-2 pr-4">Product</th>
                        <th className="pb-2 pr-4">Opening (L)</th>
                        <th className="pb-2 pr-4">Closing Measured (L)</th>
                        <th className="pb-2 pr-4">Closing Confirmed (L)</th>
                        <th className="pb-2 pr-4">Variance</th>
                        <th className="pb-2">Supervisor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(byTank).map(([tankId, tank]) => {
                        const op = tank.opening;
                        const cl = tank.closing;
                        const variance = cl?.variance ?? null;
                        const variancePct = cl?.variancePercent ?? null;
                        return (
                          <tr key={tankId} className="border-b border-slate-100 last:border-0">
                            <td className="py-2.5 pr-4 font-medium">{tank.label}</td>
                            <td className="py-2.5 pr-4">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tank.product === 'PMS' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                {tank.product}
                              </span>
                            </td>
                            <td className="py-2.5 pr-4">{op ? fmt(op.openingStock) : '—'}</td>
                            <td className="py-2.5 pr-4">{cl ? fmt(cl.closingStockMeasured) : '—'}</td>
                            <td className="py-2.5 pr-4">{cl?.closingStockManager != null ? fmt(cl.closingStockManager) : <span className="text-slate-400 text-xs">Pending</span>}</td>
                            <td className={`py-2.5 pr-4 font-medium ${variance == null ? 'text-slate-400' : variance < 0 ? 'text-red-600' : variance > 0 ? 'text-green-600' : 'text-slate-500'}`}>
                              {variance == null ? '—' : `${variance > 0 ? '+' : ''}${fmt(variance)}L (${variancePct?.toFixed(1)}%)`}
                            </td>
                            <td className="py-2.5 text-slate-500 text-xs">{cl?.supervisorName || op?.supervisorName || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { margin: 1.5cm; size: landscape; }
          body { font-size: 10pt; }
        }
      `}</style>
    </>
  );
}
