"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Input from '@/components/Input';
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
  const [selected, setSelected] = useState(new Set());
  const [pricesAtStart, setPricesAtStart] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Zero-stock confirmation dialog
  const [zeroStockWarning, setZeroStockWarning] = useState(null); // { products: ['PMS', ...] }
  const [pendingSubmit, setPendingSubmit] = useState(null); // payload to send after confirmation

  useEffect(() => {
    fetchData();
  }, [session]);

  const fetchData = async () => {
    if (!activeStationId) return;
    try {
      const [stationsRes, dispensersRes] = await Promise.all([
        fetch('/api/stations'),
        fetch(`/api/stations/${activeStationId}/dispensers`),
      ]);
      const stationsData = await stationsRes.json();
      const dispensersData = await dispensersRes.json();

      const currentStation = (stationsData.stations || []).find(s => s._id === activeStationId);
      setStation(currentStation);

      // Build initial prices from availableProducts
      const products = currentStation?.availableProducts || ['PMS', 'AGO'];
      const initialPrices = {};
      for (const p of products) {
        const existing = currentStation?.currentPrices?.[p];
        initialPrices[p] = existing != null ? String(existing) : '';
      }
      setPricesAtStart(initialPrices);

      const active = (dispensersData.dispensers || []).filter(d => d.isActive);
      setDispensers(active);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const togglePump = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const buildPayload = () => {
    const products = station?.availableProducts || ['PMS', 'AGO'];
    const pricesObj = {};
    for (const p of products) {
      pricesObj[p] = parseFloat(pricesAtStart[p]);
    }
    const selectedDispensers = dispensers.filter(d => selected.has(d.dispenserId));
    return {
      stationId: activeStationId,
      date: new Date().toISOString().split('T')[0],
      pricesAtStart: pricesObj,
      dispensers: selectedDispensers.map(d => ({ dispenserId: d.dispenserId, fuelType: d.fuelType })),
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const products = station?.availableProducts || ['PMS', 'AGO'];

    // Validate all prices
    for (const p of products) {
      const val = parseFloat(pricesAtStart[p]);
      if (!pricesAtStart[p] || isNaN(val) || val <= 0) {
        setError(`Please enter a valid price greater than zero for ${FUEL_TYPE_LABELS[p] || p}.`);
        return;
      }
    }

    if (selected.size === 0) {
      setError('Please select at least one pump to activate.');
      return;
    }

    // Check for zero-stock products among selected dispensers
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

      if (res.ok) {
        router.push(adminStationId ? `/manager?stationId=${adminStationId}` : '/manager');
      } else {
        setError(data?.error || `Failed to begin day (${res.status})`);
      }
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
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Zero-stock confirmation dialog */}
      {zeroStockWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={cancelZeroStock}
          />
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
              <Button variant="secondary" onClick={cancelZeroStock} disabled={submitting}>
                Cancel
              </Button>
              <Button variant="warning" onClick={confirmZeroStock} disabled={submitting}>
                {submitting ? 'Starting...' : 'Yes, Continue'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card title="Day Prices">
          <p className="text-sm text-gray-500 mb-4">
            Set the selling price per litre for each product available at this station.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {availableProducts.map(product => (
              <Input
                key={product}
                label={`${FUEL_TYPE_LABELS[product] || product} Price (₦/L)`}
                type="number"
                name={`price-${product}`}
                value={pricesAtStart[product] || ''}
                onChange={e => setPricesAtStart(p => ({ ...p, [product]: e.target.value }))}
                placeholder="Enter price"
                step="0.01"
                min="0.01"
                required
              />
            ))}
          </div>
        </Card>

        <Card title="Activate Pumps" className="mt-6">
          <p className="text-sm text-gray-600 mb-4">
            Tick the pumps to activate for today. Supervisors will enter meter readings for each pump.
          </p>
          {dispensers.length === 0 ? (
            <p className="text-sm text-gray-500">
              No active pumps found. Configure pumps via Admin &rarr; Stations &rarr; Map Pumps/Tanks.
            </p>
          ) : (
            <div className="space-y-3">
              {dispensers.map(d => {
                const stock = station?.currentStock?.[d.fuelType];
                const isZeroStock = stock === 0 || stock === null || stock === undefined;
                return (
                  <div key={d.dispenserId} className={`border rounded-lg p-4 ${isZeroStock && selected.has(d.dispenserId) ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={selected.has(d.dispenserId)}
                        onChange={() => togglePump(d.dispenserId)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                      />
                      <span className="font-medium text-gray-900">{d.name}</span>
                      <span className="text-xs text-gray-500 ml-1">{FUEL_TYPE_LABELS[d.fuelType] || d.fuelType} &bull; {d.dispenserId}</span>
                      {isZeroStock && (
                        <span className="ml-auto text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          0 L in stock
                        </span>
                      )}
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="mt-6">
          <Button type="submit" variant="primary" disabled={submitting || selected.size === 0}>
            {submitting ? 'Starting Day...' : 'Begin Day'}
          </Button>
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
