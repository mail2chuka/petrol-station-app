'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Select from '@/components/Select';
import Loading from '@/components/Loading';

const DATA_TYPES = [
  {
    id: 'day_shifts',
    label: 'Day Shifts',
    description: 'All day shift records (begin day / end day history)',
    danger: true,
  },
  {
    id: 'meter_readings',
    label: 'Meter Readings',
    description: 'All opening and closing pump meter readings',
    danger: true,
  },
  {
    id: 'sales',
    label: 'Sales Entries',
    description: 'All sales recorded by supervisors',
    danger: true,
  },
  {
    id: 'pump_openings',
    label: 'Pump Openings',
    description: 'Daily pump opening records',
    danger: false,
  },
  {
    id: 'stock_movements',
    label: 'Stock Movements',
    description: 'All stock receipt and adjustment records',
    danger: true,
  },
  {
    id: 'tank_stock',
    label: 'Tank Stock Entries',
    description: 'Opening and closing tank measurements',
    danger: false,
  },
  {
    id: 'cash_deposits',
    label: 'Cash Deposits',
    description: 'All bank deposit records by cashiers',
    danger: false,
  },
  {
    id: 'payments',
    label: 'Payment Collections',
    description: 'All cashier payment collection records',
    danger: false,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'All system notifications',
    danger: false,
  },
  {
    id: 'flags',
    label: 'Flags',
    description: 'All auditor/admin flags and issues',
    danger: false,
  },
  {
    id: 'audit_logs',
    label: 'Audit Logs',
    description: 'Full audit trail — only reset if starting fresh',
    danger: true,
  },
  {
    id: 'station_stock',
    label: 'Reset Stock to Zero',
    description: 'Sets station current stock to 0 for all products (fixes null/empty stock bugs)',
    danger: true,
  },
];

export default function ResetPage() {
  const [stations, setStations] = useState([]);
  const [stationId, setStationId] = useState('');
  const [counts, setCounts] = useState({});
  const [countsLoading, setCountsLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stations')
      .then(r => r.json())
      .then(d => setStations(d.stations || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!stationId) { setCounts({}); return; }
    setCountsLoading(true);
    fetch(`/api/admin/reset?stationId=${stationId}`)
      .then(r => r.json())
      .then(d => setCounts(d.counts || {}))
      .finally(() => setCountsLoading(false));
  }, [stationId]);

  const selectedStation = stations.find(s => s._id === stationId);
  const expectedPhrase = selectedStation ? `RESET ${selectedStation.name.toUpperCase()}` : '';

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(DATA_TYPES.map(d => d.id)));
  const deselectAll = () => setSelected(new Set());

  const handleReset = async () => {
    setError('');
    setResult(null);

    if (!stationId) { setError('Select a station first.'); return; }
    if (!selected.size) { setError('Select at least one data type.'); return; }
    if (confirmPhrase.trim().toUpperCase() !== expectedPhrase) {
      setError(`Type exactly: ${expectedPhrase}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          targets: [...selected],
          confirmPhrase: confirmPhrase.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Reset failed');
        return;
      }
      setResult(data);
      setConfirmPhrase('');
      setSelected(new Set());
      // Refresh counts
      const countRes = await fetch(`/api/admin/reset?stationId=${stationId}`);
      const countData = await countRes.json();
      setCounts(countData.counts || {});
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reset Station Data</h1>
        <p className="text-sm text-gray-500 mt-1">
          Permanently delete operational records for a station. Use this to start fresh before go-live or during testing.
          Station configuration (dispensers, tanks, prices) is never deleted.
        </p>
      </div>

      {/* Danger banner */}
      <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
        <svg className="w-5 h-5 text-red-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <div>
          <p className="font-semibold text-red-800">This action is irreversible</p>
          <p className="text-sm text-red-700 mt-0.5">
            Deleted records cannot be recovered. Ensure you have exported any data you need before proceeding.
          </p>
        </div>
      </div>

      {/* Station selector */}
      <Card title="1. Select Station">
        <Select
          label="Station"
          value={stationId}
          onChange={e => { setStationId(e.target.value); setResult(null); setError(''); setSelected(new Set()); setConfirmPhrase(''); }}
          options={[
            { value: '', label: 'Choose a station...' },
            ...stations.map(s => ({ value: s._id, label: `${s.name} (${s.code})` })),
          ]}
        />
      </Card>

      {/* Data type selection */}
      {stationId && (
        <Card title="2. Choose Data to Reset">
          <div className="flex gap-3 mb-4">
            <button onClick={selectAll} className="text-xs text-ecana-maroon font-medium hover:underline">Select All</button>
            <span className="text-gray-300">|</span>
            <button onClick={deselectAll} className="text-xs text-gray-500 hover:underline">Deselect All</button>
            <span className="ml-auto text-xs text-gray-400">{selected.size} of {DATA_TYPES.length} selected</span>
          </div>

          <div className="space-y-2">
            {DATA_TYPES.map(dt => {
              const count = counts[dt.id];
              const isSelected = selected.has(dt.id);
              return (
                <label
                  key={dt.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    isSelected
                      ? dt.danger ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-200'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(dt.id)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-ecana-maroon cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isSelected && dt.danger ? 'text-red-800' : 'text-gray-800'}`}>
                        {dt.label}
                      </span>
                      {dt.danger && (
                        <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium">Danger</span>
                      )}
                      {countsLoading ? (
                        <span className="text-xs text-gray-400 ml-auto">…</span>
                      ) : count != null && dt.id !== 'station_stock' ? (
                        <span className="text-xs text-gray-500 ml-auto font-mono">{count} record{count !== 1 ? 's' : ''}</span>
                      ) : null}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{dt.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </Card>
      )}

      {/* Confirmation */}
      {stationId && selected.size > 0 && (
        <Card title="3. Confirm Reset">
          <p className="text-sm text-gray-700 mb-3">
            Type <strong className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-red-700">{expectedPhrase}</strong> to confirm:
          </p>
          <input
            type="text"
            value={confirmPhrase}
            onChange={e => { setConfirmPhrase(e.target.value); setError(''); }}
            placeholder={expectedPhrase}
            className="w-full px-4 py-3 text-sm font-mono border-2 border-gray-300 rounded-xl focus:outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
            autoComplete="off"
          />

          {error && (
            <p className="mt-2 text-sm text-red-600 font-medium">{error}</p>
          )}

          <div className="mt-4">
            <Button
              variant="danger"
              onClick={handleReset}
              disabled={submitting || confirmPhrase.trim().toUpperCase() !== expectedPhrase}
            >
              {submitting ? 'Resetting...' : `Reset ${selected.size} data type${selected.size !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </Card>
      )}

      {/* Result */}
      {result && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-2">
          <p className="font-semibold text-green-800">Reset complete for {result.stationName}</p>
          <div className="space-y-1">
            {Object.entries(result.deleted).map(([key, val]) => (
              <p key={key} className="text-sm text-green-700 font-mono">
                {key.replace(/_/g, ' ')}: {typeof val === 'number' ? `${val} deleted` : val}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
