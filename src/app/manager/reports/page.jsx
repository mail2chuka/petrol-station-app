'use client';

import { useState, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Loading from '@/components/Loading';

function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
}

function ManagerReportsPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const activeStationId =
    session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReport = async () => {
    if (!activeStationId || !selectedDate) return;
    setLoading(true);
    setError('');
    setReport(null);
    try {
      const res = await fetch(
        `/api/reports/daily?stationId=${activeStationId}&date=${selectedDate}`
      );
      const data = await res.json();
      if (res.ok) {
        setReport(data);
      } else {
        setError(data.error || 'Failed to fetch report');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!activeStationId) {
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

      {/* Date picker */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Date</label>
            <input
              type="date"
              className="input-modern"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
          <button
            onClick={fetchReport}
            disabled={loading}
            className="btn-modern btn-primary px-6 py-3 disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Generate Report'}
          </button>
        </div>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}
      </Card>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="spinner" />
        </div>
      )}

      {report && !loading && (
        <>
          {/* Status banner */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
            isInProgress
              ? 'bg-amber-50 border border-amber-200 text-amber-800'
              : 'bg-green-50 border border-green-200 text-green-800'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isInProgress ? 'bg-amber-400' : 'bg-green-500'}`} />
            {isInProgress
              ? 'This day shift is still in progress — figures are live and may change.'
              : `Day ended on ${new Date(report.dayShift.endTime).toLocaleString('en-NG')}`}
          </div>

          {/* Summary tiles */}
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
            <div className={`card-modern p-4 text-center ${
              s.discrepancy < 0 ? 'bg-red-50' : s.discrepancy > 0 ? 'bg-green-50' : ''
            }`}>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Discrepancy</p>
              <p className={`text-xl font-bold ${
                s.discrepancy < 0 ? 'text-red-700' : s.discrepancy > 0 ? 'text-green-700' : 'text-gray-800'
              }`}>
                {s.discrepancy >= 0 ? '+' : ''}₦{fmt(s.discrepancy)}
              </p>
              <p className="text-xs text-gray-400">collected vs expected</p>
            </div>
          </div>

          {/* Accountant collections */}
          <Card title="Accountant Collections">
            {paymentRecordsEmpty(report) ? (
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
                  <p className="text-lg font-bold text-gray-800">
                    ₦{fmt(s.totalPayments.cash + s.totalPayments.pos)}
                  </p>
                </div>
              </div>
            )}
          </Card>

          {/* Supervisor summary */}
          {report.supervisorSummaries.length > 0 && (
            <Card title="Supervisor Summary">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-gray-200">
                      <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Supervisor</th>
                      <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide text-right">Litres Sold</th>
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
                          <td className={`py-3 text-right font-semibold ${
                            diff < 0 ? 'text-red-600' : diff > 0 ? 'text-green-600' : 'text-gray-500'
                          }`}>
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
          {report.meterReadings.length > 0 && (
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
          {report.tankStockEntries.length > 0 && (
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

          {/* Dispenser assignments */}
          {report.dayShift.dispenserAssignments?.length > 0 && (
            <Card title="Dispenser Assignments">
              <div className="space-y-2">
                {report.dayShift.dispenserAssignments.map((d, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-800">
                        {d.dispenserName}
                        <span className={`ml-2 badge ${d.fuelType === 'PMS' ? 'badge-success' : 'badge-info'}`}>
                          {d.fuelType}
                        </span>
                      </p>
                    </div>
                    <div className="text-right text-sm text-gray-600 space-y-0.5">
                      <p>Opening: {fmt(d.initialReading)} L</p>
                      {d.finalReading != null && (
                        <>
                          <p>Closing: {fmt(d.finalReading)} L</p>
                          <p className="font-semibold text-gray-800">
                            Total: {fmt(d.totalLiters)} L
                          </p>
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
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">Select a date and click Generate Report</p>
        </div>
      )}
    </div>
  );
}

function paymentRecordsEmpty(report) {
  return !report?.paymentRecords?.length;
}

export default function ManagerReportsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ManagerReportsPageContent />
    </Suspense>
  );
}
