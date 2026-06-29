"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/Button';
import Loading from '@/components/Loading';
import { FUEL_TYPE_LABELS } from '@/lib/constants';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function OffloadPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const activeStationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;

  const [station, setStation] = useState(null);
  const [trucks, setTrucks] = useState([]);
  const [tankLevels, setTankLevels] = useState({}); // tankId -> last closing dipstick
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const [form, setForm] = useState({
    truckId: '',
    driverName: '',
    driverPhone: '',
    fuelType: '',
    declaredLoad: '',
    supplier: '',
    cost: '',
    notes: '',
  });
  // per tankId: { opening, closing }
  const [dips, setDips] = useState({});

  const loadData = useCallback(async () => {
    if (!activeStationId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [stRes, truckRes, levelRes] = await Promise.all([
        fetch(`/api/stations/${activeStationId}`),
        fetch('/api/trucks'),
        fetch(`/api/tank-stock?stationId=${activeStationId}&lastPerTank=true`),
      ]);
      const stData = await stRes.json();
      const truckData = await truckRes.json();
      const levelData = await levelRes.json();

      const st = stData.station;
      setStation(st || null);
      setTrucks(truckData.trucks || []);

      const levels = {};
      for (const c of (levelData.lastClosings || [])) levels[c.tankId] = c.closingStockMeasured;
      setTankLevels(levels);

      if (st) {
        const products = st.availableProducts || ['PMS', 'AGO'];
        setForm((p) => ({ ...p, fuelType: p.fuelType || products[0] || 'PMS' }));
      }
    } catch {
      setError('Failed to load offload data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [activeStationId]);

  useEffect(() => { loadData(); }, [loadData]);

  const set = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setError(''); };

  // When a truck is selected, prefill driver from its registration (editable)
  const onSelectTruck = (truckId) => {
    const t = trucks.find((x) => x._id === truckId);
    setForm((p) => ({
      ...p,
      truckId,
      driverName: t?.driverName || '',
      driverPhone: t?.driverPhone || '',
    }));
    setError('');
  };

  // Receiving tanks = active tanks for the selected product
  const tanks = useMemo(
    () => (station?.tanks || []).filter((t) => t.isActive !== false && t.product === form.fuelType),
    [station, form.fuelType]
  );

  // Prefill opening dipstick with the tank's last known level when fuel changes
  useEffect(() => {
    setDips((prev) => {
      const next = {};
      for (const t of tanks) {
        next[t._id] = prev[t._id] || { opening: tankLevels[t._id] != null ? String(tankLevels[t._id]) : '', closing: '' };
      }
      return next;
    });
  }, [form.fuelType, station]); // eslint-disable-line react-hooks/exhaustive-deps

  const perTank = tanks.map((t) => {
    const d = dips[t._id] || {};
    const opening = parseFloat(d.opening);
    const closing = parseFloat(d.closing);
    const offloaded = !isNaN(opening) && !isNaN(closing) ? Math.max(0, closing - opening) : null;
    return { tank: t, opening: d.opening ?? '', closing: d.closing ?? '', offloaded };
  });

  const totalOffloaded = perTank.reduce((s, r) => s + (r.offloaded || 0), 0);
  const declared = parseFloat(form.declaredLoad) || 0;
  const variance = totalOffloaded - declared; // − shortage, + excess
  const hasAnyClosing = perTank.some((r) => r.offloaded != null && r.offloaded > 0);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setResult(null);

    if (!form.truckId) { setError('Select the delivering truck.'); return; }
    if (!declared || declared <= 0) { setError('Enter the declared load (litres from the waybill).'); return; }
    const tanksPayload = perTank
      .filter((r) => r.closing !== '' && r.opening !== '')
      .map((r) => ({ tankId: r.tank._id, openingDip: parseFloat(r.opening), closingDip: parseFloat(r.closing) }));
    if (tanksPayload.length === 0) { setError('Enter opening and closing dipstick for at least one tank.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/stations/${activeStationId}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truckId: form.truckId,
          driverName: form.driverName,
          driverPhone: form.driverPhone,
          fuelType: form.fuelType,
          declaredLoad: declared,
          supplier: form.supplier,
          cost: form.cost ? parseFloat(form.cost) : undefined,
          notes: form.notes,
          tanks: tanksPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to record offload'); return; }
      setResult(data.offload);
      setForm((p) => ({ ...p, truckId: '', driverName: '', driverPhone: '', declaredLoad: '', supplier: '', cost: '', notes: '' }));
      setDips({});
      loadData();
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!activeStationId) {
    return <Card title="Select Station"><p className="text-sm text-gray-600">Choose a station from the Admin Stations page to manage.</p></Card>;
  }
  if (loading) return <Loading />;

  const availableProducts = station?.availableProducts || ['PMS', 'AGO'];
  const activeTrucks = trucks.filter((t) => t.isActive !== false);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Truck Offload</h1>
      <p className="text-sm text-gray-500 mb-6">Record a delivery: select the truck, declared load, and dipstick before/after offloading.</p>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">{error}</div>}

      {result && (
        <div className={`px-4 py-4 rounded-xl mb-4 text-sm border ${result.shortage > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : result.excess > 0 ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
          <p className="font-semibold">Offload recorded.</p>
          <p className="mt-0.5">
            Declared {fmt(result.declaredLoad)} L · Offloaded {fmt(result.actualOffloaded)} L ·{' '}
            {result.shortage > 0 ? `Shortage ${fmt(result.shortage)} L` : result.excess > 0 ? `Excess ${fmt(result.excess)} L` : 'Exact match ✓'}
          </p>
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <Card title="Delivery">
          {activeTrucks.length === 0 ? (
            <p className="text-sm text-amber-700">No trucks registered. Ask an admin to register trucks first.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Truck"
                value={form.truckId}
                onChange={(e) => onSelectTruck(e.target.value)}
                options={[{ value: '', label: 'Select truck...' }, ...activeTrucks.map((t) => ({ value: t._id, label: t.plateNumber }))]}
                required
              />
              <Select
                label="Product"
                value={form.fuelType}
                onChange={(e) => set('fuelType', e.target.value)}
                options={availableProducts.map((p) => ({ value: p, label: FUEL_TYPE_LABELS[p] || p }))}
                required
              />
              <Input label="Driver Name" value={form.driverName} onChange={(e) => set('driverName', e.target.value)} placeholder="Driver for this trip" />
              <Input label="Driver Phone" value={form.driverPhone} onChange={(e) => set('driverPhone', e.target.value)} placeholder="080..." />
              <Input label="Declared Load (L)" type="text" inputMode="decimal" value={form.declaredLoad} onChange={(e) => set('declaredLoad', e.target.value)} placeholder="From depot waybill" required />
              <Input label="Total Cost (₦, optional)" type="text" inputMode="decimal" value={form.cost} onChange={(e) => set('cost', e.target.value)} placeholder="0" />
              <Input label="Supplier (optional)" value={form.supplier} onChange={(e) => set('supplier', e.target.value)} placeholder="Depot / supplier" />
            </div>
          )}
        </Card>

        <Card title={`Dipstick — ${form.fuelType} Tanks`}>
          {tanks.length === 0 ? (
            <p className="text-sm text-gray-400">No active {form.fuelType} tanks configured for this station.</p>
          ) : (
            <div className="space-y-3">
              {perTank.map((r) => (
                <div key={r.tank._id} className="border border-gray-200 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-800">{r.tank.label}</p>
                    <p className="text-xs text-gray-500">
                      Current level: {tankLevels[r.tank._id] != null ? `${fmt(tankLevels[r.tank._id])} L` : '—'} · cap {Number(r.tank.capacity || 0).toLocaleString()} L
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <Input label="Opening dip (L)" type="text" inputMode="decimal" value={r.opening}
                      onChange={(e) => setDips((p) => ({ ...p, [r.tank._id]: { ...p[r.tank._id], opening: e.target.value } }))} />
                    <Input label="Closing dip (L)" type="text" inputMode="decimal" value={r.closing}
                      onChange={(e) => setDips((p) => ({ ...p, [r.tank._id]: { ...p[r.tank._id], closing: e.target.value } }))} />
                    <div className="pb-2">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Offloaded</p>
                      <p className={`text-sm font-semibold ${r.offloaded ? 'text-emerald-700' : 'text-gray-400'}`}>{r.offloaded != null ? `${fmt(r.offloaded)} L` : '—'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {(hasAnyClosing || declared > 0) && (
          <div className={`px-4 py-4 rounded-xl text-sm border ${variance < 0 ? 'bg-amber-50 border-amber-200' : variance > 0 ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'}`}>
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-gray-600">Declared load</span><span className="font-semibold">{fmt(declared)} L</span>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-gray-600">Total offloaded (Σ dipstick)</span><span className="font-semibold">{fmt(totalOffloaded)} L</span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 pt-1.5 mt-1.5 border-t border-black/5 font-bold">
              <span>{variance < 0 ? 'Shortage' : variance > 0 ? 'Excess' : 'Variance'}</span>
              <span className={variance < 0 ? 'text-amber-700' : variance > 0 ? 'text-blue-700' : 'text-green-700'}>
                {variance === 0 ? 'Exact match ✓' : `${variance < 0 ? '−' : '+'}${fmt(Math.abs(variance))} L`}
              </span>
            </div>
          </div>
        )}

        <Button type="submit" variant="success" disabled={submitting || activeTrucks.length === 0} className="w-full">
          {submitting ? 'Recording...' : 'Record Offload'}
        </Button>
      </form>
    </div>
  );
}

export default function OffloadPage() {
  return (
    <Suspense fallback={<Loading />}>
      <OffloadPageContent />
    </Suspense>
  );
}
