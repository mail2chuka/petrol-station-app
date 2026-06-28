"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Loading from '@/components/Loading';
import { FUEL_TYPE_LABELS } from '@/lib/constants';

function BeginDayPageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const activeStationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;


  const [station, setStation] = useState(null);
  const [dispensers, setDispensers] = useState([]);
  const [attendants, setAttendants] = useState([]);
  const [selected, setSelected] = useState(new Set());
  // dispenserId → attendantId mapping
  const [pumpAttendants, setPumpAttendants] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [zeroStockWarning, setZeroStockWarning] = useState(null);
  const [pendingSubmit, setPendingSubmit] = useState(null);

  useEffect(() => { fetchData(); }, [activeStationId]);

  const fetchData = async () => {
    if (!activeStationId) return;
    try {
      const [stationsRes, dispensersRes, attendantsRes] = await Promise.all([
        fetch('/api/stations'),
        fetch(`/api/stations/${activeStationId}/dispensers`),
        fetch(`/api/attendants?stationId=${activeStationId}`),
      ]);
      const stationsData = await stationsRes.json();
      const dispensersData = await dispensersRes.json();
      const attendantsData = await attendantsRes.json();

      const currentStation = (stationsData.stations || []).find(s => s._id === activeStationId);
      setStation(currentStation);

      const active = (dispensersData.dispensers || []).filter(d => d.isActive);
      setDispensers(active);
      setAttendants(attendantsData.attendants || []);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const togglePump = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Clear attendant assignment when pump is unchecked
        setPumpAttendants(prev => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const setAttendantForPump = (dispenserId, attendantId) => {
    setPumpAttendants(prev => ({ ...prev, [dispenserId]: attendantId }));
  };

  // All checked pumps must have an attendant assigned before Begin Day is enabled
  const allPumpsAssigned = selected.size > 0 && [...selected].every(id => !!pumpAttendants[id]);

  const buildPayload = () => {
    const selectedDispensers = dispensers.filter(d => selected.has(d.dispenserId));
    return {
      stationId: activeStationId,
      date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date()),
      dispensers: selectedDispensers.map(d => ({ dispenserId: d.dispenserId, fuelType: d.fuelType })),
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (selected.size === 0) {
      setError('Please select at least one pump to activate.');
      return;
    }

    if (!allPumpsAssigned) {
      setError('Please assign an attendant to every activated pump before beginning the day.');
      return;
    }

    const selectedFuelTypes = new Set(
      dispensers.filter(d => selected.has(d.dispenserId)).map(d => d.fuelType)
    );
    const zeroStockProducts = [];
    for (const ft of selectedFuelTypes) {
      const stock = station?.currentStock?.[ft];
      if (stock === 0 || stock === null || stock === undefined) {
        zeroStockProducts.push(ft);
      }
    }

    if (zeroStockProducts.length > 0) {
      setPendingSubmit(buildPayload());
      setZeroStockWarning({ products: zeroStockProducts });
      return;
    }

    await doSubmit(buildPayload());
  };

  const doSubmit = async (payload) => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/day-shifts/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let data;
      try { data = await res.json(); } catch {
        setError(`Server error (HTTP ${res.status}) — check server logs`);
        setSubmitting(false);
        return;
      }

      if (!res.ok) {
        setError(data?.error || `Failed to begin day (${res.status})`);
        return;
      }

      // Create attendant assignments for each pump
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
      const assignCalls = [...selected].map(dispenserId => {
        const attendantId = pumpAttendants[dispenserId];
        if (!attendantId) return Promise.resolve();
        const dispenser = dispensers.find(d => d.dispenserId === dispenserId);
        return fetch('/api/attendant-assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stationId: activeStationId,
            date: today,
            dispenserId,
            dispenserName: dispenser?.name || dispenserId,
            fuelType: dispenser?.fuelType || '',
            attendantId,
          }),
        });
      });
      await Promise.allSettled(assignCalls);

      router.push(adminStationId ? `/manager?stationId=${adminStationId}` : '/manager');
    } catch (err) {
      setError(err?.message || 'Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmZeroStock = async () => {
    setZeroStockWarning(null);
    await doSubmit(pendingSubmit);
    setPendingSubmit(null);
  };

  const cancelZeroStock = () => {
    setZeroStockWarning(null);
    setPendingSubmit(null);
  };

  if (!activeStationId) {
    return (
      <Card title="Select Station">
        <p className="text-sm text-gray-600">Choose a station from the Admin Stations page to manage.</p>
      </Card>
    );
  }

  if (loading) return <Loading />;

  const availableProducts = station?.availableProducts || ['PMS', 'AGO'];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Begin Day</h1>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Zero-stock confirmation dialog */}
      {zeroStockWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={cancelZeroStock} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-amber-700">Zero Stock Warning</h2>
            <p className="mt-2 text-sm text-gray-700">
              The following product{zeroStockWarning.products.length > 1 ? 's are' : ' is'} currently at <strong>0 litres</strong> in stock:
            </p>
            <ul className="mt-2 space-y-1">
              {zeroStockWarning.products.map(p => (
                <li key={p} className="flex items-center gap-2 text-sm text-amber-800 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  {FUEL_TYPE_LABELS[p] || p}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-gray-600">Do you want to continue opening the day anyway?</p>
            <div className="mt-5 flex gap-3">
              <Button variant="secondary" onClick={cancelZeroStock} disabled={submitting}>Cancel</Button>
              <Button variant="warning" onClick={confirmZeroStock} disabled={submitting}>
                {submitting ? 'Starting...' : 'Yes, Continue'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Prices section — read-only snapshot set by admin */}
        <Card title="Today's Prices">
          <p className="text-sm text-gray-500 mb-4">
            Prices are set by admin and will be locked in when the day begins.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {availableProducts.map(product => {
              const price = station?.currentPrices?.[product];
              return (
                <div key={product} className="bg-gray-50 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{FUEL_TYPE_LABELS[product] || product}</p>
                  <p className={`text-2xl font-bold ${price ? 'text-gray-900' : 'text-amber-600'}`}>
                    {price ? `₦${Number(price).toLocaleString('en-NG', { minimumFractionDigits: 2 })}/L` : 'No price set — contact admin'}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Pumps + attendant assignment */}
        <Card title="Activate Pumps" className="mt-6">
          <p className="text-sm text-gray-600 mb-4">
            Tick the pumps to activate for today, then assign an attendant to each one.
          </p>
          {dispensers.length === 0 ? (
            <p className="text-sm text-gray-500">
              No active pumps found. Configure pumps via Admin → Stations → Map Pumps/Tanks.
            </p>
          ) : (
            <div className="space-y-3">
              {dispensers.map(d => {
                const isSelected = selected.has(d.dispenserId);
                const stock = station?.currentStock?.[d.fuelType];
                const isZeroStock = stock === 0 || stock === null || stock === undefined;
                const assignedAttendantId = pumpAttendants[d.dispenserId] || '';

                return (
                  <div
                    key={d.dispenserId}
                    className={`border rounded-xl overflow-hidden transition-colors ${
                      isZeroStock && isSelected
                        ? 'border-amber-300'
                        : isSelected
                        ? 'border-ecana-maroon/40'
                        : 'border-gray-200'
                    }`}
                  >
                    {/* Pump row */}
                    <label className={`flex items-center gap-3 cursor-pointer select-none px-4 py-3 ${isSelected ? 'bg-ecana-maroon/5' : 'bg-white'}`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePump(d.dispenserId)}
                        className="h-4 w-4 rounded border-gray-300 text-ecana-maroon cursor-pointer"
                      />
                      <span className="font-medium text-gray-900">{d.name}</span>
                      <span className="text-xs text-gray-500">{FUEL_TYPE_LABELS[d.fuelType] || d.fuelType}</span>
                      {isZeroStock && (
                        <span className="ml-auto text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          0 L in stock
                        </span>
                      )}
                      {isSelected && !isZeroStock && !assignedAttendantId && (
                        <span className="ml-auto text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          Assign attendant
                        </span>
                      )}
                      {isSelected && assignedAttendantId && (
                        <span className="ml-auto text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          ✓ Assigned
                        </span>
                      )}
                    </label>

                    {/* Attendant dropdown — shown only when pump is checked */}
                    {isSelected && (
                      <div className="px-4 pb-3 pt-1 bg-white border-t border-gray-100">
                        <label className="block text-xs text-gray-500 font-medium mb-1.5 uppercase tracking-wide">
                          Assign Attendant
                        </label>
                        {attendants.length === 0 ? (
                          <p className="text-xs text-amber-700">
                            No attendants registered. Go to Attendants to register staff first.
                          </p>
                        ) : (
                          <select
                            value={assignedAttendantId}
                            onChange={e => setAttendantForPump(d.dispenserId, e.target.value)}
                            className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:border-ecana-maroon transition-colors ${
                              assignedAttendantId ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'
                            }`}
                          >
                            <option value="">— Select attendant —</option>
                            {attendants.map(a => (
                              <option key={a._id} value={a._id}>
                                {a.staffNumber} — {a.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="mt-6 flex items-center gap-4">
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || selected.size === 0 || !allPumpsAssigned}
          >
            {submitting ? 'Starting Day...' : 'Begin Day'}
          </Button>
          {selected.size > 0 && !allPumpsAssigned && (
            <p className="text-sm text-amber-700">Assign an attendant to each activated pump to continue.</p>
          )}
        </div>
      </form>
    </div>
  );
}

export default function BeginDayPage() {
  return (
    <Suspense fallback={<Loading />}>
      <BeginDayPageContent />
    </Suspense>
  );
}
