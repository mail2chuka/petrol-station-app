'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Select from '@/components/Select';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function MonthlyReportContent() {
  const searchParams = useSearchParams();
  const now = new Date();
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(searchParams.get('stationId') || '');
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/stations')
      .then(r => r.json())
      .then(d => {
        const list = d.stations || [];
        setStations(list);
        if (!selectedStation && list.length > 0) setSelectedStation(list[0]._id);
      })
      .catch(() => {});
  }, []);

  const generateReport = async () => {
    if (!selectedStation) return;
    setLoading(true);
    setError('');
    setRows([]);

    const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
    const dates = Array.from({ length: daysInMonth }, (_, i) => {
      const d = String(i + 1).padStart(2, '0');
      return `${year}-${month}-${d}`;
    });

    try {
      const results = await Promise.allSettled(
        dates.map(date =>
          fetch(`/api/reports/daily?stationId=${selectedStation}&date=${date}`)
            .then(r => r.json())
            .then(data => ({ date, data }))
        )
      );

      const built = results
        .map((r, i) => {
          if (r.status !== 'fulfilled') return null;
          const { date, data } = r.value;
          if (!data?.summary) return null;
          const s = data.summary;
          return {
            date,
            pmsLiters: s.totalSales?.PMS?.liters || 0,
            agoLiters: s.totalSales?.AGO?.liters || 0,
            expected: s.expectedAmount || 0,
            collected: s.totalCollected || 0,
            discrepancy: s.discrepancy || 0,
          };
        })
        .filter(Boolean);

      setRows(built);
    } catch {
      setError('Failed to generate report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const stationName = stations.find(s => s._id === selectedStation)?.name || '';
  const stationCode = stations.find(s => s._id === selectedStation)?.code || '';
  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  const totals = {
    pms: rows.reduce((s, r) => s + r.pmsLiters, 0),
    ago: rows.reduce((s, r) => s + r.agoLiters, 0),
    expected: rows.reduce((s, r) => s + r.expected, 0),
    collected: rows.reduce((s, r) => s + r.collected, 0),
    discrepancy: rows.reduce((s, r) => s + r.discrepancy, 0),
  };

  return (
    <>
      {/* Print header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold">External Audit — Monthly Report</h1>
        <p className="text-sm">{stationName} ({stationCode}) — {MONTHS[Number(month) - 1]} {year}</p>
        <p className="text-xs text-gray-500 mt-1">Generated: {new Date().toLocaleString('en-NG')}</p>
      </div>

      <div className="space-y-6">
        {/* Header */}
        <div className="print:hidden flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Monthly Report</h1>
            <p className="text-gray-500 mt-1">Month-by-day revenue and volume breakdown.</p>
          </div>
          {rows.length > 0 && (
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all shadow-sm shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              Print / Save PDF
            </button>
          )}
        </div>

        {/* Filters */}
        <Card title="Select Period" className="print:hidden">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Select
              label="Station"
              name="station"
              value={selectedStation}
              onChange={e => setSelectedStation(e.target.value)}
              options={stations.map(s => ({ value: s._id, label: `${s.name} (${s.code})` }))}
            />
            <Select
              label="Month"
              name="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              options={MONTHS.map((m, i) => ({ value: String(i + 1).padStart(2, '0'), label: m }))}
            />
            <Select
              label="Year"
              name="year"
              value={year}
              onChange={e => setYear(e.target.value)}
              options={years.map(y => ({ value: y, label: y }))}
            />
            <div className="flex items-end">
              <Button onClick={generateReport} disabled={loading} className="w-full">
                {loading ? 'Loading…' : 'Generate'}
              </Button>
            </div>
          </div>
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
          )}
        </Card>

        {loading && <div className="flex justify-center py-12"><div className="spinner" /></div>}

        {rows.length > 0 && !loading && (
          <>
            {/* Totals */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { label: 'Days with Data', value: String(rows.length) },
                { label: 'PMS Litres', value: `${fmt(totals.pms)} L` },
                { label: 'AGO Litres', value: `${fmt(totals.ago)} L` },
                { label: 'Total Expected', value: `₦${fmt(totals.expected)}` },
                {
                  label: 'Total Collected',
                  value: `₦${fmt(totals.collected)}`,
                  disc: totals.discrepancy,
                },
              ].map(tile => (
                <div key={tile.label} className="card-modern p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{tile.label}</p>
                  <p className="text-lg font-bold text-gray-800">{tile.value}</p>
                  {tile.disc != null && tile.disc !== 0 && (
                    <p className={`text-xs font-medium mt-0.5 ${tile.disc > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {tile.disc > 0 ? '+' : ''}₦{fmt(tile.disc)} discrepancy
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Daily breakdown table */}
            <Card title={`Daily Breakdown — ${MONTHS[Number(month) - 1]} ${year}`}>
              <div className="overflow-auto max-h-[60vh]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                      <th className="pb-2 pr-4">Date</th>
                      <th className="pb-2 pr-4 text-right">PMS (L)</th>
                      <th className="pb-2 pr-4 text-right">AGO (L)</th>
                      <th className="pb-2 pr-4 text-right">Expected (₦)</th>
                      <th className="pb-2 pr-4 text-right">Collected (₦)</th>
                      <th className="pb-2 text-right">Discrepancy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.date} className="border-b border-gray-100 last:border-0">
                        <td className="py-2.5 pr-4 font-medium text-gray-800">
                          {new Date(row.date + 'T12:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-gray-700">{fmt(row.pmsLiters)}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-700">{fmt(row.agoLiters)}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-700">{fmt(row.expected)}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-700">{fmt(row.collected)}</td>
                        <td className={`py-2.5 text-right font-medium ${row.discrepancy < 0 ? 'text-red-600' : row.discrepancy > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {row.discrepancy === 0 ? '—' : `${row.discrepancy > 0 ? '+' : ''}₦${fmt(row.discrepancy)}`}
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="border-t-2 border-gray-300 font-semibold text-gray-800">
                      <td className="pt-3 pr-4">Total ({rows.length} days)</td>
                      <td className="pt-3 pr-4 text-right">{fmt(totals.pms)}</td>
                      <td className="pt-3 pr-4 text-right">{fmt(totals.ago)}</td>
                      <td className="pt-3 pr-4 text-right">{fmt(totals.expected)}</td>
                      <td className="pt-3 pr-4 text-right">{fmt(totals.collected)}</td>
                      <td className={`pt-3 text-right ${totals.discrepancy < 0 ? 'text-red-600' : totals.discrepancy > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {totals.discrepancy === 0 ? '—' : `${totals.discrepancy > 0 ? '+' : ''}₦${fmt(totals.discrepancy)}`}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {!loading && rows.length === 0 && !error && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg">Select a station and period, then click Generate.</p>
          </div>
        )}
      </div>

      <style>{`
        @media print {
          @page { margin: 1.5cm; }
          body { font-size: 11pt; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </>
  );
}

export default function ExternalAuditorMonthlyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <MonthlyReportContent />
    </Suspense>
  );
}
