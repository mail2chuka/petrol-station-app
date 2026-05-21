'use client';

import { useEffect, useState } from 'react';
import Card from '@/components/Card';
import Select from '@/components/Select';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

export default function AuditorTankStockPage() {
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    fetchStations();
  }, []);

  const fetchStations = async () => {
    const res = await fetch('/api/stations');
    const data = await res.json();
    setStations(data.stations || []);
    if (data.stations?.length > 0) setSelectedStation(data.stations[0]._id);
  };

  const fetchEntries = async () => {
    if (!selectedStation || !selectedDate) return;
    setLoading(true);
    setFetched(false);
    try {
      const res = await fetch(`/api/tank-stock?stationId=${selectedStation}&date=${selectedDate}`);
      const data = await res.json();
      setEntries(data.entries || []);
      setFetched(true);
    } catch (err) {
      console.error('Error fetching tank stock:', err);
    } finally {
      setLoading(false);
    }
  };

  const stationName = stations.find((s) => s._id === selectedStation)?.name || '';

  // Group by tankId
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all shadow-sm shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print / Save PDF
            </button>
          )}
        </div>

        <Card title="Filter" className="print:hidden">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              label="Station"
              name="station"
              value={selectedStation}
              onChange={(e) => setSelectedStation(e.target.value)}
              options={stations.map((s) => ({ value: s._id, label: s.name }))}
            />
            <Input
              label="Date"
              type="date"
              name="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <div className="flex items-end">
              <Button onClick={fetchEntries} disabled={loading} className="w-full">
                {loading ? 'Loading...' : 'View Stock'}
              </Button>
            </div>
          </div>
        </Card>

        {loading && <Loading />}

        {fetched && !loading && entries.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-8">No tank stock entries found for this date.</p>
        )}

        {Object.keys(byTank).length > 0 && !loading && (
          <Card title={`Tank Stock — ${selectedDate}`}>
            <div className="overflow-x-auto">
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

      <style>{`
        @media print {
          @page { margin: 1.5cm; size: landscape; }
          body { font-size: 10pt; }
        }
      `}</style>
    </>
  );
}
