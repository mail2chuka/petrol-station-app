'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Loading from '@/components/Loading';

// ── Helpers ────────────────────────────────────────────────────────────────────
function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(d);
}
function fmtN(n) {
  if (n == null || n === '') return '—';
  return Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STEPS = [
  { id: 'setup',        label: 'Date & Station'  },
  { id: 'dayShift',     label: 'Day Shift'       },
  { id: 'pumpReadings', label: 'Pump Readings'   },
  { id: 'tankReadings', label: 'Tank Dipstick'   },
  { id: 'deliveries',   label: 'Tank Deliveries' },
  { id: 'sales',        label: 'Sales'           },
  { id: 'payments',     label: 'Payments'        },
  { id: 'deposits',     label: 'Bank Deposits'   },
];

// ── Reusable small input ───────────────────────────────────────────────────────
function Field({ label, value, onChange, type = 'text', placeholder = '', readOnly, hint }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">{label}</label>
      <input
        type={type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        readOnly={readOnly}
        placeholder={placeholder}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ecana-maroon ${readOnly ? 'bg-slate-50 text-slate-400' : 'border-slate-300'}`}
      />
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepBar({ current, completedSteps = [], onNavigate }) {
  return (
    <div className="flex gap-1 mb-8 overflow-x-auto pb-1">
      {STEPS.map((s, i) => {
        const isCompleted = completedSteps.includes(s.id);
        const isCurrent = s.id === current;
        const isClickable = isCompleted && !isCurrent && !!onNavigate;
        return (
          <div key={s.id} className="flex items-center gap-1 shrink-0">
            <div
              onClick={isClickable ? () => onNavigate(s.id) : undefined}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                isCurrent ? 'bg-ecana-maroon text-white' :
                isCompleted ? 'bg-emerald-100 text-emerald-700 cursor-pointer hover:bg-emerald-200' :
                'bg-slate-100 text-slate-400'
              }`}
            >
              {isCompleted && !isCurrent && (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {s.label}
            </div>
            {i < STEPS.length - 1 && <div className="w-3 h-px bg-slate-200 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Save result banner ─────────────────────────────────────────────────────────
function SavedBanner({ results }) {
  if (!results.length) return null;
  const errors = results.filter((r) => r.error);
  const successes = results.filter((r) => !r.error);
  return (
    <div className="space-y-1 mt-3">
      {successes.map((r, i) => (
        <div key={i} className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">{r.label}: Saved ✓</div>
      ))}
      {errors.map((r, i) => (
        <div key={i} className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">{r.label}: {r.error}</div>
      ))}
    </div>
  );
}

// ── Existing data notice ───────────────────────────────────────────────────────
function ExistingNotice({ label }) {
  return (
    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {label}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function BackfillPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // PIN gate
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinChecking, setPinChecking] = useState(false);

  // Wizard state
  const [step, setStep] = useState('setup');
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState([]);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [isDone, setIsDone] = useState(false);

  // Setup
  const [date, setDate] = useState(yesterdayStr());
  const [stations, setStations] = useState([]);
  const [stationId, setStationId] = useState('');
  const [station, setStation] = useState(null);
  const [loadingStation, setLoadingStation] = useState(false);

  // Existing DB data for the selected date+station
  const [existingData, setExistingData] = useState(null);

  // Day shift
  const [shiftPrices, setShiftPrices] = useState({});
  const [selectedDispensers, setSelectedDispensers] = useState([]);

  // Pump readings
  const [pumpReadings, setPumpReadings] = useState({});

  // Tank readings
  const [tankReadings, setTankReadings] = useState({});

  // Deliveries – each item has fuelType, tankId, totalReceived, supplier, costPerLiter
  // _id: null = not yet saved; _id: '<mongoId>' = already in DB (skip on re-save)
  const [deliveries, setDeliveries] = useState([
    { _id: null, fuelType: 'PMS', tankId: '', totalReceived: '', supplier: '', costPerLiter: '' },
  ]);

  // Sales
  const [sales, setSales] = useState({});

  // Payments
  const [payments, setPayments] = useState({});

  // Bank deposits
  // _id: null = not yet saved; _id: '<mongoId>' = already in DB (skip on re-save)
  const [deposits, setDeposits] = useState([
    { _id: null, depositDate: '', amount: '', bankName: '', bankBranch: '', accountNumber: '', note: '' },
  ]);
  // Total already saved in DB for the wizard's operating date — refreshed after each save
  const [dbDepositsTotal, setDbDepositsTotal] = useState(0);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (session && session.user.role !== 'admin') router.push('/');
  }, [session, status]);

  useEffect(() => {
    fetch('/api/stations')
      .then((r) => r.json())
      .then((d) => setStations((d.stations || []).filter((s) => s.isActive !== false)));
  }, []);

  // Load station + existing data whenever stationId or date changes
  useEffect(() => {
    if (!stationId || !date) { setStation(null); setExistingData(null); return; }
    let cancelled = false;
    setLoadingStation(true);
    setExistingData(null);

    (async () => {
      try {
        // Load station details
        const stRes = await fetch(`/api/stations/${stationId}`);
        const stData = await stRes.json();
        if (cancelled) return;
        const st = stData.station;
        setStation(st);

        // Build empty initial states
        const dispensers = st?.dispensers || [];
        const fuelTypes = [...new Set(dispensers.map((d) => d.fuelType).filter(Boolean))];
        const initPrices = {};
        fuelTypes.forEach((ft) => {
          const cp = st?.currentPrices instanceof Map ? st.currentPrices.get(ft) : st?.currentPrices?.[ft];
          initPrices[ft] = cp ? String(cp) : '';
        });
        const initPR = {};
        dispensers.forEach((d) => { initPR[d.dispenserId] = { opening: '', closing: '', rtt: '0' }; });
        const initTR = {};
        (st?.tanks || []).forEach((t) => { initTR[t._id] = { opening: '', closing: '' }; });
        const initSA = {};
        dispensers.forEach((d) => { initSA[d.dispenserId] = { liters: '' }; });
        const initPA = {};
        dispensers.forEach((d) => { initPA[d.dispenserId] = { cash: '', pos: '' }; });

        // Fetch existing records for this date
        const exRes = await fetch(`/api/admin/backfill?stationId=${stationId}&date=${date}`);
        if (cancelled) return;
        const ex = exRes.ok ? await exRes.json() : {};

        // Apply existing data over empty state (pre-populates all fields)
        if (ex.dayShift) {
          const ds = ex.dayShift;
          const ep = {};
          for (const [k, v] of Object.entries(ds.pricesAtStart || {})) ep[k] = String(v);
          setShiftPrices(Object.keys(ep).length ? ep : initPrices);
          setSelectedDispensers(
            (ds.dispenserAssignments || []).map((a) => a.dispenserId)
              .filter((id) => dispensers.some((d) => d.dispenserId === id))
          );
        } else {
          setShiftPrices(initPrices);
          setSelectedDispensers(dispensers.filter((d) => d.isActive !== false).map((d) => d.dispenserId));
        }

        if (ex.meterReadings?.length) {
          const pr = { ...initPR };
          ex.meterReadings.forEach((r) => {
            pr[r.pumpId] = {
              opening: r.opening != null ? String(r.opening) : '',
              closing: r.closing != null ? String(r.closing) : '',
              rtt: r.rtt != null ? String(r.rtt) : '0',
            };
          });
          setPumpReadings(pr);
        } else {
          setPumpReadings(initPR);
        }

        if (ex.tankStockEntries?.length) {
          const tr = { ...initTR };
          ex.tankStockEntries.forEach((e) => {
            if (!tr[e.tankId]) tr[e.tankId] = { opening: '', closing: '' };
            if (e.period === 'opening') tr[e.tankId].opening = e.openingStock != null ? String(e.openingStock) : '';
            if (e.period === 'closing') tr[e.tankId].closing = e.closingStockMeasured != null ? String(e.closingStockMeasured) : '';
          });
          setTankReadings(tr);
        } else {
          setTankReadings(initTR);
        }

        if (ex.stockMovements?.length) {
          setDeliveries(
            ex.stockMovements.map((m) => ({
              _id: m._id ? String(m._id) : null,
              fuelType: m.fuelType || 'PMS',
              tankId: m.distribution?.[0]?.tankId || '',
              totalReceived: m.totalReceived != null ? String(m.totalReceived) : '',
              supplier: m.supplier || '',
              costPerLiter: m.costPerLiter != null ? String(m.costPerLiter) : '',
            }))
          );
        } else {
          setDeliveries([{ _id: null, fuelType: 'PMS', tankId: '', totalReceived: '', supplier: '', costPerLiter: '' }]);
        }

        if (ex.salesEntries?.length) {
          const sa = { ...initSA };
          ex.salesEntries.forEach((s) => { sa[s.dispenserId] = { liters: s.liters != null ? String(s.liters) : '' }; });
          setSales(sa);
        } else {
          setSales(initSA);
        }

        if (ex.paymentRecords?.length) {
          const pa = { ...initPA };
          ex.paymentRecords.forEach((p) => {
            pa[p.dispenserId] = {
              cash: p.cashReceived != null ? String(p.cashReceived) : '',
              pos: p.posReceived != null ? String(p.posReceived) : '',
            };
          });
          setPayments(pa);
        } else {
          setPayments(initPA);
        }

        if (ex.cashDeposits?.length) {
          setDeposits(ex.cashDeposits.map((d) => ({
            _id: d._id ? String(d._id) : null,
            depositDate: d.date ? new Date(d.date).toISOString().split('T')[0] : date,
            amount: d.amount != null ? String(d.amount) : '',
            bankName: d.bankName || '',
            bankBranch: d.bankBranch || '',
            accountNumber: d.accountNumber || '',
            note: d.adminNote || '',
          })));
        } else {
          setDeposits([{ _id: null, depositDate: date, amount: '', bankName: '', bankBranch: '', accountNumber: '', note: '' }]);
        }

        setExistingData(ex);
      } finally {
        if (!cancelled) setLoadingStation(false);
      }
    })();

    return () => { cancelled = true; };
  }, [stationId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill sales liters from pump net readings when entering the sales step
  useEffect(() => {
    if (step !== 'sales') return;
    setSales((prev) => {
      const updated = { ...prev };
      (station?.dispensers || [])
        .filter((d) => selectedDispensers.includes(d.dispenserId))
        .forEach((d) => {
          if (!updated[d.dispenserId] || updated[d.dispenserId].liters === '') {
            const pr = pumpReadings[d.dispenserId] || {};
            if (pr.opening !== '' && pr.closing !== '') {
              const net = Math.max(
                0,
                (parseFloat(pr.closing) || 0) - (parseFloat(pr.opening) || 0) - (parseFloat(pr.rtt) || 0)
              );
              if (net > 0) updated[d.dispenserId] = { liters: String(net.toFixed(2)) };
            }
          }
        });
      return updated;
    });
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync DB deposits total whenever existingData loads/changes
  useEffect(() => {
    if (existingData) {
      setDbDepositsTotal((existingData.cashDeposits || []).reduce((s, d) => s + (d.amount || 0), 0));
    }
  }, [existingData]);

  // ── PIN verification ─────────────────────────────────────────────────────────
  async function verifyPin() {
    if (!pinInput.trim()) { setPinError('Enter the backfill PIN.'); return; }
    setPinChecking(true); setPinError('');
    const res = await fetch('/api/admin/backfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinInput, type: '__ping__', stationId: 'ping', date: '2000-01-01' }),
    });
    setPinChecking(false);
    if (res.status === 401) { setPinError('Incorrect PIN. Try again.'); return; }
    if (res.status >= 500) { setPinError('Server error. Please try again.'); return; }
    // Any other non-401 response (400, 404, etc.) means the PIN was accepted
    setPinUnlocked(true);
  }

  // ── API call helper ──────────────────────────────────────────────────────────
  async function callBackfill(payload) {
    const res = await fetch('/api/admin/backfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinInput, stationId, date, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    return data;
  }

  // ── Refresh helpers ───────────────────────────────────────────────────────────
  async function fetchBackfillData() {
    if (!stationId || !date) return null;
    const res = await fetch(`/api/admin/backfill?stationId=${stationId}&date=${date}`);
    if (!res.ok) return null;
    return res.json();
  }

  async function refreshDbDepositsTotal() {
    const data = await fetchBackfillData();
    if (data) setDbDepositsTotal((data.cashDeposits || []).reduce((s, d) => s + (d.amount || 0), 0));
  }

  async function refreshDeposits() {
    const data = await fetchBackfillData();
    if (!data) return;
    if (data.cashDeposits?.length) {
      setDeposits(data.cashDeposits.map((d) => ({
        _id: d._id ? String(d._id) : null,
        depositDate: d.date ? new Date(d.date).toISOString().split('T')[0] : date,
        amount: d.amount != null ? String(d.amount) : '',
        bankName: d.bankName || '',
        bankBranch: d.bankBranch || '',
        accountNumber: d.accountNumber || '',
        note: d.adminNote || '',
      })));
    }
    setDbDepositsTotal((data.cashDeposits || []).reduce((s, d) => s + (d.amount || 0), 0));
  }

  async function refreshDeliveries() {
    const data = await fetchBackfillData();
    if (!data) return;
    if (data.stockMovements?.length) {
      setDeliveries(data.stockMovements.map((m) => ({
        _id: m._id ? String(m._id) : null,
        fuelType: m.fuelType || 'PMS',
        tankId: m.distribution?.[0]?.tankId || '',
        totalReceived: m.totalReceived != null ? String(m.totalReceived) : '',
        supplier: m.supplier || '',
        costPerLiter: m.costPerLiter != null ? String(m.costPerLiter) : '',
      })));
    }
  }

  async function deleteDeposit(depositId) {
    if (!window.confirm('Delete this deposit record? This cannot be undone.')) return;
    try {
      await callBackfill({ type: 'deleteDeposit', depositId });
      await refreshDeposits();
      setResults([{ label: 'Deposit deleted.' }]);
    } catch (e) {
      setResults([{ label: 'Delete failed', error: e.message }]);
    }
  }

  // ── Step: Save Day Shift ──────────────────────────────────────────────────────
  async function saveShift() {
    setSaving(true); setResults([]);
    try {
      await callBackfill({ type: 'dayShift', dispenserIds: selectedDispensers, prices: shiftPrices });
      setResults([{ label: 'Day Shift' }]);
      setCompletedSteps((p) => [...new Set([...p, 'dayShift'])]);
      setStep('pumpReadings');
    } catch (e) {
      setResults([{ label: 'Day Shift', error: e.message }]);
    } finally { setSaving(false); }
  }

  // ── Step: Save Pump Readings ──────────────────────────────────────────────────
  async function savePumpReadings() {
    setSaving(true); setResults([]);
    const dispensers = (station?.dispensers || []).filter((d) => selectedDispensers.includes(d.dispenserId));
    const res = [];
    for (const d of dispensers) {
      const r = pumpReadings[d.dispenserId] || {};
      if (r.opening === '') continue;
      try {
        await callBackfill({
          type: 'pumpReading',
          pumpId: d.dispenserId,
          pumpLabel: d.name,
          opening: r.opening,
          closing: r.closing !== '' ? r.closing : undefined,
          rtt: r.rtt || 0,
        });
        res.push({ label: d.name });
      } catch (e) {
        res.push({ label: d.name, error: e.message });
      }
    }
    setResults(res);
    if (!res.some((r) => r.error)) {
      setCompletedSteps((p) => [...new Set([...p, 'pumpReadings'])]);
      setStep('tankReadings');
    }
    setSaving(false);
  }

  // ── Step: Save Tank Readings ──────────────────────────────────────────────────
  async function saveTankReadings() {
    setSaving(true); setResults([]);
    const tanks = (station?.tanks || []).filter((t) => t.isActive !== false);
    const res = [];
    for (const t of tanks) {
      const r = tankReadings[t._id] || {};
      if (r.opening !== '') {
        try {
          await callBackfill({ type: 'tankReading', tankId: t._id, period: 'opening', stockValue: r.opening });
          res.push({ label: t.label + ' opening' });
        } catch (e) { res.push({ label: t.label + ' opening', error: e.message }); }
      }
      if (r.closing !== '') {
        try {
          await callBackfill({ type: 'tankReading', tankId: t._id, period: 'closing', stockValue: r.closing });
          res.push({ label: t.label + ' closing' });
        } catch (e) { res.push({ label: t.label + ' closing', error: e.message }); }
      }
    }
    setResults(res);
    if (!res.some((r) => r.error)) {
      setCompletedSteps((p) => [...new Set([...p, 'tankReadings'])]);
      setStep('deliveries');
    }
    setSaving(false);
  }

  // ── Step: Save Deliveries ─────────────────────────────────────────────────────
  async function saveDeliveries() {
    setSaving(true); setResults([]);
    const res = [];
    for (const d of deliveries) {
      if (d._id) continue; // already in DB — skip
      if (!d.totalReceived) continue;
      if (!d.tankId) {
        res.push({ label: d.fuelType + ' delivery', error: 'A receiving tank must be selected.' });
        continue;
      }
      try {
        await callBackfill({
          type: 'tankDelivery',
          fuelType: d.fuelType,
          totalReceived: d.totalReceived,
          distribution: [{ tankId: d.tankId, litres: Number(d.totalReceived) }],
          supplier: d.supplier,
          costPerLiter: d.costPerLiter || undefined,
        });
        const lbl = (station?.tanks || []).find((t) => String(t._id) === d.tankId)?.label || d.tankId;
        res.push({ label: d.fuelType + ' delivery → ' + lbl });
      } catch (e) { res.push({ label: d.fuelType + ' delivery', error: e.message }); }
    }
    setResults(res);
    if (!res.some((r) => r.error)) {
      setCompletedSteps((p) => [...new Set([...p, 'deliveries'])]);
      await refreshDeliveries();
      setStep('sales');
    }
    setSaving(false);
  }

  // ── Step: Save Sales ──────────────────────────────────────────────────────────
  async function saveSales() {
    setSaving(true); setResults([]);
    const dispensers = (station?.dispensers || []).filter((d) => selectedDispensers.includes(d.dispenserId));
    const res = [];
    for (const d of dispensers) {
      const s = sales[d.dispenserId] || {};
      if (s.liters === '') continue;
      try {
        await callBackfill({ type: 'sale', dispenserId: d.dispenserId, liters: s.liters });
        res.push({ label: d.name });
      } catch (e) { res.push({ label: d.name, error: e.message }); }
    }
    setResults(res);
    if (!res.some((r) => r.error)) {
      setCompletedSteps((p) => [...new Set([...p, 'sales'])]);
      setStep('payments');
    }
    setSaving(false);
  }

  // ── Step: Save Payments ───────────────────────────────────────────────────────
  async function savePayments() {
    setSaving(true); setResults([]);
    const dispensers = (station?.dispensers || []).filter((d) => selectedDispensers.includes(d.dispenserId));
    const res = [];
    for (const d of dispensers) {
      const p = payments[d.dispenserId] || {};
      if (p.cash === '' && p.pos === '') continue;
      try {
        await callBackfill({
          type: 'payment',
          dispenserId: d.dispenserId,
          cashReceived: p.cash || 0,
          posReceived: p.pos || 0,
        });
        res.push({ label: d.name });
      } catch (e) { res.push({ label: d.name, error: e.message }); }
    }
    setResults(res);
    if (!res.some((r) => r.error)) {
      setCompletedSteps((p) => [...new Set([...p, 'payments'])]);
      setStep('deposits');
    }
    setSaving(false);
  }

  // ── Step: Save Deposits ───────────────────────────────────────────────────────
  async function saveDeposits() {
    setSaving(true); setResults([]);
    const res = [];
    for (const d of deposits) {
      if (d._id) continue; // already in DB — skip to prevent duplicates
      if (!d.amount || !d.bankName || !d.accountNumber) continue;
      try {
        await callBackfill({
          type: 'bankDeposit',
          amount: d.amount,
          bankName: d.bankName,
          bankBranch: d.bankBranch,
          accountNumber: d.accountNumber,
          note: d.note,
          depositDate: d.depositDate || date,
        });
        res.push({ label: d.bankName + ' — ₦' + fmtN(d.amount) });
      } catch (e) { res.push({ label: d.bankName, error: e.message }); }
    }
    setResults(res);
    // Reload deposits from DB so saved entries get their _id (prevents re-save duplicates)
    await refreshDeposits();
    if (!res.some((r) => r.error) && res.length > 0) {
      setCompletedSteps((p) => [...new Set([...p, 'deposits'])]);
    }
    setSaving(false);
  }

  if (status === 'loading') return <Loading />;
  if (!session || session.user.role !== 'admin') return null;

  // ── PIN GATE ───────────────────────────────────────────────────────────────────
  if (!pinUnlocked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-ecana-maroon/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-ecana-maroon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900">Historical Data Entry</h1>
            <p className="text-sm text-slate-500 mt-1">This page requires a special PIN to access.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Backfill PIN</label>
              <input
                type="password"
                autoFocus
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && verifyPin()}
                placeholder="Enter PIN"
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-ecana-maroon text-center tracking-widest text-lg"
              />
            </div>
            {pinError && <p className="text-sm text-red-600 text-center">{pinError}</p>}
            <button
              onClick={verifyPin}
              disabled={pinChecking}
              className="w-full py-3 bg-ecana-maroon text-white rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-50"
            >
              {pinChecking ? 'Verifying…' : 'Unlock'}
            </button>
            <button
              onClick={() => router.push('/admin')}
              className="w-full py-2 text-sm text-slate-400 hover:text-slate-600"
            >
              ← Back to Admin
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Derived values ─────────────────────────────────────────────────────────────

  // Per-tank net litres sold derived from pump readings
  const tankNetSold = {};
  (station?.dispensers || []).forEach((d) => {
    const pr = pumpReadings[d.dispenserId] || {};
    if (pr.opening !== '' && pr.closing !== '') {
      const net = Math.max(
        0,
        (parseFloat(pr.closing) || 0) - (parseFloat(pr.opening) || 0) - (parseFloat(pr.rtt) || 0)
      );
      if (d.tankId) tankNetSold[d.tankId] = (tankNetSold[d.tankId] || 0) + net;
    }
  });

  // tankId → human-readable label (used in save functions and render)
  const tankLabelById = {};
  (station?.tanks || []).forEach((t) => { tankLabelById[String(t._id)] = t.label; });

  // Total cash and POS from the payments step (used in deposits step as reference)
  const totalCashFromPayments = (station?.dispensers || [])
    .filter((d) => selectedDispensers.includes(d.dispenserId))
    .reduce((sum, d) => sum + (parseFloat(payments[d.dispenserId]?.cash) || 0), 0);
  const totalPosFromPayments = (station?.dispensers || [])
    .filter((d) => selectedDispensers.includes(d.dispenserId))
    .reduce((sum, d) => sum + (parseFloat(payments[d.dispenserId]?.pos) || 0), 0);

  // Existing data flags
  const hasExistingShift = !!existingData?.dayShift;
  const hasExistingPumps = !!existingData?.meterReadings?.length;
  const hasExistingTanks = !!existingData?.tankStockEntries?.length;
  const hasExistingDeliveries = !!existingData?.stockMovements?.length;
  const hasExistingSales = !!existingData?.salesEntries?.length;
  const hasExistingPayments = !!existingData?.paymentRecords?.length;
  const hasExistingDeposits = !!existingData?.cashDeposits?.length;
  const hasAnyExisting = hasExistingShift || hasExistingPumps || hasExistingTanks ||
    hasExistingDeliveries || hasExistingSales || hasExistingPayments || hasExistingDeposits;

  // ── WIZARD ─────────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Historical Data Entry</h1>
          <p className="text-sm text-slate-500 mt-1">Enter past records for any station and date.</p>
        </div>
        <button
          onClick={() => router.push('/admin')}
          className="text-sm text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:border-slate-400"
        >
          ← Admin
        </button>
      </div>

      <StepBar current={step} completedSteps={completedSteps} onNavigate={setStep} />

      {/* ── STEP: Setup ── */}
      {step === 'setup' && (
        <div className="max-w-lg space-y-5">
          <Field label="Date" type="date" value={date} onChange={(v) => { setDate(v); }} />
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Station</label>
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ecana-maroon"
            >
              <option value="">Select station…</option>
              {stations.map((s) => (
                <option key={s._id} value={s._id}>{s.name} — {s.location}</option>
              ))}
            </select>
          </div>
          {loadingStation && <p className="text-sm text-slate-400">Loading station data…</p>}
          {station && !loadingStation && (
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-1">
              <p><span className="font-semibold">Station:</span> {station.name}</p>
              <p><span className="font-semibold">Pumps:</span> {(station.dispensers || []).filter((d) => d.isActive !== false).length}</p>
              <p><span className="font-semibold">Tanks:</span> {(station.tanks || []).filter((t) => t.isActive !== false).length}</p>
            </div>
          )}
          {hasAnyExisting && !loadingStation && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold">Existing records found for {date}</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  All fields have been pre-filled. Saving will overwrite existing data.
                  {hasExistingShift && ' · Shift'}
                  {hasExistingPumps && ' · Pump readings'}
                  {hasExistingTanks && ' · Tank dipstick'}
                  {hasExistingDeliveries && ' · Deliveries'}
                  {hasExistingSales && ' · Sales'}
                  {hasExistingPayments && ' · Payments'}
                  {hasExistingDeposits && ' · Deposits'}
                </p>
              </div>
            </div>
          )}
          <button
            disabled={!stationId || !date || !station || loadingStation}
            onClick={() => setStep('dayShift')}
            className="px-6 py-2.5 bg-ecana-maroon text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-40"
          >
            Continue →
          </button>
        </div>
      )}

      {/* ── STEP: Day Shift ── */}
      {step === 'dayShift' && (
        <div className="max-w-xl space-y-5">
          <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{station?.name}</span> · {date}
          </div>
          {hasExistingShift && <ExistingNotice label="Existing day shift found — pre-filled. Saving will overwrite." />}

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Active Pumps</p>
            <div className="space-y-1.5">
              {(station?.dispensers || []).filter((d) => d.isActive !== false).map((d) => (
                <label key={d.dispenserId} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedDispensers.includes(d.dispenserId)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedDispensers((p) => [...p, d.dispenserId]);
                      else setSelectedDispensers((p) => p.filter((x) => x !== d.dispenserId));
                    }}
                    className="rounded border-gray-300 text-ecana-maroon h-4 w-4"
                  />
                  <span className="text-sm text-slate-700">{d.name} <span className="text-slate-400 text-xs">({d.fuelType})</span></span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Prices on This Day (₦/L)</p>
            <div className="grid grid-cols-2 gap-3">
              {Object.keys(shiftPrices).map((ft) => (
                <Field
                  key={ft}
                  label={ft}
                  type="number"
                  value={shiftPrices[ft]}
                  onChange={(v) => setShiftPrices((p) => ({ ...p, [ft]: v }))}
                  placeholder="0.00"
                />
              ))}
            </div>
          </div>

          <SavedBanner results={results} />
          <div className="flex gap-2">
            <button onClick={() => setStep('setup')} className="px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-500 hover:border-slate-400">← Back</button>
            <button onClick={saveShift} disabled={saving || !selectedDispensers.length} className="px-6 py-2.5 bg-ecana-maroon text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-40">
              {saving ? 'Saving…' : 'Save Day Shift →'}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: Pump Readings ── */}
      {step === 'pumpReadings' && (
        <div className="max-w-2xl space-y-4">
          <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{station?.name}</span> · {date}
          </div>
          {hasExistingPumps && (
            <ExistingNotice label={`${existingData.meterReadings.length} pump reading(s) found — pre-filled. Saving will overwrite.`} />
          )}
          <p className="text-xs text-slate-400">Leave Opening blank to skip a pump. RTT = test discharge litres.</p>

          {(station?.dispensers || []).filter((d) => selectedDispensers.includes(d.dispenserId)).map((d) => {
            const pr = pumpReadings[d.dispenserId] || {};
            const netSold = pr.opening !== '' && pr.closing !== ''
              ? Math.max(0, (parseFloat(pr.closing) || 0) - (parseFloat(pr.opening) || 0) - (parseFloat(pr.rtt) || 0))
              : null;
            return (
              <div key={d.dispenserId} className="border border-slate-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-slate-800 mb-3">
                  {d.name}{' '}
                  <span className="text-xs text-slate-400 font-normal">
                    ({d.fuelType}{d.tankId ? ' · ' + (tankLabelById[d.tankId] || d.tankId) : ''})
                  </span>
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Opening" type="number" value={pr.opening || ''}
                    onChange={(v) => setPumpReadings((p) => ({ ...p, [d.dispenserId]: { ...p[d.dispenserId], opening: v } }))}
                    placeholder="e.g. 45250" />
                  <Field label="Closing" type="number" value={pr.closing || ''}
                    onChange={(v) => setPumpReadings((p) => ({ ...p, [d.dispenserId]: { ...p[d.dispenserId], closing: v } }))}
                    placeholder="e.g. 45480" />
                  <Field label="RTT" type="number" value={pr.rtt || '0'}
                    onChange={(v) => setPumpReadings((p) => ({ ...p, [d.dispenserId]: { ...p[d.dispenserId], rtt: v } }))}
                    placeholder="0" />
                </div>
                {netSold != null && (
                  <p className="text-xs text-emerald-600 mt-2 font-medium">
                    Net sold: {netSold.toFixed(2)} L
                    {d.tankId && <span className="text-slate-400 font-normal"> → {tankLabelById[d.tankId] || d.tankId}</span>}
                  </p>
                )}
              </div>
            );
          })}

          <SavedBanner results={results} />
          <div className="flex gap-2">
            <button onClick={() => setStep('dayShift')} className="px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-500 hover:border-slate-400">← Back</button>
            <button onClick={savePumpReadings} disabled={saving} className="px-6 py-2.5 bg-ecana-maroon text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-40">
              {saving ? 'Saving…' : 'Save Readings →'}
            </button>
            <button onClick={() => setStep('tankReadings')} className="px-4 py-2 text-sm text-slate-500 hover:text-ecana-maroon">Skip →</button>
          </div>
        </div>
      )}

      {/* ── STEP: Tank Readings ── */}
      {step === 'tankReadings' && (
        <div className="max-w-xl space-y-4">
          <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{station?.name}</span> · {date}
          </div>
          {hasExistingTanks && (
            <ExistingNotice label={`${existingData.tankStockEntries.length} tank entry/entries found — pre-filled. Saving will overwrite.`} />
          )}

          {(station?.tanks || []).filter((t) => t.isActive !== false).map((t) => {
            const pumpsSelling = (station?.dispensers || []).filter(
              (d) => d.tankId === t._id && selectedDispensers.includes(d.dispenserId)
            );
            const soldFromPumps = tankNetSold[t._id];
            const tr = tankReadings[t._id] || {};
            const opening = parseFloat(tr.opening) || 0;
            const closing = parseFloat(tr.closing) || 0;
            const dipDiff = tr.opening !== '' && tr.closing !== '' ? opening - closing : null;
            const variance = dipDiff != null && soldFromPumps != null ? dipDiff - soldFromPumps : null;
            return (
              <div key={t._id} className="border border-slate-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-slate-800 mb-1">
                  {t.label}{' '}
                  <span className="text-xs text-slate-400 font-normal">({t.product} · {t.capacity?.toLocaleString()}L cap)</span>
                </p>
                {pumpsSelling.length > 0 && (
                  <p className="text-xs text-slate-400 mb-2">Pumps: {pumpsSelling.map((d) => d.name).join(', ')}</p>
                )}
                {soldFromPumps != null && (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 mb-3">
                    <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs text-blue-700 font-medium">Litres sold from pumps: {soldFromPumps.toFixed(2)} L</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Opening Dipstick (L)" type="number" value={tr.opening || ''}
                    onChange={(v) => setTankReadings((p) => ({ ...p, [t._id]: { ...p[t._id], opening: v } }))}
                    placeholder="e.g. 12000" />
                  <Field label="Closing Dipstick (L)" type="number" value={tr.closing || ''}
                    onChange={(v) => setTankReadings((p) => ({ ...p, [t._id]: { ...p[t._id], closing: v } }))}
                    placeholder="e.g. 9500" />
                </div>
                {variance != null && (
                  <p className={`text-xs mt-2 font-medium ${Math.abs(variance) < 50 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    Dip diff: {dipDiff.toFixed(2)} L · Pump sold: {soldFromPumps.toFixed(2)} L · Variance: {variance > 0 ? '+' : ''}{variance.toFixed(2)} L
                  </p>
                )}
              </div>
            );
          })}

          <SavedBanner results={results} />
          <div className="flex gap-2">
            <button onClick={() => setStep('pumpReadings')} className="px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-500 hover:border-slate-400">← Back</button>
            <button onClick={saveTankReadings} disabled={saving} className="px-6 py-2.5 bg-ecana-maroon text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-40">
              {saving ? 'Saving…' : 'Save Tank Readings →'}
            </button>
            <button onClick={() => setStep('deliveries')} className="px-4 py-2 text-sm text-slate-500 hover:text-ecana-maroon">Skip →</button>
          </div>
        </div>
      )}

      {/* ── STEP: Deliveries ── */}
      {step === 'deliveries' && (
        <div className="max-w-xl space-y-4">
          <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{station?.name}</span> · {date}
          </div>
          {hasExistingDeliveries && (
            <ExistingNotice label={`${existingData.stockMovements.length} delivery record(s) found — pre-filled. Saving will add new records.`} />
          )}
          <p className="text-xs text-slate-400">Record fuel deliveries received on this date. Select the receiving tank.</p>

          {deliveries.map((d, i) => {
            const matchingTanks = (station?.tanks || []).filter(
              (t) => t.isActive !== false && t.product === d.fuelType
            );
            return (
              <div key={i} className={`border rounded-xl p-4 space-y-3 ${d._id ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">
                    Delivery #{i + 1}
                    {d._id && <span className="ml-2 text-xs font-normal text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">Saved</span>}
                  </p>
                  {!d._id && deliveries.length > 1 && (
                    <button onClick={() => setDeliveries((p) => p.filter((_, j) => j !== i))}
                      className="text-xs text-red-500 hover:underline">Remove</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Fuel Type</label>
                    <select
                      value={d.fuelType}
                      disabled={!!d._id}
                      onChange={(e) => setDeliveries((p) => p.map((x, j) => j === i ? { ...x, fuelType: e.target.value, tankId: '' } : x))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ecana-maroon disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      {['PMS', 'AGO', 'DPK', 'LPG'].map((ft) => <option key={ft}>{ft}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                      Receiving Tank <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={d.tankId}
                      disabled={!!d._id}
                      onChange={(e) => setDeliveries((p) => p.map((x, j) => j === i ? { ...x, tankId: e.target.value } : x))}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ecana-maroon disabled:bg-slate-50 disabled:text-slate-400 ${!d.tankId && !d._id ? 'border-amber-300' : 'border-slate-300'}`}
                    >
                      <option value="">— Select tank (required) —</option>
                      {matchingTanks.map((t) => (
                        <option key={t._id} value={t._id}>{t.label} ({t.capacity?.toLocaleString()}L)</option>
                      ))}
                    </select>
                    {!d.tankId && !d._id && <p className="text-xs text-amber-600 mt-1">Tank selection is required to save this delivery.</p>}
                  </div>
                  <Field label="Total Received (L)" type="number" value={d.totalReceived}
                    readOnly={!!d._id}
                    onChange={(v) => setDeliveries((p) => p.map((x, j) => j === i ? { ...x, totalReceived: v } : x))}
                    placeholder="e.g. 33000" />
                  <Field label="Cost per Litre (₦)" type="number" value={d.costPerLiter}
                    readOnly={!!d._id}
                    onChange={(v) => setDeliveries((p) => p.map((x, j) => j === i ? { ...x, costPerLiter: v } : x))}
                    placeholder="Optional" />
                  <Field label="Supplier" value={d.supplier}
                    readOnly={!!d._id}
                    onChange={(v) => setDeliveries((p) => p.map((x, j) => j === i ? { ...x, supplier: v } : x))}
                    placeholder="Optional" />
                </div>
                {d.totalReceived && d.costPerLiter && (
                  <p className="text-xs text-emerald-600 font-medium">
                    Total cost: ₦{fmtN(parseFloat(d.totalReceived) * parseFloat(d.costPerLiter))}
                  </p>
                )}
              </div>
            );
          })}

          <button
            onClick={() => setDeliveries((p) => [...p, { _id: null, fuelType: 'PMS', tankId: '', totalReceived: '', supplier: '', costPerLiter: '' }])}
            className="text-sm text-ecana-maroon hover:underline"
          >
            + Add Another Delivery
          </button>

          <SavedBanner results={results} />
          <div className="flex gap-2">
            <button onClick={() => setStep('tankReadings')} className="px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-500 hover:border-slate-400">← Back</button>
            <button onClick={saveDeliveries} disabled={saving} className="px-6 py-2.5 bg-ecana-maroon text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-40">
              {saving ? 'Saving…' : 'Save & Continue →'}
            </button>
            <button onClick={() => setStep('sales')} className="px-4 py-2 text-sm text-slate-500 hover:text-ecana-maroon">Skip →</button>
          </div>
        </div>
      )}

      {/* ── STEP: Sales ── */}
      {step === 'sales' && (
        <div className="max-w-xl space-y-4">
          <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{station?.name}</span> · {date}
          </div>
          {hasExistingSales && (
            <ExistingNotice label={`${existingData.salesEntries.length} sales entry/entries found — pre-filled. Saving will overwrite.`} />
          )}
          <p className="text-xs text-slate-400">Litres are auto-filled from pump meter net where available. Adjust if needed.</p>

          {(station?.dispensers || []).filter((d) => selectedDispensers.includes(d.dispenserId)).map((d) => {
            const pr = pumpReadings[d.dispenserId] || {};
            const pumpNet = pr.opening !== '' && pr.closing !== ''
              ? Math.max(0, (parseFloat(pr.closing) || 0) - (parseFloat(pr.opening) || 0) - (parseFloat(pr.rtt) || 0))
              : null;
            const price = parseFloat(shiftPrices[d.fuelType]) || 0;
            const liters = parseFloat(sales[d.dispenserId]?.liters) || 0;
            const expectedAmt = liters * price;
            return (
              <div key={d.dispenserId} className="border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <p className="text-sm font-semibold text-slate-800">
                    {d.name} <span className="text-xs text-slate-400 font-normal">({d.fuelType})</span>
                  </p>
                  {pumpNet != null && (
                    <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">Meter net: {pumpNet.toFixed(2)} L</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <Field
                    label="Litres Sold"
                    type="number"
                    value={sales[d.dispenserId]?.liters || ''}
                    onChange={(v) => setSales((p) => ({ ...p, [d.dispenserId]: { liters: v } }))}
                    placeholder={pumpNet != null ? pumpNet.toFixed(2) : '0'}
                  />
                  <div className="pb-0.5">
                    <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide font-semibold">Expected Amount</p>
                    <p className={`text-sm font-semibold ${expectedAmt > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {expectedAmt > 0 ? '₦' + fmtN(expectedAmt) : '—'}
                    </p>
                    {price > 0 && liters > 0 && (
                      <p className="text-xs text-slate-400">@ ₦{fmtN(price)}/L</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <SavedBanner results={results} />
          <div className="flex gap-2">
            <button onClick={() => setStep('deliveries')} className="px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-500 hover:border-slate-400">← Back</button>
            <button onClick={saveSales} disabled={saving} className="px-6 py-2.5 bg-ecana-maroon text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-40">
              {saving ? 'Saving…' : 'Save Sales →'}
            </button>
            <button onClick={() => setStep('payments')} className="px-4 py-2 text-sm text-slate-500 hover:text-ecana-maroon">Skip →</button>
          </div>
        </div>
      )}

      {/* ── STEP: Payments ── */}
      {step === 'payments' && (
        <div className="max-w-xl space-y-4">
          <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{station?.name}</span> · {date}
          </div>
          {hasExistingPayments && (
            <ExistingNotice label={`${existingData.paymentRecords.length} payment record(s) found — pre-filled. Saving will overwrite.`} />
          )}

          {(station?.dispensers || []).filter((d) => selectedDispensers.includes(d.dispenserId)).map((d) => {
            const price = parseFloat(shiftPrices[d.fuelType]) || 0;
            const liters = parseFloat(sales[d.dispenserId]?.liters) || 0;
            const expectedAmt = liters * price;
            const cash = parseFloat(payments[d.dispenserId]?.cash) || 0;
            const pos = parseFloat(payments[d.dispenserId]?.pos) || 0;
            const totalReceived = cash + pos;
            const shortfall = expectedAmt > 0 && totalReceived > 0 ? expectedAmt - totalReceived : null;
            return (
              <div key={d.dispenserId} className="border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <p className="text-sm font-semibold text-slate-800">
                    {d.name} <span className="text-xs text-slate-400 font-normal">({d.fuelType})</span>
                  </p>
                  {expectedAmt > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Expected</p>
                      <p className="text-sm font-semibold text-slate-700">₦{fmtN(expectedAmt)}</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Cash (₦)" type="number" value={payments[d.dispenserId]?.cash || ''}
                    onChange={(v) => setPayments((p) => ({ ...p, [d.dispenserId]: { ...p[d.dispenserId], cash: v } }))}
                    placeholder="0" />
                  <Field label="POS (₦)" type="number" value={payments[d.dispenserId]?.pos || ''}
                    onChange={(v) => setPayments((p) => ({ ...p, [d.dispenserId]: { ...p[d.dispenserId], pos: v } }))}
                    placeholder="0" />
                </div>
                {totalReceived > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      Total: <span className="font-semibold text-slate-700">₦{fmtN(totalReceived)}</span>
                    </span>
                    {shortfall != null && (
                      <span className={shortfall > 0.01 ? 'text-red-600 font-medium' : shortfall < -0.01 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}>
                        {shortfall > 0.01 ? 'Shortfall: ₦' + fmtN(shortfall) : shortfall < -0.01 ? 'Excess: ₦' + fmtN(-shortfall) : 'Balanced ✓'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <SavedBanner results={results} />
          <div className="flex gap-2">
            <button onClick={() => setStep('sales')} className="px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-500 hover:border-slate-400">← Back</button>
            <button onClick={savePayments} disabled={saving} className="px-6 py-2.5 bg-ecana-maroon text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-40">
              {saving ? 'Saving…' : 'Save Payments →'}
            </button>
            <button onClick={() => setStep('deposits')} className="px-4 py-2 text-sm text-slate-500 hover:text-ecana-maroon">Skip →</button>
          </div>
        </div>
      )}

      {/* ── DONE SCREEN ── */}
      {isDone && (
        <div className="max-w-md space-y-5">
          <div className="text-center space-y-3">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Backfill Complete</h2>
              <p className="text-sm text-slate-500 mt-1">{station?.name} · {date}</p>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5 text-sm">
            {completedSteps.includes('dayShift') && <p className="text-emerald-700">✓ Day Shift</p>}
            {completedSteps.includes('pumpReadings') && <p className="text-emerald-700">✓ Pump Readings</p>}
            {completedSteps.includes('tankReadings') && <p className="text-emerald-700">✓ Tank Dipstick</p>}
            {completedSteps.includes('deliveries') && <p className="text-emerald-700">✓ Tank Deliveries</p>}
            {completedSteps.includes('sales') && <p className="text-emerald-700">✓ Sales</p>}
            {completedSteps.includes('payments') && <p className="text-emerald-700">✓ Payments</p>}
            {completedSteps.includes('deposits') && <p className="text-emerald-700">✓ Bank Deposits</p>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setIsDone(false);
                setCompletedSteps([]);
                setStep('setup');
                setDate(yesterdayStr());
                setStationId('');
                setStation(null);
                setExistingData(null);
                setResults([]);
                setDbDepositsTotal(0);
                setDeposits([{ _id: null, depositDate: '', amount: '', bankName: '', bankBranch: '', accountNumber: '', note: '' }]);
                setDeliveries([{ _id: null, fuelType: 'PMS', tankId: '', totalReceived: '', supplier: '', costPerLiter: '' }]);
              }}
              className="flex-1 py-2.5 bg-ecana-maroon text-white text-sm font-semibold rounded-xl hover:opacity-90"
            >
              Enter Another Day
            </button>
            <button onClick={() => router.push('/admin')} className="px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-500 hover:border-slate-400">
              Back to Admin
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: Bank Deposits ── */}
      {!isDone && step === 'deposits' && (
        <div className="max-w-xl space-y-4">
          <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{station?.name}</span> · Operating day: {date}
          </div>
          {hasExistingDeposits && (
            <ExistingNotice label={`${existingData.cashDeposits.length} deposit(s) found — pre-filled. Saving will add new records.`} />
          )}

          {totalCashFromPayments > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Cash Collections — Operating Day: {date}</p>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="text-blue-800">Cash: <span className="font-semibold">₦{fmtN(totalCashFromPayments)}</span></span>
                {totalPosFromPayments > 0 && (
                  <span className="text-blue-800">POS: <span className="font-semibold">₦{fmtN(totalPosFromPayments)}</span></span>
                )}
              </div>
              {dbDepositsTotal > 0 && (
                <p className="text-xs text-slate-600">
                  Already deposited: <span className="font-semibold text-slate-700">₦{fmtN(dbDepositsTotal)}</span>
                  {' · '}Remaining:{' '}
                  <span className={`font-semibold ${totalCashFromPayments - dbDepositsTotal <= 0.01 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    ₦{fmtN(Math.max(0, totalCashFromPayments - dbDepositsTotal))}
                  </span>
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-slate-400">
            Each deposit can have its own banking date — the date the cash was physically taken to the bank, which may differ from the operating date.
          </p>

          {deposits.map((d, i) => {
            // Only count unsaved previous deposits toward the session accumulated total
            const accumulatedBefore = deposits.slice(0, i).reduce((s, dep) => dep._id ? s : s + (parseFloat(dep.amount) || 0), 0);
            const remaining = Math.max(0, totalCashFromPayments - dbDepositsTotal - accumulatedBefore);
            const thisAmt = parseFloat(d.amount) || 0;
            return (
              <div key={i} className={`border rounded-xl p-4 space-y-3 ${d._id ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">
                    Deposit #{i + 1}
                    {d._id && <span className="ml-2 text-xs font-normal text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">Saved</span>}
                  </p>
                  {d._id ? (
                    <button onClick={() => deleteDeposit(d._id)}
                      className="text-xs text-red-500 hover:underline">Delete</button>
                  ) : (
                    <button onClick={() => setDeposits((p) => p.filter((_, j) => j !== i))}
                      className="text-xs text-red-500 hover:underline">Remove</button>
                  )}
                </div>

                <Field
                  label="Date of Deposit"
                  type="date"
                  value={d.depositDate || date}
                  readOnly={!!d._id}
                  onChange={(v) => setDeposits((p) => p.map((x, j) => j === i ? { ...x, depositDate: v } : x))}
                  hint="When the money was physically taken to the bank (can differ from the operating date)"
                />

                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Amount (₦)"
                    type="number"
                    value={d.amount}
                    readOnly={!!d._id}
                    onChange={(v) => setDeposits((p) => p.map((x, j) => j === i ? { ...x, amount: v } : x))}
                    placeholder={remaining > 0 ? remaining.toFixed(2) : 'e.g. 500000'}
                  />
                  <Field label="Bank Name" value={d.bankName}
                    readOnly={!!d._id}
                    onChange={(v) => setDeposits((p) => p.map((x, j) => j === i ? { ...x, bankName: v } : x))}
                    placeholder="e.g. First Bank" />
                  <Field label="Account Number" value={d.accountNumber}
                    readOnly={!!d._id}
                    onChange={(v) => setDeposits((p) => p.map((x, j) => j === i ? { ...x, accountNumber: v } : x))}
                    placeholder="0123456789" />
                  <Field label="Branch (optional)" value={d.bankBranch}
                    readOnly={!!d._id}
                    onChange={(v) => setDeposits((p) => p.map((x, j) => j === i ? { ...x, bankBranch: v } : x))}
                    placeholder="e.g. Lagos Island" />
                </div>
                <Field label="Note (optional)" value={d.note}
                  readOnly={!!d._id}
                  onChange={(v) => setDeposits((p) => p.map((x, j) => j === i ? { ...x, note: v } : x))}
                  placeholder="Any additional info" />

                {totalCashFromPayments > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Cash collected ({date})</span>
                      <span className="font-semibold text-slate-800">₦{fmtN(totalCashFromPayments)}</span>
                    </div>
                    {dbDepositsTotal > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <span>Already deposited (in database)</span>
                        <span>–₦{fmtN(dbDepositsTotal)}</span>
                      </div>
                    )}
                    {accumulatedBefore > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <span>Previous deposits (this session)</span>
                        <span>–₦{fmtN(accumulatedBefore)}</span>
                      </div>
                    )}
                    <div className={`flex justify-between font-semibold border-t border-slate-200 pt-1.5 ${remaining < 0.01 ? 'text-emerald-700' : 'text-amber-700'}`}>
                      <span>Remaining to deposit</span>
                      <span>₦{fmtN(remaining)}</span>
                    </div>
                    {thisAmt > 0 && (
                      <div className={`text-center font-semibold border-t border-slate-200 pt-1.5 ${
                        Math.abs(thisAmt - remaining) < 1
                          ? 'text-emerald-700'
                          : thisAmt > remaining
                            ? 'text-amber-600'
                            : 'text-red-600'
                      }`}>
                        {Math.abs(thisAmt - remaining) < 1
                          ? '✓ Balanced — this deposit covers the remaining amount'
                          : thisAmt > remaining
                            ? `₦${fmtN(thisAmt - remaining)} over remaining balance`
                            : `₦${fmtN(remaining - thisAmt)} still remaining after this deposit`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={() => setDeposits((p) => [...p, { _id: null, depositDate: date, amount: '', bankName: '', bankBranch: '', accountNumber: '', note: '' }])}
            className="text-sm text-ecana-maroon hover:underline"
          >
            + Add Another Deposit
          </button>

          <SavedBanner results={results} />
          <div className="flex gap-2">
            <button onClick={() => setStep('payments')} className="px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-500 hover:border-slate-400">← Back</button>
            <button onClick={saveDeposits} disabled={saving} className="px-6 py-2.5 bg-ecana-maroon text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-40">
              {saving ? 'Saving…' : 'Save Deposits'}
            </button>
            <button
              onClick={() => { setCompletedSteps((p) => [...new Set([...p, 'deposits'])]); setIsDone(true); }}
              className="px-4 py-2 text-sm text-slate-500 hover:text-ecana-maroon"
            >
              Finish ✓
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
