'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/Card';
import Select from '@/components/Select';
import ReportPeriodList from '@/components/ReportPeriodList';

function fmtN(n) {
  return `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d) {
  return new Date(d).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

const STATUS_PILL = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  queried:  'bg-red-100 text-red-700',
  rejected: 'bg-red-100 text-red-700',
  query:    'bg-red-100 text-red-700',
};

function Pill({ status }) {
  const label = status === 'query' ? 'queried' : status;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_PILL[status] || 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500 shrink-0">{label}</dt>
      <dd className="text-gray-900 text-right">{value}</dd>
    </div>
  );
}

// ── Detail modal for clicking table rows ──────────────────────────────────────
function DetailModal({ item, onClose }) {
  if (!item) return null;

  let title = '';
  let body = null;

  if (item.type === 'assignment') {
    const d = item.data;
    title = `Pump: ${d.dispenserName}`;
    body = (
      <dl className="space-y-2 text-sm">
        <Row label="Fuel Type" value={d.fuelType} />
        <Row label="Supervisor" value={d.supervisorName || '—'} />
        <Row label="Tank" value={d.tankLabel || '—'} />
        <Row label="Price at Start" value={fmtN(d.priceAtStart)} />
        <Row label="Initial Reading" value={d.initialReading != null ? `${d.initialReading} L` : '—'} />
        <Row label="Final Reading" value={d.finalReading != null ? `${d.finalReading} L` : '—'} />
        <Row label="Total Liters" value={d.totalLiters != null ? `${Number(d.totalLiters).toFixed(2)} L` : '—'} />
      </dl>
    );
  }

  if (item.type === 'sale') {
    const d = item.data;
    title = `Sale — ${d.dispenserName}`;
    body = (
      <dl className="space-y-2 text-sm">
        <Row label="Pump" value={d.dispenserName} />
        <Row label="Fuel Type" value={d.fuelType} />
        <Row label="Supervisor" value={d.supervisorName} />
        <Row label="Liters Sold" value={`${Number(d.liters).toFixed(2)} L`} />
        <Row label="Price / Liter" value={fmtN(d.pricePerLiter)} />
        <Row label="Expected Amount" value={fmtN(d.expectedAmount)} />
        <Row label="Time Entered" value={fmtDate(d.createdAt)} />
      </dl>
    );
  }

  if (item.type === 'reading') {
    const d = item.data;
    title = `Meter Reading — ${d.pumpLabel || d.pumpId}`;
    body = (
      <dl className="space-y-2 text-sm">
        <Row label="Pump" value={d.pumpLabel || d.pumpId} />
        <Row label="Supervisor" value={d.supervisorName} />
        <Row label="Opening Reading" value={`${d.opening} L`} />
        <Row label="Closing Reading" value={d.closing != null ? `${d.closing} L` : '—'} />
        <Row label="RTT" value={`${d.rtt ?? 0} L`} />
        <Row label="Net Sold" value={
          d.closing != null
            ? `${Math.max(0, d.closing - d.opening - (d.rtt || 0)).toFixed(2)} L`
            : '—'
        } />
        {d.discrepancyFlag && (
          <Row label="Discrepancy" value={
            <span className="text-amber-700 font-medium">⚠ {d.discrepancyComment || 'Flagged'}</span>
          } />
        )}
        <Row label="Review Status" value={<Pill status={d.managerReviewStatus || 'pending'} />} />
        {d.managerReviewNote && <Row label="Review Note" value={d.managerReviewNote} />}
        {d.reviewedByManagerName && <Row label="Reviewed By" value={d.reviewedByManagerName} />}
        <Row label="Previous Closing" value={d.previousDayClosing != null ? `${d.previousDayClosing} L` : '—'} />
      </dl>
    );
  }

  if (item.type === 'payment') {
    const d = item.data;
    title = `Collection — ${d.dispenserName || d.supervisorName}`;
    body = (
      <dl className="space-y-2 text-sm">
        <Row label="Pump" value={d.dispenserName || '—'} />
        <Row label="Fuel Type" value={d.fuelType || '—'} />
        <Row label="Supervisor" value={d.supervisorName || '—'} />
        <Row label="Cash Received" value={fmtN(d.cashReceived)} />
        <Row label="POS Total" value={fmtN(d.posReceived)} />
        <Row label="Total Received" value={<span className="font-bold">{fmtN(d.totalReceived)}</span>} />
        {(d.posEntries || []).length > 0 && (
          <div className="pt-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">POS Breakdown</p>
            {d.posEntries.map((pe, i) => (
              <div key={i} className="flex justify-between text-gray-600 text-xs py-0.5">
                <span>{pe.bank}{pe.terminalId ? ` (${pe.terminalId})` : ''}</span>
                <span>{fmtN(pe.amount)}</span>
              </div>
            ))}
          </div>
        )}
        {d.notes && <Row label="Notes" value={<em className="text-gray-500">{d.notes}</em>} />}
        <Row label="Recorded By" value={d.recordedByName} />
        <Row label="Review Status" value={<Pill status={d.managerReviewStatus || 'pending'} />} />
        {d.managerReviewNote && <Row label="Review Note" value={d.managerReviewNote} />}
        <Row label="Time" value={fmtDate(d.createdAt)} />
      </dl>
    );
  }

  if (item.type === 'deposit') {
    const d = item.data;
    title = `Bank Deposit — ${fmtN(d.amount)}`;
    body = (
      <dl className="space-y-2 text-sm">
        <Row label="Amount" value={<span className="font-bold">{fmtN(d.amount)}</span>} />
        <Row label="Bank" value={d.bankName} />
        <Row label="Branch" value={d.bankBranch || '—'} />
        <Row label="Account No." value={d.accountNumber || '—'} />
        <Row label="Deposited By" value={d.initiatedByCashierName} />
        <Row label="Date" value={fmtDate(d.date)} />
        <Row label="Status" value={<Pill status={d.status} />} />
        {d.adminNote && <Row label="Admin Note" value={d.adminNote} />}
        {d.approvedByAdminName && <Row label="Reviewed By" value={d.approvedByAdminName} />}
      </dl>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 pr-4">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}

function ClickRow({ children, onClick }) {
  return (
    <tr onClick={onClick} className="hover:bg-blue-50 cursor-pointer transition-colors">
      {children}
    </tr>
  );
}
function TD({ children, className = '' }) {
  return <td className={`px-4 py-2.5 text-sm text-gray-700 ${className}`}>{children}</td>;
}
function TH({ children }) {
  return <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left bg-gray-50">{children}</th>;
}

// ── Day Detail View (4-section) ───────────────────────────────────────────────
function DayDetail({ report, deposits, detailDate, setDetailItem, loading }) {
  const [activeSection, setActiveSection] = useState('supervisor');
  const [supervisorSubTab, setSupervisorSubTab] = useState('sales');
  const [cashierSubTab, setCashierSubTab] = useState('collections');

  const s = report?.summary;

  const depositsForDate = deposits.filter(dep => {
    return new Date(dep.date).toISOString().split('T')[0] === detailDate;
  });

  const sections = [
    { key: 'manager', label: 'Manager Inputs' },
    { key: 'supervisor', label: 'Supervisor Inputs' },
    { key: 'cashier', label: 'Cashier Inputs' },
  ];

  if (loading) return <div className="flex justify-center py-16"><div className="spinner" /></div>;

  if (!report) return (
    <div className="text-center py-16 text-gray-400">
      <p className="text-base font-medium">No day shift found for this date.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(s.totalSales).filter(([, v]) => v.liters > 0 || v.amount > 0).map(([fuel, v]) => (
          <Card key={fuel}>
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">{fuel} Sales</p>
              <p className="text-xl font-bold text-ecana-maroon">{v.liters.toFixed(1)} L</p>
              <p className="text-xs text-gray-500">{fmtN(v.amount)}</p>
            </div>
          </Card>
        ))}
        <Card>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">Cash</p>
            <p className="text-xl font-bold text-gray-900">{fmtN(s.totalPayments.cash)}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">POS</p>
            <p className="text-xl font-bold text-gray-900">{fmtN(s.totalPayments.pos)}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">Expected</p>
            <p className="text-xl font-bold text-gray-900">{fmtN(s.expectedAmount)}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">Discrepancy</p>
            <p className={`text-xl font-bold ${s.discrepancy > 0 ? 'text-green-600' : s.discrepancy < 0 ? 'text-red-600' : 'text-gray-600'}`}>
              {s.discrepancy >= 0 ? '+' : ''}{fmtN(s.discrepancy)}
            </p>
          </div>
        </Card>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {sections.map(sec => (
          <button
            key={sec.key}
            onClick={() => setActiveSection(sec.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeSection === sec.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {sec.label}
          </button>
        ))}
      </div>

      {/* ── MANAGER INPUTS ── */}
      {activeSection === 'manager' && (
        <div className="space-y-4">
          <Card title="Day Shift Info">
            <dl className="space-y-2 text-sm">
              <Row label="Status" value={<Pill status={report.dayShift.status === 'in_progress' ? 'pending' : 'approved'} />} />
              <Row label="Started By" value={report.dayShift.startedByName || '—'} />
              <Row label="Start Time" value={report.dayShift.startTime ? fmtDate(report.dayShift.startTime) : '—'} />
              {report.dayShift.endTime && <Row label="End Time" value={fmtDate(report.dayShift.endTime)} />}
              {report.dayShift.endedByName && <Row label="Ended By" value={report.dayShift.endedByName} />}
            </dl>
          </Card>

          {report.dayShift.pricesAtStart && Object.keys(report.dayShift.pricesAtStart).length > 0 && (
            <Card title="Prices at Day Start">
              <dl className="space-y-2 text-sm">
                {Object.entries(report.dayShift.pricesAtStart).map(([fuel, price]) => (
                  <Row key={fuel} label={fuel} value={`${fmtN(price)} / L`} />
                ))}
              </dl>
            </Card>
          )}

          <Card title="Pump Assignments">
            <p className="text-xs text-gray-400 mb-3">Click a row to see full details.</p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr><TH>Pump</TH><TH>Fuel</TH><TH>Supervisor</TH><TH>Price / L</TH></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {report.dayShift.dispenserAssignments.map((d, i) => {
                    const price = report.dayShift.pricesAtStart instanceof Map
                      ? report.dayShift.pricesAtStart.get(d.fuelType)
                      : report.dayShift.pricesAtStart?.[d.fuelType];
                    return (
                      <ClickRow key={i} onClick={() => setDetailItem({ type: 'assignment', data: { ...d, priceAtStart: price } })}>
                        <TD className="font-medium">{d.dispenserName}</TD>
                        <TD>{d.fuelType}</TD>
                        <TD>{d.supervisorName || '—'}</TD>
                        <TD>{fmtN(price)}</TD>
                      </ClickRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── SUPERVISOR INPUTS ── */}
      {activeSection === 'supervisor' && (
        <div className="space-y-4">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {[{ key: 'sales', label: 'Sales' }, { key: 'readings', label: 'Meter Readings' }].map(t => (
              <button key={t.key} onClick={() => setSupervisorSubTab(t.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${supervisorSubTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {supervisorSubTab === 'sales' && (
            <Card title="Sales Entries">
              {report.salesEntries.length === 0
                ? <p className="text-sm text-gray-400 py-4 text-center">No sales recorded for this day.</p>
                : <>
                  <p className="text-xs text-gray-400 mb-3">Click a row to see full details.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr><TH>Time</TH><TH>Pump</TH><TH>Fuel</TH><TH>Supervisor</TH><TH>Liters</TH><TH>Expected</TH></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {report.salesEntries.map((sale, i) => (
                          <ClickRow key={sale._id || i} onClick={() => setDetailItem({ type: 'sale', data: sale })}>
                            <TD>{new Date(sale.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</TD>
                            <TD className="font-medium">{sale.dispenserName}</TD>
                            <TD>{sale.fuelType}</TD>
                            <TD>{sale.supervisorName}</TD>
                            <TD>{Number(sale.liters).toFixed(2)} L</TD>
                            <TD>{fmtN(sale.expectedAmount)}</TD>
                          </ClickRow>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              }
            </Card>
          )}

          {supervisorSubTab === 'readings' && (
            <Card title="Meter Readings">
              {report.meterReadings.length === 0
                ? <p className="text-sm text-gray-400 py-4 text-center">No meter readings recorded for this day.</p>
                : <>
                  <p className="text-xs text-gray-400 mb-3">Click a row to see full details.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr><TH>Pump</TH><TH>Supervisor</TH><TH>Opening</TH><TH>Closing</TH><TH>RTT</TH><TH>Status</TH></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {report.meterReadings.map((r, i) => (
                          <ClickRow key={r._id || i} onClick={() => setDetailItem({ type: 'reading', data: r })}>
                            <TD className="font-medium">{r.pumpLabel || r.pumpId}</TD>
                            <TD>{r.supervisorName}</TD>
                            <TD>{r.opening}</TD>
                            <TD>{r.closing ?? '—'}</TD>
                            <TD>{r.rtt ?? 0}</TD>
                            <TD>
                              <div className="flex items-center gap-1.5">
                                <Pill status={r.managerReviewStatus || 'pending'} />
                                {r.discrepancyFlag && <span className="text-amber-500 text-xs">⚠</span>}
                              </div>
                            </TD>
                          </ClickRow>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              }
            </Card>
          )}

          {report.supervisorSummaries.length > 0 && (
            <Card title="Supervisor Summary">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr><TH>Supervisor</TH><TH>Liters</TH><TH>Expected</TH><TH>Cash</TH><TH>POS</TH><TH>Total</TH></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.supervisorSummaries.map((sup, i) => (
                      <tr key={i}>
                        <TD className="font-medium">{sup.supervisorName}</TD>
                        <TD>{sup.totalLiters.toFixed(2)} L</TD>
                        <TD>{fmtN(sup.totalExpected)}</TD>
                        <TD>{fmtN(sup.totalCash)}</TD>
                        <TD>{fmtN(sup.totalPos)}</TD>
                        <TD className="font-semibold">{fmtN(sup.totalPaymentReceived)}</TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── CASHIER INPUTS ── */}
      {activeSection === 'cashier' && (
        <div className="space-y-4">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {[{ key: 'collections', label: 'Collections' }, { key: 'deposits', label: 'Bank Deposits' }].map(t => (
              <button key={t.key} onClick={() => setCashierSubTab(t.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${cashierSubTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {cashierSubTab === 'collections' && (
            <Card title="Payment Collections">
              {report.paymentRecords.length === 0
                ? <p className="text-sm text-gray-400 py-4 text-center">No collections recorded for this day.</p>
                : <>
                  <p className="text-xs text-gray-400 mb-3">Click a row to see full POS breakdown.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr><TH>Time</TH><TH>Pump</TH><TH>Fuel</TH><TH>Supervisor</TH><TH>Cash</TH><TH>POS</TH><TH>Total</TH><TH>Status</TH></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {report.paymentRecords.map((p, i) => (
                          <ClickRow key={p._id || i} onClick={() => setDetailItem({ type: 'payment', data: p })}>
                            <TD>{new Date(p.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</TD>
                            <TD className="font-medium">{p.dispenserName || '—'}</TD>
                            <TD>{p.fuelType || '—'}</TD>
                            <TD>{p.supervisorName || '—'}</TD>
                            <TD>{fmtN(p.cashReceived)}</TD>
                            <TD>{fmtN(p.posReceived)}</TD>
                            <TD className="font-semibold">{fmtN(p.totalReceived)}</TD>
                            <TD><Pill status={p.managerReviewStatus || 'pending'} /></TD>
                          </ClickRow>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              }
            </Card>
          )}

          {cashierSubTab === 'deposits' && (
            <Card title="Bank Deposits">
              {depositsForDate.length === 0
                ? <p className="text-sm text-gray-400 py-4 text-center">No bank deposits recorded for this day.</p>
                : <>
                  <p className="text-xs text-gray-400 mb-3">Click a row to see full details.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr><TH>Amount</TH><TH>Bank</TH><TH>Deposited By</TH><TH>Status</TH></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {depositsForDate.map((dep, i) => (
                          <ClickRow key={dep._id || i} onClick={() => setDetailItem({ type: 'deposit', data: dep })}>
                            <TD className="font-semibold">{fmtN(dep.amount)}</TD>
                            <TD>{dep.bankName}</TD>
                            <TD>{dep.initiatedByCashierName}</TD>
                            <TD><Pill status={dep.status} /></TD>
                          </ClickRow>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              }
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminReportsPage() {
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState('');

  // view state
  const [view, setView] = useState('list');       // 'list' | 'detail'
  const [detailDate, setDetailDate] = useState(null);

  // detail data
  const [report, setReport] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailItem, setDetailItem] = useState(null);

  useEffect(() => {
    fetch('/api/stations')
      .then(r => r.json())
      .then(d => {
        const list = d.stations || [];
        setStations(list);
        if (list.length > 0) setSelectedStation(list[0]._id);
      })
      .catch(() => {});
  }, []);

  // Reset to list when station changes
  useEffect(() => {
    setView('list');
    setReport(null);
    setDetailItem(null);
  }, [selectedStation]);

  const fetchReport = useCallback(async (date, stId) => {
    const sid = stId || selectedStation;
    if (!sid || !date) return;
    setDetailLoading(true);
    setDetailError('');
    setReport(null);
    try {
      const res = await fetch(`/api/reports/daily?stationId=${sid}&date=${date}`);
      const data = await res.json();
      if (res.ok) setReport(data);
      else setDetailError(data.error || 'Failed to fetch report');
    } catch { setDetailError('Network error.'); }
    finally { setDetailLoading(false); }
  }, [selectedStation]);

  const fetchDeposits = useCallback(async (stId) => {
    const sid = stId || selectedStation;
    if (!sid) return;
    try {
      const res = await fetch(`/api/cash-deposits?stationId=${sid}&limit=200`);
      const data = await res.json();
      if (res.ok) setDeposits(data.cashDeposits || []);
    } catch {}
  }, [selectedStation]);

  const openDay = useCallback((dateStr) => {
    setDetailDate(dateStr);
    setView('detail');
    fetchReport(dateStr);
    fetchDeposits();
  }, [fetchReport, fetchDeposits]);

  const backToList = () => {
    setView('list');
    setReport(null);
    setDetailError('');
    setDetailItem(null);
  };

  const stationOptions = stations.map(s => ({ value: s._id, label: `${s.name} (${s.code})` }));

  const detailLabel = detailDate
    ? new Date(detailDate + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="space-y-6">
      {/* Header + station selector */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Reports</h1>
        <div className="w-64">
          <Select
            label="Station"
            name="station"
            value={selectedStation}
            onChange={e => setSelectedStation(e.target.value)}
            options={stationOptions}
          />
        </div>
      </div>

      {/* ── LIST VIEW ── */}
      {view === 'list' && selectedStation && (
        <ReportPeriodList stationId={selectedStation} onSelectDay={openDay} />
      )}

      {/* ── DETAIL VIEW ── */}
      {view === 'detail' && (
        <div className="space-y-4">
          {/* Navigation + date */}
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
              disabled={detailLoading}
              className="text-sm text-ecana-maroon hover:underline font-medium disabled:opacity-50"
            >
              {detailLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {detailError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{detailError}</div>
          )}

          <DayDetail
            report={report}
            deposits={deposits}
            detailDate={detailDate}
            setDetailItem={setDetailItem}
            loading={detailLoading}
          />
        </div>
      )}

      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  );
}
