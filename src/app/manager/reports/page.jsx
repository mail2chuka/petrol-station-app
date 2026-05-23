'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
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

function ManagerReportsPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const stationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [markedDates, setMarkedDates] = useState({});
  const [loadingMonth, setLoadingMonth] = useState(false);

  const fetchMonthMarks = useCallback(async (monthStr) => {
    if (!stationId) return;
    setLoadingMonth(true);
    try {
      const res = await fetch(`/api/day-shifts?stationId=${stationId}&month=${monthStr}`);
      const data = await res.json();
      if (!res.ok) return;
      const grouped = {};
      for (const shift of data.dayShifts || []) {
        const d = new Date(shift.date).toISOString().split('T')[0];
        grouped[d] = { total: 1, pending: shift.status === 'in_progress' ? 1 : 0 };
      }
      setMarkedDates(grouped);
    } catch {} finally { setLoadingMonth(false); }
  }, [stationId]);

  const fetchReport = useCallback(async (date) => {
    if (!stationId || !date) return;
    setLoading(true);
    setError('');
    setReport(null);
    try {
      const res = await fetch(`/api/reports/daily?stationId=${stationId}&date=${date}`);
      const data = await res.json();
      if (res.ok) setReport(data);
      else setError(data.error || 'Failed to fetch report');
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  }, [stationId]);

  useEffect(() => {
    if (!stationId) return;
    fetchMonthMarks(currentMonthStr());
    fetchReport(todayStr());
  }, [stationId, fetchMonthMarks, fetchReport]);

  const handleDateChange = (date) => {
    setSelectedDate(date);
    fetchReport(date);
  };

  const selectedLabel = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  if (!stationId) {
    return (
      <Card title="Select Station">
        <p className="text-sm text-gray-600">Choose a station from the Admin Stations page to manage.</p>
      </Card>
    );
  }

  const s = report?.summary;
  const isInProgress = report?.dayShift?.status === 'in_progress';

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Daily Report</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
        {/* Calendar */}
        <div className="space-y-2 print:hidden">
          <DateCalendar
            value={selectedDate}
            onChange={handleDateChange}
            onMonthChange={fetchMonthMarks}
            markedDates={markedDates}
            maxDate={todayStr()}
          />
          {loadingMonth && <p className="text-xs text-center text-gray-400">Loading month data…</p>}
        </div>

        {/* Report panel */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">{selectedLabel}</h2>
              {report && <p className="text-sm text-gray-500 mt-0.5">{isInProgress ? 'In Progress' : 'Completed'}</p>}
            </div>
            <button
              onClick={() => fetchReport(selectedDate)}
              disabled={loading}
              className="text-sm text-ecana-maroon hover:underline font-medium disabled:opacity-50 print:hidden"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
          )}

          {loading && <div className="flex justify-center py-12"><div className="spinner" /></div>}

          {report && !loading && (
            <>
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
                isInProgress ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-green-50 border border-green-200 text-green-800'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isInProgress ? 'bg-amber-400' : 'bg-green-500'}`} />
                {isInProgress
                  ? 'Day shift still in progress — figures may change.'
                  : `Day ended on ${new Date(report.dayShift.endTime).toLocaleString('en-NG')}`}
              </div>

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

              {report.supervisorSummaries?.length > 0 && (
                <Card title="Supervisor Summary">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b border-gray-200">
                          {['Supervisor', 'Litres Sold', 'Expected', 'Collected', 'Paid to Acct', 'Diff'].map((h, i) => (
                            <th key={h} className={`pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide ${i > 0 ? 'text-right' : ''}`}>{h}</th>
                          ))}
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

              {report.meterReadings?.length > 0 && (
                <Card title="Meter Readings">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b border-gray-200">
                          {['Pump', 'Opening', 'Closing', 'RTT', 'Net Litres', 'Supervisor'].map((h, i) => (
                            <th key={h} className={`pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide ${i > 0 && i < 5 ? 'text-right' : ''}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {report.meterReadings.map((r, i) => {
                          const net = Math.max(0, r.closing - r.opening - r.rtt);
                          return (
                            <tr key={i} className={r.discrepancyFlag ? 'bg-amber-50' : ''}>
                              <td className="py-3 pr-4 font-medium text-gray-800">{r.pumpLabel || r.pumpId}{r.discrepancyFlag && <span className="ml-1 text-amber-600 font-bold">⚠</span>}</td>
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
                              <span className={`ml-2 badge ${e.product === 'PMS' ? 'badge-success' : 'badge-info'}`}>{e.product}</span>
                            </td>
                            <td className="py-3 pr-4"><span className={`badge ${e.period === 'opening' ? 'badge-info' : 'badge-warning'}`}>{e.period}</span></td>
                            <td className="py-3 pr-4 text-right font-semibold text-gray-800">{fmt(e.closingStockMeasured)}</td>
                            <td className={`py-3 pr-4 text-right font-semibold ${e.variance < 0 ? 'text-red-600' : e.variance > 0 ? 'text-green-600' : 'text-gray-500'}`}>
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

              {report.dayShift.dispenserAssignments?.length > 0 && (
                <Card title="Dispenser Assignments">
                  <div className="space-y-2">
                    {report.dayShift.dispenserAssignments.map((d, i) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-800">{d.dispenserName}<span className={`ml-2 badge ${d.fuelType === 'PMS' ? 'badge-success' : 'badge-info'}`}>{d.fuelType}</span></p>
                        </div>
                        <div className="text-right text-sm text-gray-600 space-y-0.5">
                          <p>Opening: {fmt(d.initialReading)} L</p>
                          {d.finalReading != null && (
                            <>
                              <p>Closing: {fmt(d.finalReading)} L</p>
                              <p className="font-semibold text-gray-800">Total: {fmt(d.totalLiters)} L</p>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}

          {!report && !loading && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <svg className="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-base font-medium">No report for this date</p>
              <p className="text-sm mt-1">Select a marked day on the calendar to view the report</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ManagerReportsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ManagerReportsPageContent />
    </Suspense>
  );
}
