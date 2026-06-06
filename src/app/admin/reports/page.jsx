'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/Card';
import Select from '@/components/Select';

function fmtN(n) {
  return `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNum(n) {
  return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
function EditField({ label, name, value, onChange, type = 'number' }) {
  return (
    <div className="flex justify-between items-center gap-4">
      <label className="text-gray-500 text-sm shrink-0">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        step="0.01"
        className="w-36 text-right text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:border-ecana-maroon"
      />
    </div>
  );
}

function DetailModal({ item, onClose, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const editableTypes = ['sale', 'reading', 'payment'];

  function startEdit() {
    const d = item.data;
    if (item.type === 'sale') {
      setForm({ liters: d.liters ?? '', cashAmount: d.cashAmount ?? 0, posAmount: d.posAmount ?? 0 });
    } else if (item.type === 'reading') {
      setForm({ opening: d.opening ?? '', closing: d.closing ?? '', rtt: d.rtt ?? 0 });
    } else if (item.type === 'payment') {
      setForm({ cashReceived: d.cashReceived ?? 0, posReceived: d.posReceived ?? 0 });
    }
    setSaveError('');
    setEditing(true);
  }

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    const d = item.data;
    try {
      let url, body;
      if (item.type === 'sale') {
        url = `/api/sales/${d._id}`;
        body = { liters: parseFloat(form.liters), cashAmount: parseFloat(form.cashAmount) || 0, posAmount: parseFloat(form.posAmount) || 0 };
      } else if (item.type === 'reading') {
        url = `/api/meter-readings/${d._id}`;
        body = { opening: parseFloat(form.opening), closing: parseFloat(form.closing), rtt: parseFloat(form.rtt) || 0 };
      } else if (item.type === 'payment') {
        url = `/api/payments/${d._id}`;
        body = { cashReceived: parseFloat(form.cashReceived) || 0, posReceived: parseFloat(form.posReceived) || 0 };
      }
      const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.error || 'Failed to save'); return; }
      setEditing(false);
      onSaved();
      onClose();
    } catch {
      setSaveError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!item) return null;

  const d = item.data;
  let title = '';
  let viewBody = null;
  let editBody = null;

  if (item.type === 'assignment') {
    title = `Pump: ${d.dispenserName}`;
    viewBody = (
      <dl className="space-y-2 text-sm">
        <Row label="Fuel Type" value={d.fuelType} />
        <Row label="Supervisor" value={d.supervisorName || '—'} />
        <Row label="Tank" value={d.tankLabel || '—'} />
        <Row label="Price at Start (₦/L)" value={fmtNum(d.priceAtStart)} />
        <Row label="Initial Reading (L)" value={d.initialReading != null ? Number(d.initialReading).toLocaleString('en-NG') : '—'} />
        <Row label="Final Reading (L)" value={d.finalReading != null ? Number(d.finalReading).toLocaleString('en-NG') : '—'} />
        <Row label="Total (L)" value={d.totalLiters != null ? Number(d.totalLiters).toFixed(2) : '—'} />
      </dl>
    );
  }

  if (item.type === 'sale') {
    title = `Sale — ${d.dispenserName}`;
    viewBody = (
      <dl className="space-y-2 text-sm">
        <Row label="Pump" value={d.dispenserName} />
        <Row label="Fuel Type" value={d.fuelType} />
        <Row label="Supervisor" value={d.supervisorName} />
        <Row label="Liters Sold (L)" value={Number(d.liters).toFixed(2)} />
        <Row label="Price / Liter (₦)" value={fmtNum(d.pricePerLiter)} />
        <Row label="Expected Amount (₦)" value={fmtNum(d.expectedAmount)} />
        <Row label="Time Entered" value={fmtDate(d.createdAt)} />
      </dl>
    );
    editBody = (
      <div className="space-y-3 text-sm">
        <Row label="Pump" value={d.dispenserName} />
        <Row label="Supervisor" value={d.supervisorName} />
        <Row label="Price / Liter" value={fmtN(d.pricePerLiter)} />
        <div className="border-t pt-3 mt-2 space-y-2">
          <EditField label="Liters Sold" name="liters" value={form.liters} onChange={handleChange} />
          <EditField label="Cash Amount (₦)" name="cashAmount" value={form.cashAmount} onChange={handleChange} />
          <EditField label="POS Amount (₦)" name="posAmount" value={form.posAmount} onChange={handleChange} />
        </div>
      </div>
    );
  }

  if (item.type === 'reading') {
    title = `Meter Reading — ${d.pumpLabel || d.pumpId}`;
    viewBody = (
      <dl className="space-y-2 text-sm">
        <Row label="Pump" value={d.pumpLabel || d.pumpId} />
        <Row label="Supervisor" value={d.supervisorName} />
        <Row label="Opening Reading (L)" value={d.opening} />
        <Row label="Closing Reading (L)" value={d.closing ?? '—'} />
        <Row label="RTT (L)" value={d.rtt ?? 0} />
        <Row label="Net Sold (L)" value={d.closing != null ? Math.max(0, d.closing - d.opening - (d.rtt || 0)).toFixed(2) : '—'} />
        {d.discrepancyFlag && <Row label="Discrepancy" value={<span className="text-amber-700 font-medium">⚠ {d.discrepancyComment || 'Flagged'}</span>} />}
        <Row label="Review Status" value={<Pill status={d.managerReviewStatus || 'pending'} />} />
        {d.managerReviewNote && <Row label="Review Note" value={d.managerReviewNote} />}
        {d.reviewedByManagerName && <Row label="Reviewed By" value={d.reviewedByManagerName} />}
        <Row label="Previous Closing (L)" value={d.previousDayClosing ?? '—'} />
      </dl>
    );
    editBody = (
      <div className="space-y-3 text-sm">
        <Row label="Pump" value={d.pumpLabel || d.pumpId} />
        <Row label="Supervisor" value={d.supervisorName} />
        <div className="border-t pt-3 mt-2 space-y-2">
          <EditField label="Opening Reading" name="opening" value={form.opening} onChange={handleChange} />
          <EditField label="Closing Reading" name="closing" value={form.closing} onChange={handleChange} />
          <EditField label="RTT" name="rtt" value={form.rtt} onChange={handleChange} />
        </div>
      </div>
    );
  }

  if (item.type === 'payment') {
    title = `Collection — ${d.dispenserName || d.supervisorName}`;
    viewBody = (
      <dl className="space-y-2 text-sm">
        <Row label="Pump" value={d.dispenserName || '—'} />
        <Row label="Fuel Type" value={d.fuelType || '—'} />
        <Row label="Supervisor" value={d.supervisorName || '—'} />
        <Row label="Cash Received (₦)" value={fmtNum(d.cashReceived)} />
        <Row label="POS Total (₦)" value={fmtNum(d.posReceived)} />
        <Row label="Total Received (₦)" value={<span className="font-bold">{fmtNum(d.totalReceived)}</span>} />
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
    editBody = (
      <div className="space-y-3 text-sm">
        <Row label="Pump" value={d.dispenserName || '—'} />
        <Row label="Supervisor" value={d.supervisorName || '—'} />
        <div className="border-t pt-3 mt-2 space-y-2">
          <EditField label="Cash Received (₦)" name="cashReceived" value={form.cashReceived} onChange={handleChange} />
          <EditField label="POS Total (₦)" name="posReceived" value={form.posReceived} onChange={handleChange} />
        </div>
      </div>
    );
  }

  if (item.type === 'deposit') {
    title = `Bank Deposit — ${fmtN(d.amount)}`;
    viewBody = (
      <dl className="space-y-2 text-sm">
        <Row label="Amount (₦)" value={<span className="font-bold">{fmtNum(d.amount)}</span>} />
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

  const canEdit = editableTypes.includes(item.type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 pr-4">{title}</h2>
          <div className="flex items-center gap-2 shrink-0">
            {canEdit && !editing && (
              <button onClick={startEdit}
                className="text-xs font-medium px-3 py-1 rounded-lg bg-ecana-maroon text-white hover:opacity-90">
                Edit
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {editing ? editBody : viewBody}

        {editing && (
          <div className="mt-5 space-y-2">
            {saveError && <p className="text-xs text-red-600">{saveError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setEditing(false); setSaveError(''); }}
                className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-1.5 text-sm rounded-lg bg-ecana-maroon text-white hover:opacity-90 disabled:opacity-50 font-medium">
                {saving ? 'Saving…' : 'Save Correction'}
              </button>
            </div>
          </div>
        )}
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
                  <Row key={fuel} label={`${fuel} (₦/L)`} value={fmtNum(price)} />
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
                        <TD>{fmtNum(price)}</TD>
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
                      <thead><tr><TH>Time</TH><TH>Pump</TH><TH>Fuel</TH><TH>Supervisor</TH><TH>Liters (L)</TH><TH>Expected (₦)</TH></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {report.salesEntries.map((sale, i) => (
                          <ClickRow key={sale._id || i} onClick={() => setDetailItem({ type: 'sale', data: sale })}>
                            <TD>{new Date(sale.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</TD>
                            <TD className="font-medium">{sale.dispenserName}</TD>
                            <TD>{sale.fuelType}</TD>
                            <TD>{sale.supervisorName}</TD>
                            <TD>{Number(sale.liters).toFixed(2)}</TD>
                            <TD>{fmtNum(sale.expectedAmount)}</TD>
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
                  <thead><tr><TH>Supervisor</TH><TH>Liters (L)</TH><TH>Expected (₦)</TH><TH>Cash (₦)</TH><TH>POS (₦)</TH><TH>Total (₦)</TH></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.supervisorSummaries.map((sup, i) => (
                      <tr key={i}>
                        <TD className="font-medium">{sup.supervisorName}</TD>
                        <TD>{sup.totalLiters.toFixed(2)}</TD>
                        <TD>{fmtNum(sup.totalExpected)}</TD>
                        <TD>{fmtNum(sup.totalCash)}</TD>
                        <TD>{fmtNum(sup.totalPos)}</TD>
                        <TD className="font-semibold">{fmtNum(sup.totalPaymentReceived)}</TD>
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

// ── Summary list view (replaces ReportPeriodList) ────────────────────────────
function SummaryListView({ stationId, onSelectDay }) {
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  })();

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchRows = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/reports/summary-book?stationId=${stationId}&from=${from}&to=${to}`);
      const data = await res.json();
      if (res.ok) setRows(data.rows || []);
      else setError(data.error || 'Failed to load summary');
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, [stationId, from, to]);

  useEffect(() => { fetchRows(); }, [stationId]);

  function fmtNum(n) {
    return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">From</label>
          <input type="date" value={from} max={today} onChange={e => setFrom(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-ecana-maroon" />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">To</label>
          <input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-ecana-maroon" />
        </div>
        <button onClick={fetchRows} disabled={loading}
          className="px-4 py-1.5 text-sm bg-ecana-maroon text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium">
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
      {loading && <div className="flex justify-center py-10"><div className="spinner" /></div>}

      {!loading && rows.length > 0 && (
        <div className="card-modern overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <TH>Date</TH>
                  <TH>Product</TH>
                  <TH>Opening Stock (L)</TH>
                  <TH>Stock In (L)</TH>
                  <TH>Tolerance (L)</TH>
                  <TH>Sales (L)</TH>
                  <TH>Price/L (₦)</TH>
                  <TH>Sales Amount (₦)</TH>
                  <TH>Shortage Recorded (L)</TH>
                  <TH>Closing Stock (L)</TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => {
                  const tolerance = (r.sales ?? 0) - ((r.openingStock ?? 0) + (r.stockIn ?? 0) - (r.closingStock ?? 0));
                  const salesAmount = (r.priceForDay ?? 0) * (r.sales ?? 0);
                  return (
                    <ClickRow key={i} onClick={() => onSelectDay(r.date)}>
                      <TD className="font-medium whitespace-nowrap">{r.date}</TD>
                      <TD>{r.product || '—'}</TD>
                      <TD>{fmtNum(r.openingStock)}</TD>
                      <TD>{fmtNum(r.stockIn)}</TD>
                      <TD className={tolerance < 0 ? 'text-red-600 font-medium' : tolerance > 0 ? 'text-green-600' : ''}>
                        {fmtNum(tolerance)}
                      </TD>
                      <TD>{fmtNum(r.sales)}</TD>
                      <TD>{fmtNum(r.priceForDay)}</TD>
                      <TD>{fmtNum(salesAmount)}</TD>
                      <TD className={r.shortage > 0 ? 'text-red-600 font-medium' : ''}>{fmtNum(r.shortage)}</TD>
                      <TD>{fmtNum(r.closingStock)}</TD>
                    </ClickRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <p className="text-base font-medium">No summary data found</p>
          <p className="text-sm mt-1">Summary rows appear after the manager ends the day and confirms closing stock for each tank.</p>
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
        <SummaryListView stationId={selectedStation} onSelectDay={openDay} />
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

      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} onSaved={() => fetchReport(detailDate)} />
    </div>
  );
}
