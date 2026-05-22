'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Loading from '@/components/Loading';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
}

function ClosingStockPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const activeStationId =
    session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;

  const [date, setDate] = useState(todayStr());
  const [station, setStation] = useState(null);
  const [tankStockEntries, setTankStockEntries] = useState([]);

  const [stockForms, setStockForms] = useState({});
  const [stockEditing, setStockEditing] = useState({});
  const [stockSaving, setStockSaving] = useState({});
  const [stockErrors, setStockErrors] = useState({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (activeStationId) fetchData();
  }, [activeStationId, date]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [stationRes, tsRes] = await Promise.all([
        fetch(`/api/stations/${activeStationId}`),
        fetch(`/api/tank-stock?stationId=${activeStationId}&date=${date}`),
      ]);
      const [stationData, tsData] = await Promise.all([
        stationRes.json(),
        tsRes.json(),
      ]);

      if (!stationRes.ok) {
        setError(stationData.error || 'Failed to load station');
        setLoading(false);
        return;
      }

      const stationObj = stationData.station || null;
      setStation(stationObj);
      const entries = tsData.entries || [];
      setTankStockEntries(entries);
      initForms(stationObj, entries);
    } catch {
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const initForms = (stationObj, entries) => {
    const activeTanks = (stationObj?.tanks || []).filter(t => t.isActive !== false);
    const closingByTankId = {};
    for (const e of entries.filter(e => e.period === 'closing')) {
      closingByTankId[e.tankId] = e;
    }
    const newForms = {};
    const newEditing = {};
    for (const tank of activeTanks) {
      const saved = closingByTankId[tank._id];
      newForms[tank._id] = saved
        ? { value: String(saved.closingStockMeasured), notes: saved.notes || '' }
        : { value: '', notes: '' };
      newEditing[tank._id] = !saved;
    }
    setStockForms(newForms);
    setStockEditing(newEditing);
    setStockErrors({});
  };

  const refreshTankStock = async () => {
    const tsRes = await fetch(`/api/tank-stock?stationId=${activeStationId}&date=${date}`);
    const tsData = await tsRes.json();
    const entries = tsData.entries || [];
    setTankStockEntries(entries);
    initForms(station, entries);
  };

  const handleFormChange = (tankId, field, value) => {
    setStockForms(prev => ({ ...prev, [tankId]: { ...prev[tankId], [field]: value } }));
  };

  const handleSave = async (tank) => {
    const form = stockForms[tank._id] || { value: '', notes: '' };
    const value = parseFloat(form.value);
    if (isNaN(value) || value < 0) {
      setStockErrors(prev => ({ ...prev, [tank._id]: 'Enter a valid stock value (0 or greater)' }));
      return;
    }
    setStockErrors(prev => ({ ...prev, [tank._id]: '' }));
    setStockSaving(prev => ({ ...prev, [tank._id]: true }));
    try {
      const res = await fetch('/api/tank-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: activeStationId,
          tankId: tank._id,
          date,
          period: 'closing',
          stockValue: value,
          notes: form.notes || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStockErrors(prev => ({ ...prev, [tank._id]: data.error || 'Failed to save' }));
      } else {
        await refreshTankStock();
      }
    } catch {
      setStockErrors(prev => ({ ...prev, [tank._id]: 'Network error. Please try again.' }));
    } finally {
      setStockSaving(prev => ({ ...prev, [tank._id]: false }));
    }
  };

  const handleStartEdit = (tankId) => {
    setStockEditing(prev => ({ ...prev, [tankId]: true }));
  };

  const handleCancelEdit = (tankId) => {
    const saved = tankStockEntries.find(e => e.tankId === tankId && e.period === 'closing');
    if (saved) {
      setStockForms(prev => ({
        ...prev,
        [tankId]: { value: String(saved.closingStockMeasured), notes: saved.notes || '' },
      }));
    }
    setStockEditing(prev => ({ ...prev, [tankId]: false }));
  };

  if (!activeStationId) {
    return (
      <Card title="Select Station">
        <p className="text-sm text-gray-600">Choose a station from the Admin Stations page to manage.</p>
      </Card>
    );
  }

  const activeTanks = (station?.tanks || []).filter(t => t.isActive !== false);
  const closingByTankId = {};
  for (const e of tankStockEntries.filter(e => e.period === 'closing')) {
    closingByTankId[e.tankId] = e;
  }
  const openingByTankId = {};
  for (const e of tankStockEntries.filter(e => e.period === 'opening')) {
    openingByTankId[e.tankId] = e;
  }
  const allEntered = activeTanks.length > 0 && activeTanks.every(t => closingByTankId[t._id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Closing Stock</h1>
        <p className="text-gray-500 mt-1">
          Record the measured stock remaining in each tank at end of day.
        </p>
      </div>

      {/* Date picker */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              className="input-modern"
              value={date}
              max={todayStr()}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="btn-modern btn-primary px-5 py-3 disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}
      </Card>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="spinner" />
        </div>
      )}

      {!loading && station && (
        <>
          {allEntered && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              All tanks have closing stock recorded for this date.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeTanks.length === 0 ? (
              <Card>
                <p className="text-gray-400 text-sm">No tanks configured for this station.</p>
              </Card>
            ) : (
              activeTanks.map(tank => {
                const saved = closingByTankId[tank._id];
                const opening = openingByTankId[tank._id];
                const isEditing = stockEditing[tank._id];
                const isSaving = stockSaving[tank._id];
                const errMsg = stockErrors[tank._id];
                const form = stockForms[tank._id] || { value: '', notes: '' };

                return (
                  <div key={tank._id} className="card-modern p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-800">{tank.label}</p>
                        <span className={`badge ${tank.product === 'PMS' ? 'badge-success' : 'badge-info'}`}>
                          {tank.product}
                        </span>
                      </div>
                      {saved && !isEditing && (
                        <button
                          onClick={() => handleStartEdit(tank._id)}
                          className="text-sm text-ecana-maroon hover:underline font-medium"
                        >
                          Edit
                        </button>
                      )}
                    </div>

                    {/* Opening stock reference */}
                    {opening && (
                      <p className="text-xs text-gray-400 mb-3">
                        Opening stock: {fmt(opening.openingStock)} L
                      </p>
                    )}

                    {saved && !isEditing ? (
                      <div>
                        <p className="text-3xl font-bold text-gray-800">
                          {fmt(saved.closingStockMeasured)}{' '}
                          <span className="text-lg font-normal text-gray-500">L</span>
                        </p>
                        {opening && (
                          <p className={`text-sm mt-1 font-medium ${
                            saved.variance < 0 ? 'text-red-600' : saved.variance > 0 ? 'text-green-600' : 'text-gray-500'
                          }`}>
                            Variance: {saved.variance >= 0 ? '+' : ''}{fmt(saved.variance)} L
                          </p>
                        )}
                        {saved.notes && (
                          <p className="text-xs text-gray-500 mt-1">{saved.notes}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">by {saved.supervisorName}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Closing Stock (Litres)
                          </label>
                          <input
                            type="number"
                            className="input-modern"
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            value={form.value}
                            onChange={e => handleFormChange(tank._id, 'value', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Notes (optional)
                          </label>
                          <input
                            type="text"
                            className="input-modern"
                            placeholder="Any observations…"
                            value={form.notes}
                            onChange={e => handleFormChange(tank._id, 'notes', e.target.value)}
                          />
                        </div>
                        {errMsg && <p className="text-sm text-red-600">{errMsg}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSave(tank)}
                            disabled={isSaving}
                            className="btn-modern btn-primary text-sm px-4 py-2 disabled:opacity-60"
                          >
                            {isSaving ? 'Saving…' : 'Save'}
                          </button>
                          {saved && (
                            <button
                              onClick={() => handleCancelEdit(tank._id)}
                              className="btn-modern text-sm px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function ClosingStockPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ClosingStockPageContent />
    </Suspense>
  );
}
