'use client';

import { useEffect, useState } from 'react';
import Card from '@/components/Card';
import Select from '@/components/Select';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

export default function MeterBookPage() {
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [readings, setReadings] = useState([]);
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

  const fetchReadings = async () => {
    if (!selectedStation || !selectedDate) return;
    setLoading(true);
    setFetched(false);
    try {
      const res = await fetch(
        `/api/meter-readings?stationId=${selectedStation}&date=${selectedDate}`
      );
      const data = await res.json();
      setReadings(data.readings || []);
      setFetched(true);
    } catch (err) {
      console.error('Error fetching meter readings:', err);
    } finally {
      setLoading(false);
    }
  };

  const stationName = stations.find((s) => s._id === selectedStation)?.name || '';

  return (
    <>
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold">Meter Book</h1>
        <p className="text-sm">{stationName} — {selectedDate}</p>
      </div>

      <div className="space-y-6">
        <div className="print:hidden flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Meter Book</h1>
            <p className="text-sm text-slate-500 mt-1">View supervisor pump meter readings by station and date.</p>
          </div>
          {readings.length > 0 && (
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
              <Button onClick={fetchReadings} disabled={loading} className="w-full">
                {loading ? 'Loading...' : 'View Readings'}
              </Button>
            </div>
          </div>
        </Card>

        {loading && <Loading />}

        {fetched && !loading && readings.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-8">No meter readings found for this date.</p>
        )}

        {readings.length > 0 && !loading && (
          <Card title={`Meter Readings — ${selectedDate}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase tracking-wide">
                    <th className="pb-2 pr-4">Pump</th>
                    <th className="pb-2 pr-4">Supervisor</th>
                    <th className="pb-2 pr-4">Prev. Closing</th>
                    <th className="pb-2 pr-4">Opening</th>
                    <th className="pb-2 pr-4">Closing</th>
                    <th className="pb-2 pr-4">RTT</th>
                    <th className="pb-2 pr-4">Net Litres</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((r) => {
                    const net = r.closing - r.opening - r.rtt;
                    return (
                      <tr key={r._id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 pr-4 font-medium">{r.pumpLabel || r.pumpId}</td>
                        <td className="py-2.5 pr-4 text-slate-600">{r.supervisorName}</td>
                        <td className="py-2.5 pr-4 text-slate-500">{r.previousDayClosing ?? '—'}</td>
                        <td className={`py-2.5 pr-4 font-semibold ${r.discrepancyFlag ? 'text-amber-700' : ''}`}>{r.opening}</td>
                        <td className="py-2.5 pr-4">{r.closing}</td>
                        <td className="py-2.5 pr-4">{r.rtt}</td>
                        <td className="py-2.5 pr-4 font-semibold">{net.toFixed(2)}L</td>
                        <td className="py-2.5">
                          {r.discrepancyFlag ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">
                              ⚠ Discrepancy
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                              OK
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Discrepancy detail section */}
            {readings.some((r) => r.discrepancyFlag) && (
              <div className="mt-6 pt-4 border-t border-slate-200 space-y-3">
                <p className="text-sm font-semibold text-amber-700">Discrepancy Details</p>
                {readings.filter((r) => r.discrepancyFlag).map((r) => (
                  <div key={r._id} className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-sm">
                    <p className="font-medium text-amber-800">{r.pumpLabel || r.pumpId}</p>
                    <p className="text-amber-700 text-xs mt-0.5">
                      Previous closing: {r.previousDayClosing} → Today&apos;s opening: {r.opening} (diff: {(r.opening - r.previousDayClosing).toFixed(2)})
                    </p>
                    {r.discrepancyComment && (
                      <p className="text-amber-700 text-xs mt-1">Comment: &ldquo;{r.discrepancyComment}&rdquo;</p>
                    )}
                  </div>
                ))}
              </div>
            )}
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
