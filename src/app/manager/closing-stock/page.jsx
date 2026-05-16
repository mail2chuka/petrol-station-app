"use client";

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

export default function ClosingStockPage() {
  const { data: session } = useSession();
  const stationId = session?.user?.stationId;
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayIso());
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (stationId) fetchEntries();
  }, [stationId, date]);

  async function fetchEntries() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/tank-stock/manager-confirm?stationId=${stationId}&date=${date}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load tank stock entries');
      } else {
        setEntries((data.entries || []).map((e) => ({ ...e, closingStockManagerInput: e.closingStockManager ?? '' })));
      }
    } catch {
      setError('Failed to load tank stock entries');
    } finally {
      setLoading(false);
    }
  }

  async function save(entry) {
    const value = Number(entry.closingStockManagerInput);
    if (Number.isNaN(value) || value < 0) {
      setError('Enter a valid non-negative manager closing stock');
      return;
    }

    const res = await fetch('/api/tank-stock/manager-confirm', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: entry._id, closingStockManager: value }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to save manager closing stock');
      return;
    }

    await fetchEntries();
  }

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Closing Stock (Manager Confirmed)</h1>
        <p className="text-sm text-gray-600 mt-1">Set manager-confirmed closing stock per tank separately from supervisor measurements.</p>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded">{error}</div>}

      <Card title="Date">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Card>

      <Card title="Tank Entries">
        <div className="space-y-3">
          {entries.map((entry, idx) => (
            <div key={entry._id} className="border rounded-lg p-3 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div>
                <p className="text-xs text-gray-500">Tank</p>
                <p className="font-semibold text-gray-900">{entry.tankLabel || entry.tankId}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Product</p>
                <p className="font-semibold text-gray-900">{entry.product}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Opening</p>
                <p className="font-semibold text-gray-900">{entry.openingStock?.toFixed(2)}L</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Supervisor Closing</p>
                <p className="font-semibold text-gray-900">{entry.closingStockMeasured?.toFixed(2)}L</p>
              </div>
              <Input
                label="Manager Closing"
                type="number"
                min="0"
                step="0.01"
                value={entry.closingStockManagerInput}
                onChange={(e) => {
                  const next = [...entries];
                  next[idx].closingStockManagerInput = e.target.value;
                  setEntries(next);
                }}
              />
              <Button onClick={() => save(entry)}>Save</Button>
            </div>
          ))}
          {!entries.length && <p className="text-sm text-gray-500">No tank entries found for this date.</p>}
        </div>
      </Card>
    </div>
  );
}
