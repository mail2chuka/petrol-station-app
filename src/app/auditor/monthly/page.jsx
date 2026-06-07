'use client';

import { useEffect, useState } from 'react';
import Card from '@/components/Card';
import Select from '@/components/Select';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

export default function MonthlyReportPage() {
  const now = new Date();
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState('');
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [commentStatus, setCommentStatus] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  useEffect(() => {
    fetchStations();
  }, []);

  const fetchStations = async () => {
    const res = await fetch('/api/stations');
    const data = await res.json();
    setStations(data.stations || []);
    if (data.stations?.length > 0) setSelectedStation(data.stations[0]._id);
  };

  const generateReport = async () => {
    if (!selectedStation) return;
    setLoading(true);
    setRows([]);

    const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
    const dates = Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${year}-${month}-${String(d).padStart(2, '0')}`;
    });

    const results = await Promise.allSettled(
      dates.map((date) =>
        fetch(`/api/reports/daily?stationId=${selectedStation}&date=${date}`)
          .then((r) => r.json())
          .then((data) => ({ date, data }))
      )
    );

    const built = results.map((r, i) => {
      if (r.status !== 'fulfilled') return { date: dates[i], noData: true };
      const { date, data } = r.value;
      if (!data?.summary) return { date, noData: true };
      const s = data.summary;
      return {
        date,
        pmsLiters: s.totalSales?.PMS?.liters || 0,
        agoLiters: s.totalSales?.AGO?.liters || 0,
        expected: s.expectedAmount || 0,
        received: s.actualAmount || 0,
        discrepancy: s.discrepancy || 0,
        noData: false,
      };
    });

    setRows(built.filter((r) => !r.noData));
    setLoading(false);
  };

  const totalExpected = rows.reduce((s, r) => s + r.expected, 0);
  const totalReceived = rows.reduce((s, r) => s + r.received, 0);
  const totalDisc = rows.reduce((s, r) => s + r.discrepancy, 0);
  const totalPmsL = rows.reduce((s, r) => s + r.pmsLiters, 0);
  const totalAgoL = rows.reduce((s, r) => s + r.agoLiters, 0);

  const stationName = stations.find((s) => s._id === selectedStation)?.name || '';

  const submitComment = async () => {
    if (!selectedStation || !comment.trim()) return;
    setSavingComment(true);
    try {
      const monthDate = `${year}-${month}-01`;
      const res = await fetch('/api/auditor/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId: selectedStation, date: monthDate, comment }),
      });
      const data = await res.json();
      if (!res.ok) { setCommentStatus(data.error || 'Failed'); return; }
      setComment('');
      setCommentStatus('Comment saved for admin review.');
    } catch { setCommentStatus('Error saving comment.'); }
    finally { setSavingComment(false); }
  };

  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  return (
    <>
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold">Monthly Audit Report</h1>
        <p className="text-sm">{stationName} — {months[Number(month) - 1]} {year}</p>
      </div>

      <div className="space-y-6">
        <div className="print:hidden flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Monthly Report</h1>
            <p className="text-sm text-slate-500 mt-1">View a month-by-day audit summary with comment.</p>
          </div>
          {rows.length > 0 && (
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

        <Card title="Select Period" className="print:hidden">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Select
              label="Station"
              name="station"
              value={selectedStation}
              onChange={(e) => setSelectedStation(e.target.value)}
              options={stations.map((s) => ({ value: s._id, label: s.name }))}
            />
            <Select
              label="Month"
              name="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              options={months.map((m, i) => ({ value: String(i + 1).padStart(2, '0'), label: m }))}
            />
            <Select
              label="Year"
              name="year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              options={years.map((y) => ({ value: y, label: y }))}
            />
            <div className="flex items-end">
              <Button onClick={generateReport} disabled={loading} className="w-full">
                {loading ? 'Loading...' : 'Generate'}
              </Button>
            </div>
          </div>
        </Card>

        {loading && <Loading />}

        {rows.length > 0 && !loading && (
          <>
            {/* Totals */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { label: 'Days with Data', value: String(rows.length) },
                { label: 'PMS Litres (L)', value: fmt(totalPmsL) },
                { label: 'AGO Litres (L)', value: fmt(totalAgoL) },
                { label: 'Total Expected', value: `₦${fmt(totalExpected)}` },
                { label: 'Total Received', value: `₦${fmt(totalReceived)}`, disc: totalDisc },
              ].map((c) => (
                <div key={c.label} className="p-4 bg-white border border-slate-200 rounded-xl">
                  <p className="text-xs text-slate-500">{c.label}</p>
                  <p className="text-lg font-bold text-slate-900 mt-0.5">{c.value}</p>
                  {c.disc != null && c.disc !== 0 && (
                    <p className={`text-xs font-medium ${c.disc > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {c.disc > 0 ? '+' : ''}₦{fmt(c.disc)}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <Card title={`Daily Breakdown — ${months[Number(month) - 1]} ${year}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase tracking-wide">
                      <th className="pb-2 pr-4">Date</th>
                      <th className="pb-2 pr-4">PMS (L)</th>
                      <th className="pb-2 pr-4">AGO (L)</th>
                      <th className="pb-2 pr-4">Expected (₦)</th>
                      <th className="pb-2 pr-4">Received (₦)</th>
                      <th className="pb-2">Discrepancy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.date} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-4 font-medium whitespace-nowrap">{new Date(row.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                        <td className="py-2 pr-4">{fmt(row.pmsLiters)}</td>
                        <td className="py-2 pr-4">{fmt(row.agoLiters)}</td>
                        <td className="py-2 pr-4">{fmt(row.expected)}</td>
                        <td className="py-2 pr-4">{fmt(row.received)}</td>
                        <td className={`py-2 font-medium ${row.discrepancy < 0 ? 'text-red-600' : row.discrepancy > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                          {row.discrepancy === 0 ? '—' : `${row.discrepancy > 0 ? '+' : ''}₦${fmt(row.discrepancy)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* Comment section — always visible */}
        <Card title="Monthly Audit Comment" className="print:hidden">
          <p className="text-xs text-slate-500 mb-3">
            Leave your comment for {months[Number(month) - 1]} {year}{stationName ? ` — ${stationName}` : ''}.
          </p>
          <textarea
            className="w-full min-h-[120px] rounded-xl border-2 border-slate-200 p-3 text-sm focus:outline-none focus:border-ecana-maroon focus:ring-4 focus:ring-ecana-maroon/10 transition-all resize-none"
            placeholder="Enter your monthly audit observations and conclusions..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          {commentStatus && (
            <p className={`mt-2 text-sm ${commentStatus.includes('saved') ? 'text-green-600' : 'text-red-600'}`}>{commentStatus}</p>
          )}
          <div className="flex justify-end mt-3">
            <Button onClick={submitComment} disabled={savingComment || !comment.trim() || !selectedStation}>
              {savingComment ? 'Saving...' : 'Submit Comment'}
            </Button>
          </div>
        </Card>
      </div>

      <style>{`
        @media print {
          @page { margin: 1.5cm; }
          body { font-size: 11pt; }
        }
      `}</style>
    </>
  );
}
