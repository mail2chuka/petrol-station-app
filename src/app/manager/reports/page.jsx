'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Loading from '@/components/Loading';
import ReportPeriodList from '@/components/ReportPeriodList';

function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
}

const PRODUCT_LABELS = { PMS: 'PMS (Petrol)', AGO: 'AGO (Diesel)', DPK: 'DPK (Kerosene)', LPG: 'LPG (Gas)' };

// ── Day detail content (manager perspective) ──────────────────────────────────
function ManagerDayDetail({ report, loading, station }) {
  const [selectedProduct, setSelectedProduct] = useState('');
  if (loading) return <div className="flex justify-center py-16"><div className="spinner" /></div>;

  if (!report) return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <p className="text-base font-medium">No day shift found for this date.</p>
    </div>
  );

  const s = report.summary;
  const isInProgress = report.dayShift?.status === 'in_progress';

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
        isInProgress
          ? 'bg-amber-50 border border-amber-200 text-amber-800'
          : 'bg-green-50 border border-green-200 text-green-800'
      }`}>
        <span className={`w-2 h-2 rounded-full ${isInProgress ? 'bg-amber-400' : 'bg-green-500'}`} />
        {isInProgress
          ? 'Day shift still in progress — figures may change.'
          : `Day ended on ${new Date(report.dayShift.endTime).toLocaleString('en-NG')}`}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(s.totalSales)
          .filter(([, v]) => v.liters > 0 || v.amount > 0)
          .map(([fuel, v]) => (
            <div key={fuel} className="card-modern p-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{fuel} Sales</p>
              <p className="text-xl font-bold text-gray-800">{fmt(v.liters)} L</p>
              <p className="text-sm text-gray-600">₦{fmt(v.amount)}</p>
            </div>
          ))}
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

      {/* Product Stock */}
      {station && (
        <Card title="Product Stock">
          <div className="flex items-center gap-4 flex-wrap">
            <select
              value={selectedProduct}
              onChange={e => setSelectedProduct(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-ecana-maroon bg-white"
            >
              <option value="">Select product…</option>
              {(station.availableProducts || ['PMS', 'AGO']).map(p => (
                <option key={p} value={p}>{PRODUCT_LABELS[p] || p}</option>
              ))}
            </select>
            {selectedProduct && (
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-gray-600">{selectedProduct} Stock:</span>
                <span className="text-2xl font-black text-gray-900">
                  {(station.currentStock?.[selectedProduct] ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 1 })}L
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Cashier collections summary */}
      <Card title="Cashier Collections">
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

      {/* Supervisor summary */}
      {report.supervisorSummaries?.length > 0 && (
        <Card title="Supervisor Summary">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200">
                  {['Supervisor', 'Volume Sold', 'Expected', 'Cash Recv.', 'POS Recv.', 'Total Recv.'].map((h, i) => (
                    <th key={h} className={`pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide ${i > 0 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.supervisorSummaries.map((sv, i) => (
                  <tr key={i}>
                    <td className="py-3 pr-4 font-medium text-gray-800">{sv.supervisorName}</td>
                    <td className="py-3 pr-4 text-right text-gray-700">{fmt(sv.totalLiters)} L</td>
                    <td className="py-3 pr-4 text-right text-gray-700">₦{fmt(sv.totalExpected)}</td>
                    <td className="py-3 pr-4 text-right text-gray-700">₦{fmt(sv.totalCash)}</td>
                    <td className="py-3 pr-4 text-right text-gray-700">₦{fmt(sv.totalPos)}</td>
                    <td className="py-3 text-right font-semibold text-gray-800">₦{fmt(sv.totalPaymentReceived)}</td>
                  </tr>
                ))}
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
                  {['Pump', 'Opening', 'Closing', 'RTT', 'Volume Sold', 'Supervisor'].map((h, i) => (
                    <th key={h} className={`pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide ${i > 0 && i < 5 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.meterReadings.map((r, i) => {
                  const net = r.closing != null ? Math.max(0, r.closing - r.opening - (r.rtt || 0)) : null;
                  return (
                    <tr key={i} className={r.discrepancyFlag ? 'bg-amber-50' : ''}>
                      <td className="py-3 pr-4 font-medium text-gray-800">
                        {r.pumpLabel || r.pumpId}
                        {r.discrepancyFlag && <span className="ml-1 text-amber-600 font-bold">⚠</span>}
                      </td>
                      <td className="py-3 pr-4 text-right text-gray-700">{fmt(r.opening)}</td>
                      <td className="py-3 pr-4 text-right text-gray-700">{r.closing != null ? fmt(r.closing) : '—'}</td>
                      <td className="py-3 pr-4 text-right text-gray-700">{fmt(r.rtt ?? 0)}</td>
                      <td className="py-3 pr-4 text-right font-semibold text-gray-800">{net != null ? fmt(net) : '—'}</td>
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

      {/* Dispenser assignments */}
      {report.dayShift.dispenserAssignments?.length > 0 && (
        <Card title="Dispenser Assignments">
          <div className="space-y-2">
            {report.dayShift.dispenserAssignments.map((d, i) => (
              <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-800">
                    {d.dispenserName}
                    <span className={`ml-2 badge ${d.fuelType === 'PMS' ? 'badge-success' : 'badge-info'}`}>{d.fuelType}</span>
                  </p>
                  {d.supervisorName && <p className="text-xs text-gray-500 mt-0.5">{d.supervisorName}</p>}
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
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function ManagerReportsPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const stationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;

  const [view, setView] = useState('list');
  const [detailDate, setDetailDate] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [station, setStation] = useState(null);

  useEffect(() => {
    if (!stationId) return;
    fetch('/api/stations')
      .then(r => r.json())
      .then(d => {
        const found = (d.stations || []).find(s => s._id === stationId);
        if (found) setStation(found);
      })
      .catch(() => {});
  }, [stationId]);

  // Reset when station changes
  useEffect(() => {
    setView('list');
    setReport(null);
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

  const openDay = useCallback((dateStr) => {
    setDetailDate(dateStr);
    setView('detail');
    fetchReport(dateStr);
  }, [fetchReport]);

  const backToList = () => {
    setView('list');
    setReport(null);
    setError('');
  };

  const detailLabel = detailDate
    ? new Date(detailDate + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  if (!stationId) {
    return (
      <Card title="Select Station">
        <p className="text-sm text-gray-600">Choose a station from the Admin Stations page to manage.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Reports</h1>

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <ReportPeriodList stationId={stationId} onSelectDay={openDay} />
      )}

      {/* ── DETAIL VIEW ── */}
      {view === 'detail' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={backToList}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-ecana-maroon font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to list
              </button>
              <span className="text-gray-300">|</span>
              <h2 className="text-lg font-semibold text-gray-800">{detailLabel}</h2>
            </div>
            <button
              onClick={() => fetchReport(detailDate)}
              disabled={loading}
              className="text-sm text-ecana-maroon hover:underline font-medium disabled:opacity-50 print:hidden"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
          )}

          <ManagerDayDetail report={report} loading={loading} station={station} />
        </div>
      )}
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
