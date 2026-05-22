'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Select from '@/components/Select';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
}

function DailyReportContent() {
  const searchParams = useSearchParams();
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(searchParams.get('stationId') || '');
  const [selectedDate, setSelectedDate] = useState(
    searchParams.get('date') || new Date().toISOString().split('T')[0]
  );
  const [report, setReport] = useState(null);
  const [financialSummary, setFinancialSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [commentStatus, setCommentStatus] = useState('');
  const [previousComments, setPreviousComments] = useState([]);

  useEffect(() => {
    fetchStations();
  }, []);

  useEffect(() => {
    if (selectedStation && selectedDate) fetchComments();
  }, [selectedStation, selectedDate]);

  const fetchStations = async () => {
    try {
      const res = await fetch('/api/stations');
      const data = await res.json();
      const list = data.stations || [];
      setStations(list);
      if (!selectedStation && list.length > 0) setSelectedStation(list[0]._id);
    } catch {
      // silent
    }
  };

  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/auditor/comments?stationId=${selectedStation}&date=${selectedDate}`);
      const data = await res.json();
      setPreviousComments(data.comments || []);
    } catch {
      // silent
    }
  };

  const fetchReport = async () => {
    if (!selectedStation || !selectedDate) return;
    setLoading(true);
    setError('');
    setReport(null);
    setFinancialSummary(null);
    try {
      const [dailyRes, financialRes] = await Promise.all([
        fetch(`/api/reports/daily?stationId=${selectedStation}&date=${selectedDate}`),
        fetch(`/api/reports/financial-daily?stationId=${selectedStation}&date=${selectedDate}`),
      ]);
      const [dailyData, financialData] = await Promise.all([
        dailyRes.json(),
        financialRes.json(),
      ]);
      if (!dailyRes.ok) {
        setError(dailyData.error || 'Failed to fetch report');
        return;
      }
      setReport(dailyData);
      setFinancialSummary(financialRes.ok ? (financialData.summary || null) : null);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const submitComment = async () => {
    if (!selectedStation || !selectedDate || !comment.trim()) return;
    setSavingComment(true);
    setCommentStatus('');
    try {
      const res = await fetch('/api/auditor/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId: selectedStation, date: selectedDate, comment }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCommentStatus(data.error || 'Failed to save comment');
        return;
      }
      setComment('');
      setCommentStatus('Comment saved.');
      fetchComments();
    } catch {
      setCommentStatus('An error occurred while saving the comment.');
    } finally {
      setSavingComment(false);
    }
  };

  const stationName = stations.find(s => s._id === selectedStation)?.name || '';
  const s = report?.summary;

  return (
    <>
      {/* Print-only header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold">Daily Audit Report</h1>
        <p className="text-sm">{stationName} — {selectedDate}</p>
      </div>

      <div className="space-y-6">
        {/* Header */}
        <div className="print:hidden flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Daily Report</h1>
            <p className="text-gray-500 mt-1">Select a station and date to generate a report.</p>
          </div>
          {report && (
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
        <Card title="Report Parameters" className="print:hidden">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Station"
              name="station"
              value={selectedStation}
              onChange={e => setSelectedStation(e.target.value)}
              options={stations.map(s => ({ value: s._id, label: `${s.name} (${s.code})` }))}
            />
            <Input
              label="Date"
              type="date"
              name="date"
              value={selectedDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => setSelectedDate(e.target.value)}
            />
            <div className="flex items-end">
              <Button onClick={fetchReport} disabled={loading} className="w-full">
                {loading ? 'Loading…' : 'Generate Report'}
              </Button>
            </div>
          </div>
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}
        </Card>

        {loading && (
          <div className="flex justify-center py-12"><div className="spinner" /></div>
        )}

        {report && !loading && (
          <>
            {/* Status banner */}
            {report.dayShift && (
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
                report.dayShift.status === 'in_progress'
                  ? 'bg-amber-50 border border-amber-200 text-amber-800'
                  : 'bg-green-50 border border-green-200 text-green-800'
              }`}>
                <span className={`w-2 h-2 rounded-full ${report.dayShift.status === 'in_progress' ? 'bg-amber-400' : 'bg-green-500'}`} />
                {report.dayShift.status === 'in_progress'
                  ? 'Day shift still in progress — figures are live and may change.'
                  : `Day ended on ${new Date(report.dayShift.endTime).toLocaleString('en-NG')}`}
              </div>
            )}

            {/* Financial Summary */}
            {financialSummary && (
              <Card title="Financial Summary">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                    <p className="text-xs text-gray-500 mb-1">Total Payments (Inflow)</p>
                    <p className="text-xl font-bold text-emerald-700">₦{fmt(financialSummary.totalPaymentsReceived)}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Cash: ₦{fmt(financialSummary.totalPaymentsCash)} · POS: ₦{fmt(financialSummary.totalPaymentsPos)}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-red-50 border border-red-100">
                    <p className="text-xs text-gray-500 mb-1">Stock Receipts (Outflow)</p>
                    <p className="text-xl font-bold text-red-700">₦{fmt(financialSummary.totalStockCost)}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-xs text-gray-500 mb-1">Net Position</p>
                    <p className={`text-xl font-bold ${financialSummary.netPosition >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      ₦{fmt(financialSummary.netPosition)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Expected sales: ₦{fmt(financialSummary.totalSalesExpected)}</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Sales tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card-modern p-4 text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">PMS Sales</p>
                <p className="text-xl font-bold text-gray-800">{fmt(s.totalSales.PMS.liters)} L</p>
                <p className="text-sm text-gray-600">₦{fmt(s.totalSales.PMS.amount)}</p>
              </div>
              <div className="card-modern p-4 text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">AGO Sales</p>
                <p className="text-xl font-bold text-gray-800">{fmt(s.totalSales.AGO.liters)} L</p>
                <p className="text-sm text-gray-600">₦{fmt(s.totalSales.AGO.amount)}</p>
              </div>
              <div className="card-modern p-4 text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Expected Revenue</p>
                <p className="text-xl font-bold text-gray-800">₦{fmt(s.expectedAmount)}</p>
              </div>
              <div className={`card-modern p-4 text-center ${s.discrepancy < 0 ? 'bg-red-50' : s.discrepancy > 0 ? 'bg-green-50' : ''}`}>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Discrepancy</p>
                <p className={`text-xl font-bold ${s.discrepancy < 0 ? 'text-red-700' : s.discrepancy > 0 ? 'text-green-700' : 'text-gray-800'}`}>
                  {s.discrepancy >= 0 ? '+' : ''}₦{fmt(s.discrepancy)}
                </p>
                <p className="text-xs text-gray-400">collected vs expected</p>
              </div>
            </div>

            {/* Supervisor summary */}
            {report.supervisorSummaries?.length > 0 && (
              <Card title="Supervisor Summary">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-gray-200">
                        <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Supervisor</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide text-right">Litres</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide text-right">Expected</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide text-right">Collected</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide text-right">Paid to Acct</th>
                        <th className="pb-3 font-semibold text-gray-500 text-xs uppercase tracking-wide text-right">Diff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.supervisorSummaries.map((sv, i) => {
                        const diff = sv.totalCollected - sv.totalExpected;
                        return (
                          <tr key={i}>
                            <td className="py-3 pr-4 font-medium text-gray-800">{sv.supervisorName}</td>
                            <td className="py-3 pr-4 text-right text-gray-700">{fmt(sv.totalLiters)} L</td>
                            <td className="py-3 pr-4 text-right text-gray-700">₦{fmt(sv.totalExpected)}</td>
                            <td className="py-3 pr-4 text-right text-gray-700">₦{fmt(sv.totalCollected)}</td>
                            <td className="py-3 pr-4 text-right text-gray-700">₦{fmt(sv.totalPaymentReceived)}</td>
                            <td className={`py-3 text-right font-semibold ${diff < 0 ? 'text-red-600' : diff > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                              {diff >= 0 ? '+' : ''}₦{fmt(diff)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Meter readings */}
            {report.meterReadings?.length > 0 && (
              <Card title="Meter Readings">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-gray-200">
                        <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Pump</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide text-right">Opening</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide text-right">Closing</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide text-right">RTT</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide text-right">Net Litres</th>
                        <th className="pb-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Supervisor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.meterReadings.map((r, i) => {
                        const net = Math.max(0, r.closing - r.opening - r.rtt);
                        return (
                          <tr key={i} className={r.discrepancyFlag ? 'bg-amber-50' : ''}>
                            <td className="py-3 pr-4 font-medium text-gray-800">
                              {r.pumpLabel || r.pumpId}
                              {r.discrepancyFlag && <span className="ml-1 text-amber-600 font-bold">⚠</span>}
                            </td>
                            <td className="py-3 pr-4 text-right text-gray-700">{fmt(r.opening)}</td>
                            <td className="py-3 pr-4 text-right text-gray-700">{fmt(r.closing)}</td>
                            <td className="py-3 pr-4 text-right text-gray-700">{fmt(r.rtt)}</td>
                            <td className="py-3 pr-4 text-right font-semibold text-gray-800">{fmt(net)}</td>
                            <td className="py-3 text-gray-600 text-xs">{r.supervisorName}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Tank stock */}
            {report.tankStockEntries?.length > 0 && (
              <Card title="Tank Stock">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-gray-200">
                        <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Tank</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Period</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide text-right">Stock (L)</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide text-right">Variance</th>
                        <th className="pb-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.tankStockEntries.map((e, i) => (
                        <tr key={i}>
                          <td className="py-3 pr-4 font-medium text-gray-800">
                            {e.tankLabel || e.tankId}
                            <span className={`ml-2 badge ${e.product === 'PMS' ? 'badge-success' : 'badge-info'}`}>
                              {e.product}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`badge ${e.period === 'opening' ? 'badge-info' : 'badge-warning'}`}>
                              {e.period}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-right font-semibold text-gray-800">
                            {fmt(e.closingStockMeasured)}
                          </td>
                          <td className={`py-3 pr-4 text-right font-semibold ${
                            e.variance < 0 ? 'text-red-600' : e.variance > 0 ? 'text-green-600' : 'text-gray-500'
                          }`}>
                            {e.variance >= 0 ? '+' : ''}{fmt(e.variance)}
                          </td>
                          <td className="py-3 text-gray-600 text-xs">{e.supervisorName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Accountant collections */}
            <Card title="Accountant Collections">
              {!report.paymentRecords?.length ? (
                <p className="text-sm text-amber-600">No payment records entered for this day.</p>
              ) : (
                <div className="flex gap-8">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Cash</p>
                    <p className="text-lg font-bold text-gray-800">₦{fmt(s.totalPayments.cash)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">POS</p>
                    <p className="text-lg font-bold text-gray-800">₦{fmt(s.totalPayments.pos)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total</p>
                    <p className="text-lg font-bold text-gray-800">₦{fmt(s.totalPayments.cash + s.totalPayments.pos)}</p>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}

        {/* Audit comment — always visible */}
        {selectedStation && (
          <Card title="Audit Comment" className="print:hidden">
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Leave a comment for {selectedDate}{stationName ? ` — ${stationName}` : ''}.
              </p>
              <textarea
                className="w-full min-h-[100px] rounded-xl border-2 border-slate-200 p-3 text-sm focus:outline-none focus:border-ecana-maroon focus:ring-4 focus:ring-ecana-maroon/10 transition-all resize-none"
                placeholder="Leave your audit comment…"
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
              {commentStatus && (
                <p className={`text-sm ${commentStatus === 'Comment saved.' ? 'text-green-600' : 'text-red-600'}`}>
                  {commentStatus}
                </p>
              )}
              <div className="flex justify-end">
                <Button onClick={submitComment} disabled={savingComment || !comment.trim()}>
                  {savingComment ? 'Saving…' : 'Submit Comment'}
                </Button>
              </div>
            </div>

            {previousComments.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Previous comments for this date</p>
                {previousComments.map(c => (
                  <div key={c._id} className="p-3 bg-slate-50 rounded-lg text-sm">
                    <p className="text-slate-700">{c.comment}</p>
                    <p className="text-xs text-slate-400 mt-1">{new Date(c.createdAt).toLocaleString('en-NG')}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {!report && !loading && !error && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg">Select a station and date, then click Generate Report.</p>
          </div>
        )}
      </div>

      <style>{`
        @media print {
          @page { margin: 1.5cm; }
          body { font-size: 12pt; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </>
  );
}

export default function AuditorDailyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DailyReportContent />
    </Suspense>
  );
}
