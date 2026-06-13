"use client";

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/Button';
import Loading from '@/components/Loading';
import { FUEL_TYPE_LABELS } from '@/lib/constants';

function getStock(station, fuelType) {
  if (!station?.currentStock) return 0;
  const s = station.currentStock;
  return typeof s.get === 'function' ? (s.get(fuelType) ?? 0) : (s[fuelType] ?? 0);
}

function getPrice(station, fuelType) {
  if (!station?.currentPrices) return 0;
  const p = station.currentPrices;
  return typeof p.get === 'function' ? (p.get(fuelType) ?? 0) : (p[fuelType] ?? 0);
}

function ReceiveStockPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const activeStationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;

  const [station, setStation] = useState(null);
  const [formData, setFormData] = useState({
    fuelType: '',
    tankId: '',       // selected tank _id
    quantity: '',
    expectedQuantity: '',
    cost: '',
    supplier: '',
    notes: '',
  });
  const [distribution, setDistribution] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { fetchStation(); }, [session]);

  const fetchStation = async () => {
    if (!activeStationId) return;
    try {
      const res = await fetch('/api/stations');
      const data = await res.json();
      const myStation = data.stations?.find(s => s._id === activeStationId);
      if (myStation) {
        setStation(myStation);
        // Default fuelType to first available product
        const products = myStation.availableProducts || ['PMS', 'AGO'];
        setFormData(prev => ({ ...prev, fuelType: products[0] || 'PMS', tankId: '', }));
      }
    } catch (err) {
      console.error('Error fetching station:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      // Reset tank selection when fuel type changes
      ...(name === 'fuelType' ? { tankId: '' } : {}),
    }));
  };

  // Tanks filtered by selected fuel type
  const tanksForFuelType = useMemo(() => {
    return (station?.tanks || []).filter(t => t.isActive !== false && t.product === formData.fuelType);
  }, [station, formData.fuelType]);

  // All active tanks (for distribution)
  const allTanks = useMemo(() => (station?.tanks || []).filter(t => t.isActive !== false), [station]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const quantityValue = Number(formData.quantity || 0);
    const distributionTotal = distribution.reduce((sum, item) => sum + (Number(item.litres) || 0), 0);

    // Capacity check — single tank selected
    if (formData.tankId) {
      const selectedTank = tanksForFuelType.find(t => t._id === formData.tankId);
      if (selectedTank?.capacity > 0) {
        const currentFuelStock = getStock(station, formData.fuelType);
        if (currentFuelStock + quantityValue > selectedTank.capacity) {
          const remaining = Math.max(0, selectedTank.capacity - currentFuelStock);
          setError(
            `This quantity would exceed the capacity of ${selectedTank.label} ` +
            `(capacity: ${selectedTank.capacity.toLocaleString()} L, ` +
            `current stock: ${currentFuelStock.toFixed(2)} L, ` +
            `maximum you can add: ${remaining.toFixed(2)} L).`
          );
          return;
        }
      }
    }

    // Capacity check — distribution splits
    if (distribution.length > 0) {
      for (const item of distribution) {
        if (!item.tankId || !item.litres) continue;
        const tank = allTanks.find(t => t._id === item.tankId);
        if (tank?.capacity > 0 && Number(item.litres) > tank.capacity) {
          setError(
            `Split quantity for ${tank.label} (${Number(item.litres).toLocaleString()} L) ` +
            `exceeds that tank's capacity of ${tank.capacity.toLocaleString()} L.`
          );
          return;
        }
      }
    }

    if (distribution.length > 0 && Math.abs(distributionTotal - quantityValue) > 0.001) {
      setError('Tank distribution total must equal quantity delivered.');
      return;
    }

    setSubmitting(true);
    try {
      // Resolve tank label for the selected tankId
      const selectedTank = tanksForFuelType.find(t => t._id === formData.tankId);

      const res = await fetch(`/api/stations/${activeStationId}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: activeStationId,
          fuelType: formData.fuelType,
          tank: selectedTank ? selectedTank.label : undefined,
          quantity: parseFloat(formData.quantity),
          expectedQuantity: formData.expectedQuantity ? parseFloat(formData.expectedQuantity) : undefined,
          cost: parseFloat(formData.cost),
          supplier: formData.supplier,
          notes: formData.notes,
          distribution: distribution
            .filter(d => d.tankId && d.litres !== '')
            .map(d => ({ tankId: d.tankId, litres: parseFloat(d.litres) })),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(
          `Stock received! ${formData.fuelType} updated: ${data.stockUpdate.previousStock.toFixed(2)} L → ${data.stockUpdate.newStock.toFixed(2)} L`
        );
        setFormData(prev => ({ ...prev, tankId: '', quantity: '', expectedQuantity: '', cost: '', supplier: '', notes: '' }));
        setDistribution([]);
        fetchStation();
      } else {
        setError(data.error || 'Failed to receive stock');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
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
  const costPerLiter = formData.quantity && formData.cost
    ? (parseFloat(formData.cost) / parseFloat(formData.quantity)).toFixed(2)
    : null;
  const variance = formData.expectedQuantity && formData.quantity
    ? (parseFloat(formData.quantity) - parseFloat(formData.expectedQuantity)).toFixed(2)
    : null;
  const distributionTotal = distribution.reduce((sum, item) => sum + (Number(item.litres) || 0), 0);
  const quantityValue = Number(formData.quantity || 0);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Receive Stock</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl mb-4 text-sm">{success}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Current stock levels */}
        <Card title="Current Stock Levels">
          <div className="space-y-3">
            {availableProducts.map(product => (
              <div key={product} className={`p-3 rounded-xl ${formData.fuelType === product ? 'bg-ecana-maroon/5 border border-ecana-maroon/20' : 'bg-slate-50'}`}>
                <p className="text-sm text-gray-600">{FUEL_TYPE_LABELS[product] || product}</p>
                <p className="text-2xl font-bold text-slate-800">
                  {getStock(station, product).toFixed(2)} L
                </p>
                <p className="text-sm text-gray-500">
                  Price: ₦{getPrice(station, product).toFixed(2)}/L
                </p>
              </div>
            ))}

            {/* Tank list */}
            {(station?.tanks || []).filter(t => t.isActive !== false).length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tanks</p>
                {(station.tanks || []).filter(t => t.isActive !== false).map(tank => (
                  <div key={tank._id} className="flex justify-between text-sm py-1">
                    <span className="text-gray-700">{tank.label}</span>
                    <span className="text-gray-500">{tank.product} · {(tank.capacity || 0).toLocaleString()} L cap.</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Record new stock */}
        <Card title="Record New Stock">
          <form onSubmit={handleSubmit} className="space-y-0">
            <Select
              label="Fuel Type"
              name="fuelType"
              value={formData.fuelType}
              onChange={handleChange}
              options={availableProducts.map(p => ({ value: p, label: FUEL_TYPE_LABELS[p] || p }))}
              required
            />

            {/* Tank select — dropdown of tanks for the selected fuel type */}
            <Select
              label="Tank (Optional)"
              name="tankId"
              value={formData.tankId}
              onChange={handleChange}
              options={[
                { value: '', label: tanksForFuelType.length > 0 ? 'Select a tank...' : '— No tanks configured for this fuel —' },
                ...tanksForFuelType.map(t => ({ value: t._id, label: `${t.label} (cap: ${(t.capacity || 0).toLocaleString()} L)` })),
              ]}
            />
            {formData.tankId && (() => {
              const tank = tanksForFuelType.find(t => t._id === formData.tankId);
              if (!tank?.capacity) return null;
              const currentFuelStock = getStock(station, formData.fuelType);
              const remaining = Math.max(0, tank.capacity - currentFuelStock);
              const willExceed = formData.quantity && (currentFuelStock + Number(formData.quantity)) > tank.capacity;
              return (
                <div className={`mb-4 px-4 py-3 rounded-xl text-sm ${willExceed ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-slate-50'}`}>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Tank Capacity</p>
                  <p className="font-semibold text-gray-800">{tank.capacity.toLocaleString()} L total · <span className={willExceed ? 'text-amber-700' : 'text-green-700'}>{remaining.toFixed(2)} L remaining</span></p>
                  {willExceed && <p className="text-xs mt-1 font-medium">This quantity will exceed tank capacity.</p>}
                </div>
              );
            })()}

            <Input
              label="Expected Quantity (Litres)"
              type="text"
              inputMode="decimal"
              name="expectedQuantity"
              value={formData.expectedQuantity}
              onChange={handleChange}
              placeholder="0"
            />

            <Input
              label="Quantity Delivered (Litres)"
              type="text"
              inputMode="decimal"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              placeholder="0"
              required
            />

            {variance !== null && (
              <div className="mb-4 p-3 rounded-xl bg-amber-50">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Supply Variance (Actual − Expected)</p>
                <p className={`text-xl font-bold mt-0.5 ${Number(variance) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {Number(variance) >= 0 ? '+' : ''}{variance} L
                </p>
              </div>
            )}

            {/* Tank distribution */}
            <div className="mb-4 p-4 border border-gray-200 rounded-xl bg-slate-50">
              <p className="text-sm font-semibold text-slate-800 mb-1">Split Across Tanks (Optional)</p>
              <p className="text-xs text-slate-500 mb-3">
                Use this to distribute delivered volume across multiple tanks. Total must equal delivered quantity.
              </p>

              {distribution.map((item, index) => (
                <div key={index} className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2 items-end">
                  <Select
                    label="Tank"
                    value={item.tankId}
                    onChange={(e) => {
                      const next = [...distribution];
                      next[index].tankId = e.target.value;
                      setDistribution(next);
                    }}
                    options={[
                      { value: '', label: 'Select tank...' },
                      ...allTanks.map(t => ({ value: t._id, label: `${t.label} (${t.product})` })),
                    ]}
                  />
                  <Input
                    label="Litres"
                    type="text"
                    inputMode="decimal"
                    value={item.litres}
                    onChange={(e) => {
                      const next = [...distribution];
                      next[index].litres = e.target.value;
                      setDistribution(next);
                    }}
                  />
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setDistribution(distribution.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </div>
              ))}

              <div className="flex items-center gap-3 mt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setDistribution([...distribution, { tankId: '', litres: '' }])}
                >
                  + Add Tank Split
                </Button>
                {distribution.length > 0 && (
                  <span className="text-xs text-slate-600">
                    Total split: <strong>{distributionTotal.toFixed(2)} L</strong>
                    {quantityValue > 0 && (
                      <span className={Math.abs(distributionTotal - quantityValue) < 0.001 ? ' text-emerald-600' : ' text-red-600'}>
                        {' '}/ {quantityValue.toFixed(2)} L
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>

            <Input
              label="Total Cost (₦)"
              type="text"
              inputMode="decimal"
              name="cost"
              value={formData.cost}
              onChange={handleChange}
              placeholder="0"
              required
            />

            {costPerLiter && (
              <div className="mb-4 p-3 rounded-xl bg-slate-50">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Cost Per Litre</p>
                <p className="text-xl font-bold text-slate-800 mt-0.5">₦{costPerLiter}</p>
              </div>
            )}

            <Input
              label="Supplier (Optional)"
              name="supplier"
              value={formData.supplier}
              onChange={handleChange}
              placeholder="e.g. ABC Fuel Suppliers"
            />

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes (Optional)</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={2}
                className="w-full px-4 py-3 text-sm border-2 border-slate-200 rounded-xl focus:outline-none focus:border-ecana-maroon resize-none"
                placeholder="Invoice number, delivery notes..."
              />
            </div>

            <Button type="submit" variant="success" disabled={submitting} className="w-full">
              {submitting ? 'Recording...' : 'Receive Stock'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function ReceiveStockPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ReceiveStockPageContent />
    </Suspense>
  );
}
