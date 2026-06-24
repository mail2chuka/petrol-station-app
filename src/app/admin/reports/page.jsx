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
// Magnitude shown as an absolute value with an explicit leading sign; direction
// (gain/loss) is also conveyed by colour at the call site.
function signedAbs(n) {
  const v = Number(n) || 0;
  return `${v >= 0 ? '+' : '−'}${fmtNum(Math.abs(v))}`;
}
function fmtDate(d) {
  return new Date(d).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

const STATUS_PILL = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  queried:  'bg-amber-100 text-amber-700',
  rejected: 'bg-amber-100 text-amber-700',
  query:    'bg-amber-100 text-amber-700',
};

const TANK_COLORS = [
  'bg-pink-100',
  'bg-blue-100',
  'bg-green-100',
  'bg-orange-100',
  'bg-purple-100',
  'bg-teal-100',
  'bg-yellow-100',
  'bg-indigo-100',
  'bg-rose-100',
  'bg-cyan-100',
];

function buildTankColorMap(dispenserAssignments = []) {
  const seen = [];
  for (const d of dispenserAssignments) {
    if (d.tankId && !seen.includes(d.tankId)) seen.push(d.tankId);
  }
  const map = {};
  seen.forEach((id, i) => { map[id] = TANK_COLORS[i % TANK_COLORS.length]; });
  return map;
}

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

  const editableTypes = ['sale', 'reading', 'payment', 'deposit'];

  function startEdit() {
    const d = item.data;
    if (item.type === 'sale') {
      setForm({ liters: d.liters ?? '', cashAmount: d.cashAmount ?? 0, posAmount: d.posAmount ?? 0 });
    } else if (item.type === 'reading') {
      setForm({ opening: d.opening ?? '', closing: d.closing ?? '', rtt: d.rtt ?? 0 });
    } else if (item.type === 'payment') {
      setForm({ cashReceived: d.cashReceived ?? 0, posReceived: d.posReceived ?? 0 });
    } else if (item.type === 'deposit') {
      setForm({ amount: d.amount ?? 0 });
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
      } else if (item.type === 'deposit') {
        url = `/api/cash-deposits/${d._id}`;
        body = { amount: parseFloat(form.amount) };
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
        <Row label="Total (L)" value={d.totalLiters != null ? fmtNum(d.totalLiters) : '—'} />
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
        <Row label="Liters Sold (L)" value={fmtNum(d.liters)} />
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
        <Row label="Net Sold (L)" value={d.closing != null ? fmtNum(Math.max(0, d.closing - d.opening - (d.rtt || 0))) : '—'} />
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
    editBody = (
      <div className="space-y-3 text-sm">
        <Row label="Bank" value={d.bankName} />
        <Row label="Deposited By" value={d.initiatedByCashierName} />
        <div className="border-t pt-3 mt-2 space-y-2">
          <EditField label="Amount (₦)" name="amount" value={form.amount} onChange={handleChange} />
        </div>
      </div>
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
            {saveError && <p className="text-xs text-amber-700">{saveError}</p>}
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

function ClickRow({ children, onClick, className = '' }) {
  return (
    <tr onClick={onClick} className={`hover:opacity-80 cursor-pointer transition-opacity ${className}`}>
      {children}
    </tr>
  );
}
function TD({ children, className = '' }) {
  return <td className={`px-4 py-2.5 text-sm text-gray-700 ${className}`}>{children}</td>;
}
function TH({ children }) {
  return <th className="px-4 py-2.5 text-xs uppercase tracking-wide text-left">{children}</th>;
}

function ToleranceHeader() {
  const [open, setOpen] = useState(false);
  return (
    <th className="px-4 py-2.5 text-xs uppercase tracking-wide text-left">
      <div className="flex items-center gap-1.5 relative">
        <span>Tolerance</span>
        <button
          onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
          className="w-4 h-4 rounded-full bg-gray-300 hover:bg-gray-400 text-white flex items-center justify-center text-[10px] font-bold leading-none transition-colors flex-shrink-0"
          title="How this column is calculated"
        >
          i
        </button>
        {open && (
          <>
            <button
              className="fixed inset-0 z-10"
              onClick={e => { e.stopPropagation(); setOpen(false); }}
            />
            <div className="absolute top-6 left-0 z-20 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-4 text-left normal-case tracking-normal">
              <p className="text-xs font-bold text-gray-700 mb-2">Tolerance Column Formula</p>
              <p className="text-xs text-gray-600 mb-3">
                <strong>Tolerance (L)</strong> = Closing Stock − Expected Closing<br />
                <span className="text-gray-400">Positive = tank has more fuel than accounted for (overage).</span>
              </p>
              <p className="text-xs text-gray-600 mb-3">
                <strong>Exp: X.XX (N%)</strong> = Dispensed Volume × Station Tolerance %<br />
                <span className="text-gray-400">This is the acceptable measurement variance for the day.</span>
              </p>
              <p className="text-xs text-gray-600">
                <strong>% Difference</strong> = (Actual Tolerance − Expected Tolerance) ÷ Total Dispensed × 100<br />
                <span className="text-gray-400">Green = actual surplus is above expected. Amber = below expected.</span>
              </p>
              <button onClick={() => setOpen(false)} className="mt-3 text-xs text-ecana-maroon hover:underline font-medium">Close</button>
            </div>
          </>
        )}
      </div>
    </th>
  );
}

// ── Day Detail View (4-section) ───────────────────────────────────────────────
function DayDetail({ report, deposits, detailDate, setDetailItem, loading }) {
  const [activeSection, setActiveSection] = useState('supervisor');
  const [cashierSubTab, setCashierSubTab] = useState('collections');
  const [supervisorFuel, setSupervisorFuel] = useState('');

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
              <p className="text-xl font-bold text-ecana-maroon">{v.liters.toLocaleString('en-NG', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L</p>
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
            <p className={`text-xl font-bold ${s.discrepancy > 0 ? 'text-green-600' : s.discrepancy < 0 ? 'text-amber-600' : 'text-gray-600'}`}>
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
            <p className="text-xs text-gray-400 mb-3">Click a row to see full details. Row colour indicates linked tank.</p>
            <div className="overflow-auto max-h-[350px]">
              <table className="w-full">
                <thead><tr><TH>Pump</TH><TH>Fuel</TH><TH>Tank</TH><TH>Supervisor</TH><TH>Price / L</TH></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {(() => {
                    const tcMap = buildTankColorMap(report.dayShift.dispenserAssignments);
                    return report.dayShift.dispenserAssignments.map((d, i) => {
                      const price = report.dayShift.pricesAtStart instanceof Map
                        ? report.dayShift.pricesAtStart.get(d.fuelType)
                        : report.dayShift.pricesAtStart?.[d.fuelType];
                      const rowColor = d.tankId ? tcMap[d.tankId] || '' : '';
                      return (
                        <ClickRow key={i} className={rowColor} onClick={() => setDetailItem({ type: 'assignment', data: { ...d, priceAtStart: price } })}>
                          <TD className="font-medium">{d.dispenserName}</TD>
                          <TD>{d.fuelType}</TD>
                          <TD>{d.tankLabel || '—'}</TD>
                          <TD>{d.supervisorName || '—'}</TD>
                          <TD>{fmtNum(price)}</TD>
                        </ClickRow>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── SUPERVISOR INPUTS ── */}
      {activeSection === 'supervisor' && (() => {
        const assignments = report.dayShift?.dispenserAssignments || [];
        const tankColorMap = buildTankColorMap(assignments);
        const pumpTankMap = {};
        const pumpFuelMap = {};
        for (const d of assignments) {
          pumpTankMap[d.dispenserId] = d.tankId;
          pumpFuelMap[d.dispenserId] = d.fuelType;
        }

        // Derive available fuel types for the filter
        const allFuels = [...new Set(
          report.meterReadings.map(r => r.fuelType || pumpFuelMap[r.pumpId]).filter(Boolean)
        )].sort();

        const filteredReadings = supervisorFuel
          ? report.meterReadings.filter(r => (r.fuelType || pumpFuelMap[r.pumpId]) === supervisorFuel)
          : report.meterReadings;

        // Group tank stock entries by tankId for the dipstick table
        const tankEntryMap = {};
        for (const entry of (report.tankStockEntries || [])) {
          if (!supervisorFuel || entry.product === supervisorFuel) {
            if (!tankEntryMap[entry.tankId]) {
              tankEntryMap[entry.tankId] = { label: entry.tankLabel, product: entry.product };
            }
            tankEntryMap[entry.tankId][entry.period] = entry;
          }
        }
        const tankRows = Object.entries(tankEntryMap);

        return (
          <div className="space-y-4">
            {/* ── Product filter ── */}
            {allFuels.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Product:</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setSupervisorFuel('')}
                    className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${!supervisorFuel ? 'bg-ecana-maroon text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >All</button>
                  {allFuels.map(f => (
                    <button
                      key={f}
                      onClick={() => setSupervisorFuel(f)}
                      className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${supervisorFuel === f ? 'bg-ecana-maroon text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >{f}</button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Pump Meter Readings ── */}
            <Card title="Pump Meter Readings">
              {filteredReadings.length === 0
                ? <p className="text-sm text-gray-400 py-4 text-center">No meter readings recorded{supervisorFuel ? ` for ${supervisorFuel}` : ''} for this day.</p>
                : <>
                  <p className="text-xs text-gray-400 mb-3">Click a row to see full details. Row colour indicates linked tank.</p>
                  <div className="overflow-auto max-h-[350px]">
                    <table className="w-full">
                      <thead><tr><TH>Pump</TH><TH>Supervisor</TH><TH>Opening</TH><TH>Closing</TH><TH>RTT</TH><TH>Net Sold (L)</TH><TH>Status</TH></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredReadings.map((r, i) => {
                          const tankId = pumpTankMap[r.pumpId];
                          const rowColor = tankId ? tankColorMap[tankId] || '' : '';
                          const netSold = r.closing != null ? fmtNum(Math.max(0, r.closing - r.opening - (r.rtt || 0))) : '—';
                          return (
                            <ClickRow key={r._id || i} className={rowColor} onClick={() => setDetailItem({ type: 'reading', data: r })}>
                              <TD className="font-medium">{r.pumpLabel || r.pumpId}</TD>
                              <TD>{r.supervisorName}</TD>
                              <TD>{r.opening}</TD>
                              <TD>{r.closing ?? '—'}</TD>
                              <TD>{r.rtt ?? 0}</TD>
                              <TD className="font-medium">{netSold}</TD>
                              <TD>
                                <Pill status={r.managerReviewStatus || 'pending'} />
                              </TD>
                            </ClickRow>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 border-t-2 border-t-gray-200">
                          <td colSpan={5} className="px-4 py-2.5 text-sm font-bold text-gray-700">Total</td>
                          <td className="px-4 py-2.5 text-sm font-bold text-gray-900">
                            {fmtNum(filteredReadings.reduce((sum, r) => {
                              if (r.closing == null) return sum;
                              return sum + Math.max(0, r.closing - r.opening - (r.rtt || 0));
                            }, 0))}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              }
            </Card>

            {/* ── Tank Dipstick Readings ── */}
            <Card title="Tank Dipstick Readings">
              {tankRows.length === 0
                ? <p className="text-sm text-gray-400 py-4 text-center">No tank readings recorded for this day.</p>
                : <div className="overflow-auto max-h-[350px]">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <TH>Tank</TH>
                          <TH>Opening Dipstick (L)</TH>
                          <TH>Stock In (L)</TH>
                          <TH>Closing Dipstick (L)</TH>
                          <TH>Volume Sold (L)</TH>
                          <TH>Entered By</TH>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {tankRows.map(([tankId, tank]) => {
                          const openingVal = tank.opening?.closingStockMeasured;
                          const closingVal = tank.closing?.closingStockMeasured;
                          const stockIn = report.stockInByTank?.[tankId] || 0;
                          // Volume sold = opening + stock-in − closing (fuel that left the tank)
                          const volumeSold = openingVal != null && closingVal != null
                            ? (openingVal + stockIn - closingVal) : null;
                          const rowColor = tankColorMap[tankId] || '';
                          const enteredBy = tank.closing?.supervisorName || tank.opening?.supervisorName || '—';
                          return (
                            <tr key={tankId} className={`border-b border-gray-100 ${rowColor}`}>
                              <TD className="font-medium">{tank.label || tankId}</TD>
                              <TD>{openingVal != null ? fmtNum(openingVal) : <span className="text-amber-500 text-xs">Pending</span>}</TD>
                              <TD>{stockIn > 0 ? fmtNum(stockIn) : '—'}</TD>
                              <TD>{closingVal != null ? fmtNum(closingVal) : <span className="text-amber-500 text-xs">Pending</span>}</TD>
                              <TD className="font-medium">{volumeSold != null ? fmtNum(volumeSold) : '—'}</TD>
                              <TD className="text-gray-500">{enteredBy}</TD>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 border-t-2 border-t-gray-200">
                          <td colSpan={4} className="px-4 py-2.5 text-sm font-bold text-gray-700">Total</td>
                          <td className="px-4 py-2.5 text-sm font-bold text-gray-900">
                            {fmtNum(tankRows.reduce((sum, [tankId, tank]) => {
                              const o = tank.opening?.closingStockMeasured;
                              const c = tank.closing?.closingStockMeasured;
                              const si = report.stockInByTank?.[tankId] || 0;
                              return sum + (o != null && c != null ? o + si - c : 0);
                            }, 0))}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
              }
            </Card>

            {/* ── Supervisor Summary ── */}
            {report.supervisorSummaries.length > 0 && (
              <Card title="Supervisor Summary">
                <div className="overflow-auto max-h-[350px]">
                  <table className="w-full">
                    <thead><tr><TH>Supervisor</TH><TH>Liters (L)</TH><TH>Expected (₦)</TH><TH>Cash (₦)</TH><TH>POS (₦)</TH><TH>Total (₦)</TH></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.supervisorSummaries.map((sup, i) => (
                        <tr key={i}>
                          <TD className="font-medium">{sup.supervisorName}</TD>
                          <TD>{fmtNum(sup.totalLiters)}</TD>
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
        );
      })()}

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
                  <div className="overflow-auto max-h-[350px]">
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
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 bg-gray-50">
                          <td colSpan={4} className="px-3 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Totals</td>
                          <td className="px-3 py-2.5 text-sm font-bold text-gray-900">
                            {fmtN(report.paymentRecords.reduce((s, p) => s + (Number(p.cashReceived) || 0), 0))}
                          </td>
                          <td className="px-3 py-2.5 text-sm font-bold text-gray-900">
                            {fmtN(report.paymentRecords.reduce((s, p) => s + (Number(p.posReceived) || 0), 0))}
                          </td>
                          <td className="px-3 py-2.5 text-sm font-bold text-ecana-maroon">
                            {fmtN(report.paymentRecords.reduce((s, p) => s + (Number(p.totalReceived) || 0), 0))}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
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
                  <div className="overflow-auto max-h-[350px]">
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

// ── Summary list view ────────────────────────────────────────────────────────
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
  const [selectedFuel, setSelectedFuel] = useState('');

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

  // Use API's pre-computed overage/shortage (already mutually exclusive per row)
  const computedRows = rows.filter(r => !selectedFuel || r.product === selectedFuel).map(r => {
    const overage = r.overage ?? 0;
    const shortage = r.shortage ?? 0;
    const expTol = r.expectedTolerance ?? 0;
    const sales = r.sales ?? 0;
    const salesAmount = (r.priceForDay ?? 0) * sales;
    return { ...r, overage, shortage, expTol, salesAmount, sales };
  });

  const totalSales      = computedRows.reduce((s, r) => s + r.sales, 0);
  const totalSalesAmt   = computedRows.reduce((s, r) => s + r.salesAmount, 0);
  const totalOverage    = computedRows.reduce((s, r) => s + r.overage, 0);
  const totalShortage   = computedRows.reduce((s, r) => s + r.shortage, 0);
  const totalStockIn    = computedRows.reduce((s, r) => s + (r.stockIn ?? 0), 0);
  const totalExpTol     = computedRows.reduce((s, r) => s + r.expTol, 0);

  // Per-product breakdown for the Totals row (only used when >1 product is present)
  const totalProducts = [...new Set(computedRows.map(r => r.product).filter(Boolean))];
  const multiProduct = totalProducts.length > 1;
  const byProduct = {};
  totalProducts.forEach(p => {
    const pr = computedRows.filter(r => r.product === p);
    byProduct[p] = {
      sales:       pr.reduce((s, r) => s + r.sales, 0),
      salesAmount: pr.reduce((s, r) => s + r.salesAmount, 0),
      overage:     pr.reduce((s, r) => s + r.overage, 0),
      shortage:    pr.reduce((s, r) => s + r.shortage, 0),
      stockIn:     pr.reduce((s, r) => s + (r.stockIn ?? 0), 0),
      expTol:      pr.reduce((s, r) => s + r.expTol, 0),
    };
  });

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
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">Product</label>
          <select
            value={selectedFuel}
            onChange={e => setSelectedFuel(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-ecana-maroon bg-white"
          >
            <option value="">All</option>
            {['PMS', 'AGO', 'LPG', 'DPK'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <button onClick={fetchRows} disabled={loading}
          className="px-4 py-1.5 text-sm bg-ecana-maroon text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium">
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {error && <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">{error}</div>}
      {loading && <div className="flex justify-center py-10"><div className="spinner" /></div>}

      {!loading && computedRows.length > 0 && (
        <div className="card-modern overflow-hidden">
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full">
              <thead>
                <tr>
                  <TH>Date</TH>
                  <TH>Opening Stock (L)</TH>
                  <TH>Stock In (L)</TH>
                  <ToleranceHeader />
                  <TH>Sales (L)</TH>
                  <TH>Price/L (₦)</TH>
                  <TH>Sales Amount (₦)</TH>
                  <TH>Shortage (L)</TH>
                  <TH>Closing Stock (L)</TH>
                </tr>
              </thead>
              <tbody>
                {computedRows.map((r, i) => {
                  const prevDate = i > 0 ? computedRows[i - 1].date : null;
                  const isNewDate = prevDate !== r.date;
                  return (
                    <ClickRow
                      key={i}
                      onClick={() => onSelectDay(r.date)}
                      className={isNewDate && i > 0 ? 'border-t-2 border-t-gray-300' : ''}
                    >
                      <TD className="font-medium whitespace-nowrap">
                        {new Date(r.date + 'T12:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </TD>
                      <TD>{fmtNum(r.openingStock)}</TD>
                      <TD>{fmtNum(r.stockIn)}</TD>
                      <td className="px-4 py-2.5 text-sm text-gray-700">
                        {r.sales > 0 ? signedAbs(r.overage - r.shortage) : '—'}
                        {r.sales > 0 && (
                          <span className={`block text-xs font-medium ${((r.overage - r.shortage) - r.expTol) >= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                            {signedAbs((r.overage - r.shortage) - r.expTol)} ({(r.tolerancePercent ?? ((r.expTol / r.sales) * 100)).toFixed(1)}%)
                          </span>
                        )}
                      </td>
                      <TD>{fmtNum(r.sales)}</TD>
                      <TD>{fmtNum(r.priceForDay)}</TD>
                      <TD>{fmtNum(r.salesAmount)}</TD>
                      <td className={`px-4 py-2.5 text-sm font-medium ${r.shortage > 0 ? 'text-pink-600' : 'text-gray-400'}`}>
                        {r.shortage > 0 ? fmtNum(r.shortage) : '—'}
                      </td>
                      <TD>{fmtNum(r.closingStock)}</TD>
                    </ClickRow>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-t-gray-300">
                  <td className="px-4 py-3 text-sm font-bold text-gray-800 uppercase tracking-wide">Totals</td>
                  <td className="px-4 py-3 text-sm text-gray-400">—</td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-800">
                    {multiProduct ? (
                      totalProducts.map(p => (
                        <span key={p} className="block">
                          {byProduct[p].stockIn > 0 ? fmtNum(byProduct[p].stockIn) : '—'}
                          <span className="text-xs font-normal text-gray-500"> ({p})</span>
                        </span>
                      ))
                    ) : (totalStockIn > 0 ? fmtNum(totalStockIn) : '—')}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-800">
                    {multiProduct ? (
                      totalProducts.map(p => {
                        const b = byProduct[p];
                        const variance = b.overage - b.shortage;
                        return (
                          <span key={p} className="block mb-1 last:mb-0">
                            <span className="text-gray-700">
                              {b.sales > 0 ? signedAbs(variance) : '—'}
                            </span>
                            <span className="text-xs font-normal text-gray-500"> ({p})</span>
                            {b.sales > 0 && (
                              <span className={`block text-xs font-medium ${(variance - b.expTol) >= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                                {signedAbs(variance - b.expTol)} ({((b.expTol / b.sales) * 100).toFixed(1)}%)
                              </span>
                            )}
                          </span>
                        );
                      })
                    ) : (
                      <>
                        <span className="text-gray-700">
                          {totalSales > 0 ? signedAbs(totalOverage - totalShortage) : '—'}
                        </span>
                        {totalSales > 0 && (
                          <span className={`block text-xs font-medium ${((totalOverage - totalShortage) - totalExpTol) >= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                            {signedAbs((totalOverage - totalShortage) - totalExpTol)} ({((totalExpTol / totalSales) * 100).toFixed(1)}%)
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-800">
                    {multiProduct ? (
                      totalProducts.map(p => (
                        <span key={p} className="block">
                          {fmtNum(byProduct[p].sales)}
                          <span className="text-xs font-normal text-gray-500"> ({p})</span>
                        </span>
                      ))
                    ) : fmtNum(totalSales)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">—</td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-800">
                    {multiProduct ? (
                      totalProducts.map(p => (
                        <span key={p} className="block">
                          {fmtN(byProduct[p].salesAmount)}
                          <span className="text-xs font-normal text-gray-500"> ({p})</span>
                        </span>
                      ))
                    ) : fmtN(totalSalesAmt)}
                  </td>
                  <td className={`px-4 py-3 text-sm font-bold ${totalShortage > 0 ? 'text-pink-600' : 'text-gray-400'}`}>
                    {multiProduct ? (
                      totalProducts.map(p => (
                        <span key={p} className="block">
                          {byProduct[p].shortage > 0 ? fmtNum(byProduct[p].shortage) : '—'}
                          <span className="text-xs font-normal text-gray-500"> ({p})</span>
                        </span>
                      ))
                    ) : (totalShortage > 0 ? fmtNum(totalShortage) : '—')}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">—</td>
                </tr>
              </tfoot>
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
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Station</label>
          <div className="relative">
            <select
              value={selectedStation}
              onChange={e => setSelectedStation(e.target.value)}
              className="w-full font-bold text-gray-900 text-sm border-2 border-ecana-maroon rounded-xl px-4 py-2.5 bg-white focus:outline-none focus:ring-4 focus:ring-ecana-maroon/10 appearance-none cursor-pointer pr-10 min-w-[220px]"
            >
              {stationOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg className="w-5 h-5 text-ecana-maroon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
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
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">{detailError}</div>
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
