'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Select from '@/components/Select';
import Button from '@/components/Button';
import Loading from '@/components/Loading';
import DateCalendar from '@/components/DateCalendar';

function todayStr() { return new Date().toISOString().split('T')[0]; }
function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
}

function FlagPole({ color }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M2 1a.5.5 0 01.5.5v13a.5.5 0 01-1 0v-13A.5.5 0 012 1z" />
      <path d="M2.5 2h10.5l-2.5 3.5 2.5 3.5H2.5z" />
    </svg>
  );
}

function DailyReportContent() {
  const searchParams = useSearchParams();
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(searchParams.get('stationId') || '');
  const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || todayStr());
  const [report, setReport] = useState(null);
  const [financialSummary, setFinancialSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [commentStatus, setCommentStatus] = useState('');
  const [previousComments, setPreviousComments] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [markedDates, setMarkedDates] = useState({});
  const [loadingMonth, setLoadingMonth] = useState(false);

  // Flag modal state
  const [flagModal, setFlagModal] = useState(null);
  const [flagReason, setFlagReason] = useState('');
  const [flagging, setFlagging] = useState(false);
  const [flagError, setFlagError] = useState('');

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

  const fetchMonthMarks = useCallback(async (monthStr, stId) => {
    const sid = stId || selectedStation;
    if (!sid) return;
    setLoadingMonth(true);
    try {
      const res = await fetch(`/api/day-shifts?stationId=${sid}&month=${monthStr}`);
      const data = await res.json();
      if (!res.ok) return;
      const grouped = {};
      for (const shift of data.dayShifts || []) {
        const d = new Date(shift.date).toISOString().split('T')[0];
        grouped[d] = { total: 1, pending: shift.status === 'in_progress' ? 1 : 0 };
      }
      setMarkedDates(grouped);
    } catch {} finally { setLoadingMonth(false); }
  }, [selectedStation]);

  const fetchComments = useCallback(async (stId, date) => {
    const sid = stId || selectedStation;
    if (!sid || !date) return;
    try {
      const res = await fetch(`/api/auditor/comments?stationId=${sid}&date=${date}`);
      const data = await res.json();
      setPreviousComments(data.comments || []);
    } catch {}
  }, [selectedStation]);

  const fetchDeposits = useCallback(async (stId, date) => {
    const sid = stId || selectedStation;
    if (!sid || !date) return;
    try {
      const res = await fetch(`/api/cash-deposits?stationId=${sid}&date=${date}`);
      const data = await res.json();
      setDeposits(res.ok ? (data.cashDeposits || []) : []);
    } catch { setDeposits([]); }
  }, [selectedStation]);

  const fetchReport = useCallback(async (date, stId) => {
    const sid = stId || selectedStation;
    if (!sid || !date) return;
    setLoading(true);
    setError('');
    setReport(null);
    setFinancialSummary(null);
    setDeposits([]);
    try {
      const [dailyRes, financialRes] = await Promise.all([
        fetch(`/api/reports/daily?stationId=${sid}&date=${date}`),
        fetch(`/api/reports/financial-daily?stationId=${sid}&date=${date}`),
      ]);
      const [dailyData, financialData] = await Promise.all([dailyRes.json(), financialRes.json()]);
      if (!dailyRes.ok) { setError(dailyData.error || 'Failed to fetch report'); return; }
      setReport(dailyData);
      setFinancialSummary(financialRes.ok ? (financialData.summary || null) : null);
      fetchDeposits(sid, date);
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  }, [selectedStation]);

  useEffect(() => {
    if (!selectedStation) return;
    setMarkedDates({});
    setReport(null);
    setError('');
    setDeposits([]);
    fetchMonthMarks(currentMonthStr(), selectedStation);
    fetchReport(selectedDate, selectedStation);
    fetchComments(selectedStation, selectedDate);
  }, [selectedStation]);

  const handleDateChange = (date) => {
    setSelectedDate(date);
    fetchReport(date);
    fetchComments(selectedStation, date);
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
      if (!res.ok) { setCommentStatus(data.error || 'Failed to save comment'); return; }
      setComment('');
      setCommentStatus('Comment saved.');
      fetchComments(selectedStation, selectedDate);
    } catch { setCommentStatus('An error occurred while saving the comment.'); }
    finally { setSavingComment(false); }
  };

  const openFlag = (targetType, targetId, targetRef, severity = 'warning') => {
    setFlagModal({ targetType, targetId: targetId || null, targetRef, severity });
    setFlagReason('');
    setFlagError('');
  };

  const submitFlag = async () => {
    if (!flagReason.trim()) { setFlagError('Describe the issue first'); return; }
    setFlagging(true);
    setFlagError('');
    try {
      const res = await fetch('/api/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: selectedStation,
          targetType: flagModal.targetType,
          targetId: flagModal.targetId,
          targetRef: flagModal.targetRef,
          severity: flagModal.severity,
          reason: flagReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFlagError(data.error || 'Failed to raise flag'); return; }
      setFlagModal(null);
      setFlagReason('');
    } catch { setFlagError('Network error'); }
    finally { setFlagging(false); }
  };

  const FlagBtn = ({ targetType, targetId, targetRef }) => (
    <div className="flex items-center gap-0.5 print:hidden">
      <button
        onClick={() => openFlag(targetType, targetId, targetRef, 'warning')}
        title="Raise warning flag"
        className="p-1 rounded hover:bg-amber-50 text-amber-300 hover:text-amber-500 transition-colors"
      >
        <FlagPole />
      </button>
      <button
        onClick={() => openFlag(targetType, targetId, targetRef, 'critical')}
        title="Raise critical flag"
        className="p-1 rounded hover:bg-red-50 text-red-300 hover:text-red-500 transition-colors"
      >
        <FlagPole />
      </button>
    </div>
  );

  const stationName = stations.find(s => s._id === selectedStation)?.name || '';
  const s = report?.summary;

  return (
    <>
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold">Daily Audit Report</h1>
        <p className="text-sm">{stationName} — {selectedDate}</p>
      </div>

      <div className="space-y-6">
        <div className="print:hidden flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Daily Report</h1>
            <p className="text-gray-500 mt-1">Select a station and date to view the report.</p>
          </div>
          {report && (
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all shadow-sm shrink-0">
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
            options={stations.map(s => ({ value: s._id, label: `${s.name} (${s.code})` }))}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
          <div className="space-y-2 print:hidden">
            <DateCalendar
              value={selectedDate}
              onChange={handleDateChange}
              onMonthChange={(m) => fetchMonthMarks(m, selectedStation)}
              markedDates={markedDates}
              maxDate={todayStr()}
            />
            {loadingMonth && <p className="text-xs text-center text-gray-400">Loading month data…</p>}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between print:hidden">
              <h2 className="text-lg font-semibold text-gray-800">
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </h2>
              <button onClick={() => fetchReport(selectedDate)} disabled={loading} className="text-sm text-ecana-maroon hover:underline font-medium disabled:opacity-50">
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm print:hidden">{error}</div>}
            {loading && <div className="flex justify-center py-12 print:hidden"><div className="spinner" /></div>}

            {report && !loading && (
              <>
                {report.dayShift && (
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium print:hidden ${
                    report.dayShift.status === 'in_progress' ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-green-50 border border-green-200 text-green-800'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${report.dayShift.status === 'in_progress' ? 'bg-amber-400' : 'bg-green-500'}`} />
                    {report.dayShift.status === 'in_progress' ? 'Day shift still in progress — figures are live and may change.' : `Day ended on ${new Date(report.dayShift.endTime).toLocaleString('en-NG')}`}
                  </div>
                )}

                {financialSummary && (
                  <Card title="Financial Summary">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                        <p className="text-xs text-gray-500 mb-1">Total Payments (Inflow)</p>
                        <p className="text-xl font-bold text-emerald-700">₦{fmt(financialSummary.totalPaymentsReceived)}</p>
                        <p className="text-xs text-gray-400 mt-1">Cash: ₦{fmt(financialSummary.totalPaymentsCash)} · POS: ₦{fmt(financialSummary.totalPaymentsPos)}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-red-50 border border-red-100">
                        <p className="text-xs text-gray-500 mb-1">Stock Receipts (Outflow)</p>
                        <p className="text-xl font-bold text-red-700">₦{fmt(financialSummary.totalStockCost)}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                        <p className="text-xs text-gray-500 mb-1">Net Position</p>
                        <p className={`text-xl font-bold ${financialSummary.netPosition >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>₦{fmt(financialSummary.netPosition)}</p>
                        <p className="text-xs text-gray-400 mt-1">Expected sales: ₦{fmt(financialSummary.totalSalesExpected)}</p>
                      </div>
                    </div>
                  </Card>
                )}

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

                {report.supervisorSummaries?.length > 0 && (
                  <Card title="Supervisor Summary">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left border-b border-gray-200">
                            {['Supervisor', 'Litres (L)', 'Expected (₦)', 'Collected (₦)', 'Paid to Acct (₦)', 'Diff (₦)', ''].map((h, i) => (
                              <th key={i} className={`pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide ${i > 0 && i < 6 ? 'text-right' : ''}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {report.supervisorSummaries.map((sv, i) => {
                            const diff = sv.totalCollected - sv.totalExpected;
                            return (
                              <tr key={i}>
                                <td className="py-3 pr-4 font-medium text-gray-800">{sv.supervisorName}</td>
                                <td className="py-3 pr-4 text-right text-gray-700">{fmt(sv.totalLiters)}</td>
                                <td className="py-3 pr-4 text-right text-gray-700">{fmt(sv.totalExpected)}</td>
                                <td className="py-3 pr-4 text-right text-gray-700">{fmt(sv.totalCollected)}</td>
                                <td className="py-3 pr-4 text-right text-gray-700">{fmt(sv.totalPaymentReceived)}</td>
                                <td className={`py-3 pr-4 text-right font-semibold ${diff < 0 ? 'text-red-600' : diff > 0 ? 'text-green-600' : 'text-gray-500'}`}>{diff >= 0 ? '+' : ''}{fmt(diff)}</td>
                                <td className="py-3">
                                  <FlagBtn targetType="payment" targetId={null} targetRef={`${sv.supervisorName} — ${selectedDate}`} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}

                {report.meterReadings?.length > 0 && (
                  <Card title="Meter Readings">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left border-b border-gray-200">
                            {['Pump', 'Opening', 'Closing', 'RTT', 'Net Litres', 'Supervisor', ''].map((h, i) => (
                              <th key={i} className={`pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide ${i > 0 && i < 5 ? 'text-right' : ''}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {report.meterReadings.map((r, i) => {
                            const net = Math.max(0, r.closing - r.opening - r.rtt);
                            return (
                              <tr key={i} className={r.discrepancyFlag ? 'bg-amber-50' : ''}>
                                <td className="py-3 pr-4 font-medium text-gray-800">{r.pumpLabel || r.pumpId}{r.discrepancyFlag && <span className="ml-1 text-amber-600">⚠</span>}</td>
                                <td className="py-3 pr-4 text-right text-gray-700">{fmt(r.opening)}</td>
                                <td className="py-3 pr-4 text-right text-gray-700">{fmt(r.closing)}</td>
                                <td className="py-3 pr-4 text-right text-gray-700">{fmt(r.rtt)}</td>
                                <td className="py-3 pr-4 text-right font-semibold text-gray-800">{fmt(net)}</td>
                                <td className="py-3 pr-4 text-gray-600 text-xs">{r.supervisorName}</td>
                                <td className="py-3">
                                  <FlagBtn targetType="meter_reading" targetId={r._id} targetRef={`Pump: ${r.pumpLabel || r.pumpId} — ${selectedDate}`} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}

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
                            <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">By</th>
                            <th className="pb-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {report.tankStockEntries.map((e, i) => (
                            <tr key={i}>
                              <td className="py-3 pr-4 font-medium text-gray-800">{e.tankLabel || e.tankId}<span className={`ml-2 badge ${e.product === 'PMS' ? 'badge-success' : 'badge-info'}`}>{e.product}</span></td>
                              <td className="py-3 pr-4"><span className={`badge ${e.period === 'opening' ? 'badge-info' : 'badge-warning'}`}>{e.period}</span></td>
                              <td className="py-3 pr-4 text-right font-semibold text-gray-800">{fmt(e.closingStockMeasured)}</td>
                              <td className={`py-3 pr-4 text-right font-semibold ${e.variance < 0 ? 'text-red-600' : e.variance > 0 ? 'text-green-600' : 'text-gray-500'}`}>{e.variance >= 0 ? '+' : ''}{fmt(e.variance)}</td>
                              <td className="py-3 pr-4 text-gray-600 text-xs">{e.supervisorName}</td>
                              <td className="py-3">
                                <FlagBtn targetType="tank_stock" targetId={e._id} targetRef={`${e.tankLabel || e.tankId} ${e.period} — ${selectedDate}`} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}

                <Card title="Accountant Collections">
                  {!report.paymentRecords?.length ? (
                    <p className="text-sm text-amber-600">No payment records entered for this day.</p>
                  ) : (
                    <div className="flex gap-8">
                      <div><p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Cash</p><p className="text-lg font-bold text-gray-800">₦{fmt(s.totalPayments.cash)}</p></div>
                      <div><p className="text-xs text-gray-500 uppercase tracking-wide mb-1">POS</p><p className="text-lg font-bold text-gray-800">₦{fmt(s.totalPayments.pos)}</p></div>
                      <div><p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total</p><p className="text-lg font-bold text-gray-800">₦{fmt(s.totalPayments.cash + s.totalPayments.pos)}</p></div>
                    </div>
                  )}
                </Card>

                <Card title="Bank Deposits">
                  {deposits.length === 0 ? (
                    <p className="text-sm text-amber-600">No bank deposits recorded for this day.</p>
                  ) : (
                    <div className="space-y-3">
                      {deposits.map(dep => (
                        <div key={dep._id} className="flex items-center justify-between gap-4 p-3 rounded-lg bg-gray-50 border border-gray-100">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-800">₦{fmt(dep.amount)}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{dep.bankName}{dep.bankBranch ? ` — ${dep.bankBranch}` : ''} · Acct: {dep.accountNumber}</p>
                            <p className="text-xs text-gray-400 mt-0.5">by {dep.initiatedByAccountantName}</p>
                          </div>
                          <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                            dep.status === 'approved' ? 'bg-green-100 text-green-700' :
                            dep.status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {dep.status.charAt(0).toUpperCase() + dep.status.slice(1)}
                          </span>
                          <FlagBtn targetType="payment" targetId={dep._id} targetRef={`Deposit ₦${fmt(dep.amount)} — ${dep.bankName}`} />
                        </div>
                      ))}
                      <div className="pt-2 border-t border-gray-100 flex justify-between text-sm font-semibold text-gray-700">
                        <span>Total deposited</span>
                        <span>₦{fmt(deposits.reduce((sum, d) => sum + d.amount, 0))}</span>
                      </div>
                    </div>
                  )}
                </Card>
              </>
            )}

            {!report && !loading && !error && (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 print:hidden">
                <svg className="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-base font-medium">Select a marked day to view the report</p>
              </div>
            )}

            {selectedStation && (
              <Card title="Audit Comment" className="print:hidden">
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">
                    Leave a comment for {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}{stationName ? ` — ${stationName}` : ''}.
                  </p>
                  <textarea
                    className="w-full min-h-[100px] rounded-xl border-2 border-slate-200 p-3 text-sm focus:outline-none focus:border-ecana-maroon focus:ring-4 focus:ring-ecana-maroon/10 transition-all resize-none"
                    placeholder="Leave your audit comment…"
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                  />
                  {commentStatus && (
                    <p className={`text-sm ${commentStatus === 'Comment saved.' ? 'text-green-600' : 'text-red-600'}`}>{commentStatus}</p>
                  )}
                  <div className="flex justify-end">
                    <Button onClick={submitComment} disabled={savingComment || !comment.trim()}>
                      {savingComment ? 'Saving…' : 'Submit Comment'}
                    </Button>
                  </div>
                </div>
                {previousComments.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Comments for this date</p>
                    {previousComments.map(c => (
                      <div key={c._id} className="p-3 bg-slate-50 rounded-lg text-sm">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="font-medium text-slate-700">{c.auditorName}</p>
                          <p className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleString('en-NG')}</p>
                        </div>
                        <p className="text-slate-700">{c.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Flag modal */}
      {flagModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div>
              <h3 className="font-bold text-lg text-gray-900">Raise Flag</h3>
              {flagModal.targetRef && <p className="text-sm text-gray-500 mt-1">{flagModal.targetRef}</p>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFlagModal(prev => ({ ...prev, severity: 'warning' }))}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${flagModal.severity === 'warning' ? 'bg-amber-50 border-amber-400 text-amber-700' : 'border-gray-200 text-gray-500 hover:border-amber-200'}`}
              >
                ⚑ Warning
              </button>
              <button
                onClick={() => setFlagModal(prev => ({ ...prev, severity: 'critical' }))}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${flagModal.severity === 'critical' ? 'bg-red-50 border-red-400 text-red-700' : 'border-gray-200 text-gray-500 hover:border-red-200'}`}
              >
                ⚑ Critical
              </button>
            </div>
            <textarea
              className="w-full min-h-[90px] rounded-xl border-2 border-slate-200 p-3 text-sm focus:outline-none focus:border-ecana-maroon focus:ring-4 focus:ring-ecana-maroon/10 resize-none"
              placeholder="Describe the issue…"
              value={flagReason}
              onChange={e => setFlagReason(e.target.value)}
            />
            {flagError && <p className="text-sm text-red-600">{flagError}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setFlagModal(null); setFlagReason(''); setFlagError(''); }}
                className="px-4 py-2 text-sm rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={submitFlag}
                disabled={flagging || !flagReason.trim()}
                className={`px-4 py-2 text-sm rounded-xl font-semibold text-white transition-all disabled:opacity-50 ${flagModal.severity === 'critical' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}
              >
                {flagging ? 'Raising…' : 'Raise Flag'}
              </button>
            </div>
          </div>
        </div>
      )}

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
