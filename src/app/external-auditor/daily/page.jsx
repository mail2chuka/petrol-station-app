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
      const [dailyData, financialData] = await Promise.all([dailyRes.json(), financialRes.json()]);
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

  const stationName = stations.find(s => s._id === selectedStation)?.name || '';
  const stationCode = stations.find(s => s._id === selectedStation)?.code || '';
  const s = report?.summary;

  return (
    <>
      {/* Print header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold">External Audit — Daily Report</h1>
        <p className="text-sm">{stationName} ({stationCode}) — {selectedDate}</p>
        <p className="text-xs text-gray-500 mt-1">Generated: {new Date().toLocaleString('en-NG')}</p>
      </div>

      <div className="space-y-6">
        {/* Header */}
        <div className="print:hidden flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Daily Report</h1>
            <p className="text-gray-500 mt-1">Read-only view of daily station data.</p>
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
        <Card title="Select Station & Date" className="print:hidden">
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

        {loading && <div className="flex justify-center py-12"><div className="spinner" /></div>}

        {report && !loading && (
          <>
            {/* Status */}
            {report.dayShift && (
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
                report.dayShift.status === 'in_progress'
                  ? 'bg-amber-50 border border-amber-200 text-amber-800'
                  : 'bg-green-50 border border-green-200 text-green-800'
              }`}>
                <span className={`w-2 h-2 rounded-full ${report.dayShift.status === 'in_progress' ? 'bg-amber-400' : 'bg-green-500'}`} />
                {report.dayShift.status === 'in_progress'
                  ? 'Shift still in progress — figures may change.'
                  : `Shift ended: ${new Date(report.dayShift.endTime).toLocaleString('en-NG')}`}
              </div>
            )}

            {/* Financial summary */}
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
              {[
                { label: 'PMS Sales', main: `${fmt(s.totalSales.PMS.liters)} L`, sub: `₦${fmt(s.totalSales.PMS.amount)}` },
                { label: 'AGO Sales', main: `${fmt(s.totalSales.AGO.liters)} L`, sub: `₦${fmt(s.totalSales.AGO.amount)}` },
                { label: 'Expected Revenue', main: `₦${fmt(s.expectedAmount)}` },
                {
                  label: 'Discrepancy',
                  main: `${s.discrepancy >= 0 ? '+' : ''}₦${fmt(s.discrepancy)}`,
                  highlight: s.discrepancy !== 0,
                  negative: s.discrepancy < 0,
                },
              ].map(tile => (
                <div key={tile.label} className={`card-modern p-4 text-center ${tile.highlight ? (tile.negative ? 'bg-red-50' : 'bg-green-50') : ''}`}>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{tile.label}</p>
                  <p className={`text-xl font-bold ${tile.highlight ? (tile.negative ? 'text-red-700' : 'text-green-700') : 'text-gray-800'}`}>
                    {tile.main}
                  </p>
                  {tile.sub && <p className="text-sm text-gray-600">{tile.sub}</p>}
                </div>
              ))}
            </div>

            {/* Supervisor summary */}
            {report.supervisorSummaries?.length > 0 && (
              <Card title="Supervisor Summary">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-gray-200">
                        {['Supervisor', 'Litres', 'Expected', 'Collected', 'Paid to Acct', 'Diff'].map(h => (
                          <th key={h} className={`pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide ${h !== 'Supervisor' ? 'text-right' : ''}`}>{h}</th>
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

            {/* Meter readings */}
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
                            <span className={`ml-2 badge ${e.product === 'PMS' ? 'badge-success' : 'badge-info'}`}>{e.product}</span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`badge ${e.period === 'opening' ? 'badge-info' : 'badge-warning'}`}>{e.period}</span>
                          </td>
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

export default function ExternalAuditorDailyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DailyReportContent />
    </Suspense>
  );
}
