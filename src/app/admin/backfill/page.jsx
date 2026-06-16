'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Loading from '@/components/Loading';

// ── Helpers ────────────────────────────────────────────────────────────────────
function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}
function fmtN(n) {
  if (n == null || n === '') return '—';
  return Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STEPS = [
  { id: 'setup',        label: 'Date & Station'    },
  { id: 'dayShift',     label: 'Day Shift'         },
  { id: 'pumpReadings', label: 'Pump Readings'     },
  { id: 'tankReadings', label: 'Tank Dipstick'     },
  { id: 'deliveries',   label: 'Tank Deliveries'   },
  { id: 'sales',        label: 'Sales'             },
  { id: 'payments',     label: 'Payments'          },
  { id: 'deposits',     label: 'Bank Deposits'     },
];

// ── Reusable small input ───────────────────────────────────────────────────────
function Field({ label, value, onChange, type = 'text', placeholder = '', readOnly }) {
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
    </div>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepBar({ current }) {
  return (
    <div className="flex gap-1 mb-8 overflow-x-auto pb-1">
      {STEPS.map((s, i) => (
        <div key={s.id} className={`flex items-center gap-1 shrink-0`}>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            s.id === current ? 'bg-ecana-maroon text-white' :
            STEPS.findIndex(x => x.id === current) > i ? 'bg-emerald-100 text-emerald-700' :
            'bg-slate-100 text-slate-400'
          }`}>
            {STEPS.findIndex(x => x.id === current) > i && (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {s.label}
          </div>
          {i < STEPS.length - 1 && <div className="w-3 h-px bg-slate-200 shrink-0" />}
        </div>
      ))}
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

  // Setup
  const [date, setDate] = useState(todayStr());
  const [stations, setStations] = useState([]);
  const [stationId, setStationId] = useState('');
  const [station, setStation] = useState(null);
  const [loadingStation, setLoadingStation] = useState(false);

  // Day shift
  const [shiftPrices, setShiftPrices] = useState({});
  const [selectedDispensers, setSelectedDispensers] = useState([]);

  // Pump readings
  const [pumpReadings, setPumpReadings] = useState({});

  // Tank readings
  const [tankReadings, setTankReadings] = useState({});

  // Deliveries
  const [deliveries, setDeliveries] = useState([{ fuelType: 'PMS', totalReceived: '', supplier: '', costPerLiter: '' }]);

  // Sales
  const [sales, setSales] = useState({});

  // Payments
  const [payments, setPayments] = useState({});

  // Bank deposits
  const [deposits, setDeposits] = useState([{ amount: '', bankName: '', bankBranch: '', accountNumber: '', note: '' }]);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (session && session.user.role !== 'admin') router.push('/');
  }, [session, status]);

  useEffect(() => {
    fetch('/api/stations')
      .then((r) => r.json())
      .then((d) => setStations((d.stations || []).filter((s) => s.isActive !== false)));
  }, []);

  useEffect(() => {
    if (!stationId) { setStation(null); return; }
    setLoadingStation(true);
    fetch(`/api/stations/${stationId}`)
      .then((r) => r.json())
      .then((d) => {
        const st = d.station;
        setStation(st);
        // Init prices from current prices
        const prices = {};
        const dispensers = st?.dispensers || [];
        const fuelTypes = [...new Set(dispensers.map((d) => d.fuelType).filter(Boolean))];
        fuelTypes.forEach((ft) => {
          const cp = st?.currentPrices instanceof Map ? st.currentPrices.get(ft) : st?.currentPrices?.[ft];
          prices[ft] = cp ? String(cp) : '';
        });
        setShiftPrices(prices);
        setSelectedDispensers(dispensers.filter((d) => d.isActive !== false).map((d) => d.dispenserId));
        // Init pump readings
        const pr = {};
        dispensers.forEach((d) => { pr[d.dispenserId] = { opening: '', closing: '', rtt: '0' }; });
        setPumpReadings(pr);
        // Init tank readings
        const tr = {};
        (st?.tanks || []).forEach((t) => { tr[t._id] = { opening: '', closing: '' }; });
        setTankReadings(tr);
        // Init sales
        const sa = {};
        dispensers.forEach((d) => { sa[d.dispenserId] = { liters: '' }; });
        setSales(sa);
        // Init payments
        const pa = {};
        dispensers.forEach((d) => { pa[d.dispenserId] = { cash: '', pos: '' }; });
        setPayments(pa);
      })
      .finally(() => setLoadingStation(false));
  }, [stationId]);

  // ── PIN verification (tested against API with a dummy call) ──────────────────
  async function verifyPin() {
    if (!pinInput.trim()) { setPinError('Enter the backfill PIN.'); return; }
    setPinChecking(true); setPinError('');
    // Verify by making a benign request — if PIN wrong the API returns 401
    const res = await fetch('/api/admin/backfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinInput, type: '__ping__', stationId: 'ping', date: '2000-01-01' }),
    });
    setPinChecking(false);
    if (res.status === 401) { setPinError('Incorrect PIN. Try again.'); return; }
    // Any other error (400 = wrong type) means PIN is correct
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

  // ── Step: Save Day Shift ──────────────────────────────────────────────────────
  async function saveShift() {
    setSaving(true); setResults([]);
    try {
      await callBackfill({
        type: 'dayShift',
        dispenserIds: selectedDispensers,
        prices: shiftPrices,
      });
      setResults([{ label: 'Day Shift' }]);
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
    if (!res.some((r) => r.error)) setStep('tankReadings');
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
          res.push({ label: `${t.label} opening` });
        } catch (e) { res.push({ label: `${t.label} opening`, error: e.message }); }
      }
      if (r.closing !== '') {
        try {
          await callBackfill({ type: 'tankReading', tankId: t._id, period: 'closing', stockValue: r.closing });
          res.push({ label: `${t.label} closing` });
        } catch (e) { res.push({ label: `${t.label} closing`, error: e.message }); }
      }
    }
    setResults(res);
    if (!res.some((r) => r.error)) setStep('deliveries');
    setSaving(false);
  }

  // ── Step: Save Deliveries ─────────────────────────────────────────────────────
  async function saveDeliveries() {
    setSaving(true); setResults([]);
    const res = [];
    for (const d of deliveries) {
      if (!d.totalReceived) continue;
      try {
        await callBackfill({
          type: 'tankDelivery',
          fuelType: d.fuelType,
          totalReceived: d.totalReceived,
          supplier: d.supplier,
          costPerLiter: d.costPerLiter || undefined,
        });
        res.push({ label: `${d.fuelType} delivery` });
      } catch (e) { res.push({ label: `${d.fuelType} delivery`, error: e.message }); }
    }
    setResults(res);
    setStep('sales');
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
    if (!res.some((r) => r.error)) setStep('payments');
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
    if (!res.some((r) => r.error)) setStep('deposits');
    setSaving(false);
  }

  // ── Step: Save Deposits ───────────────────────────────────────────────────────
  async function saveDeposits() {
    setSaving(true); setResults([]);
    const res = [];
    for (const d of deposits) {
      if (!d.amount || !d.bankName || !d.accountNumber) continue;
      try {
        await callBackfill({ type: 'bankDeposit', ...d });
        res.push({ label: `${d.bankName} — ₦${fmtN(d.amount)}` });
      } catch (e) { res.push({ label: d.bankName, error: e.message }); }
    }
    setResults(res);
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

      <StepBar current={step} />

      {/* ── STEP: Setup ── */}
      {step === 'setup' && (
        <div className="max-w-lg space-y-5">
          <Field label="Date" type="date" value={date} onChange={setDate} />
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
          {loadingStation && <p className="text-sm text-slate-400">Loading station…</p>}
          {station && (
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-1">
              <p><span className="font-semibold">Station:</span> {station.name}</p>
              <p><span className="font-semibold">Pumps:</span> {(station.dispensers || []).filter((d) => d.isActive !== false).length}</p>
              <p><span className="font-semibold">Tanks:</span> {(station.tanks || []).filter((t) => t.isActive !== false).length}</p>
            </div>
          )}
          <button
            disabled={!stationId || !date || !station}
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
          <p className="text-xs text-slate-400">Leave Opening blank to skip a pump. Closing and RTT are optional.</p>

          {(station?.dispensers || []).filter((d) => selectedDispensers.includes(d.dispenserId)).map((d) => (
            <div key={d.dispenserId} className="border border-slate-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-slate-800 mb-3">{d.name} <span className="text-xs text-slate-400 font-normal">({d.fuelType})</span></p>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Opening" type="number" value={pumpReadings[d.dispenserId]?.opening || ''}
                  onChange={(v) => setPumpReadings((p) => ({ ...p, [d.dispenserId]: { ...p[d.dispenserId], opening: v } }))}
                  placeholder="e.g. 45250" />
                <Field label="Closing" type="number" value={pumpReadings[d.dispenserId]?.closing || ''}
                  onChange={(v) => setPumpReadings((p) => ({ ...p, [d.dispenserId]: { ...p[d.dispenserId], closing: v } }))}
                  placeholder="e.g. 45480" />
                <Field label="RTT" type="number" value={pumpReadings[d.dispenserId]?.rtt || '0'}
                  onChange={(v) => setPumpReadings((p) => ({ ...p, [d.dispenserId]: { ...p[d.dispenserId], rtt: v } }))}
                  placeholder="0" />
              </div>
              {pumpReadings[d.dispenserId]?.opening !== '' && pumpReadings[d.dispenserId]?.closing !== '' && (
                <p className="text-xs text-emerald-600 mt-2 font-medium">
                  Net sold: {(
                    (parseFloat(pumpReadings[d.dispenserId]?.closing) || 0) -
                    (parseFloat(pumpReadings[d.dispenserId]?.opening) || 0) -
                    (parseFloat(pumpReadings[d.dispenserId]?.rtt) || 0)
                  ).toFixed(2)} L
                </p>
              )}
            </div>
          ))}

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

          {(station?.tanks || []).filter((t) => t.isActive !== false).map((t) => (
            <div key={t._id} className="border border-slate-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-slate-800 mb-3">{t.label} <span className="text-xs text-slate-400 font-normal">({t.product} · {t.capacity?.toLocaleString()}L cap)</span></p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Opening Dipstick (L)" type="number" value={tankReadings[t._id]?.opening || ''}
                  onChange={(v) => setTankReadings((p) => ({ ...p, [t._id]: { ...p[t._id], opening: v } }))}
                  placeholder="e.g. 12000" />
                <Field label="Closing Dipstick (L)" type="number" value={tankReadings[t._id]?.closing || ''}
                  onChange={(v) => setTankReadings((p) => ({ ...p, [t._id]: { ...p[t._id], closing: v } }))}
                  placeholder="e.g. 9500" />
              </div>
            </div>
          ))}

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
          <p className="text-xs text-slate-400">Record any fuel deliveries received on this date. Leave empty if none.</p>

          {deliveries.map((d, i) => (
            <div key={i} className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Delivery #{i + 1}</p>
                {deliveries.length > 1 && (
                  <button onClick={() => setDeliveries((p) => p.filter((_, j) => j !== i))}
                    className="text-xs text-red-500 hover:underline">Remove</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Fuel Type</label>
                  <select value={d.fuelType} onChange={(e) => setDeliveries((p) => p.map((x, j) => j === i ? { ...x, fuelType: e.target.value } : x))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ecana-maroon">
                    {['PMS', 'AGO', 'DPK', 'LPG'].map((ft) => <option key={ft}>{ft}</option>)}
                  </select>
                </div>
                <Field label="Total Received (L)" type="number" value={d.totalReceived}
                  onChange={(v) => setDeliveries((p) => p.map((x, j) => j === i ? { ...x, totalReceived: v } : x))}
                  placeholder="e.g. 33000" />
                <Field label="Supplier" value={d.supplier}
                  onChange={(v) => setDeliveries((p) => p.map((x, j) => j === i ? { ...x, supplier: v } : x))}
                  placeholder="Optional" />
                <Field label="Cost per Litre (₦)" type="number" value={d.costPerLiter}
                  onChange={(v) => setDeliveries((p) => p.map((x, j) => j === i ? { ...x, costPerLiter: v } : x))}
                  placeholder="Optional" />
              </div>
            </div>
          ))}

          <button onClick={() => setDeliveries((p) => [...p, { fuelType: 'PMS', totalReceived: '', supplier: '', costPerLiter: '' }])}
            className="text-sm text-ecana-maroon hover:underline">+ Add Another Delivery</button>

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

          {(station?.dispensers || []).filter((d) => selectedDispensers.includes(d.dispenserId)).map((d) => {
            const pr = pumpReadings[d.dispenserId] || {};
            const suggestedLiters = pr.opening !== '' && pr.closing !== ''
              ? Math.max(0, (parseFloat(pr.closing) || 0) - (parseFloat(pr.opening) || 0) - (parseFloat(pr.rtt) || 0))
              : null;
            const price = parseFloat(shiftPrices[d.fuelType]) || 0;
            const liters = parseFloat(sales[d.dispenserId]?.liters) || 0;
            return (
              <div key={d.dispenserId} className="border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-800">{d.name} <span className="text-xs text-slate-400 font-normal">({d.fuelType})</span></p>
                <Field
                  label={suggestedLiters != null ? `Litres Sold (meter net: ${suggestedLiters.toFixed(2)})` : 'Litres Sold'}
                  type="number"
                  value={sales[d.dispenserId]?.liters || ''}
                  onChange={(v) => setSales((p) => ({ ...p, [d.dispenserId]: { liters: v } }))}
                  placeholder={suggestedLiters != null ? String(suggestedLiters.toFixed(2)) : '0'}
                />
                {liters > 0 && price > 0 && (
                  <p className="text-xs text-emerald-600 font-medium">Expected: ₦{fmtN(liters * price)}</p>
                )}
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

          {(station?.dispensers || []).filter((d) => selectedDispensers.includes(d.dispenserId)).map((d) => {
            const cash = parseFloat(payments[d.dispenserId]?.cash) || 0;
            const pos = parseFloat(payments[d.dispenserId]?.pos) || 0;
            return (
              <div key={d.dispenserId} className="border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-800">{d.name} <span className="text-xs text-slate-400 font-normal">({d.fuelType})</span></p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Cash (₦)" type="number" value={payments[d.dispenserId]?.cash || ''}
                    onChange={(v) => setPayments((p) => ({ ...p, [d.dispenserId]: { ...p[d.dispenserId], cash: v } }))}
                    placeholder="0" />
                  <Field label="POS (₦)" type="number" value={payments[d.dispenserId]?.pos || ''}
                    onChange={(v) => setPayments((p) => ({ ...p, [d.dispenserId]: { ...p[d.dispenserId], pos: v } }))}
                    placeholder="0" />
                </div>
                {(cash + pos) > 0 && (
                  <p className="text-xs text-emerald-600 font-medium">Total: ₦{fmtN(cash + pos)}</p>
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

      {/* ── STEP: Bank Deposits ── */}
      {step === 'deposits' && (
        <div className="max-w-xl space-y-4">
          <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{station?.name}</span> · {date}
          </div>
          <p className="text-xs text-slate-400">Record bank deposits made for this day. Leave empty if none.</p>

          {deposits.map((d, i) => (
            <div key={i} className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Deposit #{i + 1}</p>
                {deposits.length > 1 && (
                  <button onClick={() => setDeposits((p) => p.filter((_, j) => j !== i))}
                    className="text-xs text-red-500 hover:underline">Remove</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount (₦)" type="number" value={d.amount}
                  onChange={(v) => setDeposits((p) => p.map((x, j) => j === i ? { ...x, amount: v } : x))}
                  placeholder="e.g. 500000" />
                <Field label="Bank Name" value={d.bankName}
                  onChange={(v) => setDeposits((p) => p.map((x, j) => j === i ? { ...x, bankName: v } : x))}
                  placeholder="e.g. First Bank" />
                <Field label="Account Number" value={d.accountNumber}
                  onChange={(v) => setDeposits((p) => p.map((x, j) => j === i ? { ...x, accountNumber: v } : x))}
                  placeholder="0123456789" />
                <Field label="Branch (optional)" value={d.bankBranch}
                  onChange={(v) => setDeposits((p) => p.map((x, j) => j === i ? { ...x, bankBranch: v } : x))}
                  placeholder="e.g. Lagos Island" />
              </div>
              <Field label="Note (optional)" value={d.note}
                onChange={(v) => setDeposits((p) => p.map((x, j) => j === i ? { ...x, note: v } : x))}
                placeholder="Any additional info" />
            </div>
          ))}

          <button onClick={() => setDeposits((p) => [...p, { amount: '', bankName: '', bankBranch: '', accountNumber: '', note: '' }])}
            className="text-sm text-ecana-maroon hover:underline">+ Add Another Deposit</button>

          <SavedBanner results={results} />
          <div className="flex gap-2">
            <button onClick={() => setStep('payments')} className="px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-500 hover:border-slate-400">← Back</button>
            <button onClick={saveDeposits} disabled={saving} className="px-6 py-2.5 bg-ecana-maroon text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-40">
              {saving ? 'Saving…' : 'Save Deposits'}
            </button>
            <button
              onClick={() => {
                setStep('setup');
                setDate(todayStr());
                setStationId('');
                setStation(null);
                setResults([]);
              }}
              className="px-4 py-2 text-sm text-slate-500 border border-slate-200 rounded-xl hover:border-slate-400"
            >
              Start New Entry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
