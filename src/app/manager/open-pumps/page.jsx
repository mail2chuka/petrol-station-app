"use client";

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

export default function OpenPumpsPage() {
  const { data: session } = useSession();
  const stationId = session?.user?.stationId;
  const [loading, setLoading] = useState(true);
  const [station, setStation] = useState(null);
  const [opening, setOpening] = useState(null);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (stationId) {
      fetchData();
    }
  }, [stationId]);

  const openPumpIds = useMemo(() => new Set((opening?.pumps || []).map((p) => p._id)), [opening]);

  async function fetchData() {
    setLoading(true);
    setError('');
    try {
      const [stationsRes, openingsRes] = await Promise.all([
        fetch('/api/stations'),
        fetch(`/api/pump-openings?stationId=${stationId}&date=${todayIso()}`),
      ]);
      const stationsData = await stationsRes.json();
      const openingsData = await openingsRes.json();
      const currentStation = (stationsData.stations || []).find((s) => s._id === stationId) || null;
      setStation(currentStation);
      setOpening((openingsData.openings || [])[0] || null);
    } catch (e) {
      setError('Failed to load open pumps');
    } finally {
      setLoading(false);
    }
  }

  function togglePump(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function submitInitialOpen() {
    setError('');
    setSuccess('');
    if (!selected.length) {
      setError('Select at least one pump to open');
      return;
    }

    const res = await fetch('/api/pump-openings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stationId, date: todayIso(), pumpIds: selected }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to open pumps');
      return;
    }

    setSuccess('Open-pumps list created for today');
    setSelected([]);
    await fetchData();
  }

  async function addPump(pumpId) {
    setError('');
    setSuccess('');
    const res = await fetch(`/api/pump-openings/${opening._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', pumpId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to add pump');
      return;
    }
    setSuccess('Pump added to open list');
    await fetchData();
  }

  async function removePump(pumpId) {
    setError('');
    setSuccess('');
    const res = await fetch(`/api/pump-openings/${opening._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', pumpId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to remove pump');
      return;
    }
    setSuccess('Pump removed from open list');
    await fetchData();
  }

  if (!stationId || loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Open Pumps for the Day</h1>
        <p className="text-sm text-gray-600 mt-1">Only pumps in this list can receive supervisor meter/RTT entries.</p>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded">{success}</div>}

      <Card title="Station Pump Map">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(station?.dispensers || []).map((pump) => {
            const isOpen = openPumpIds.has(pump.dispenserId);
            const isSelected = selected.includes(pump.dispenserId);
            return (
              <div key={pump.dispenserId} className="border rounded-lg p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{pump.name}</p>
                  <p className="text-xs text-gray-500">{pump.dispenserId} • {pump.fuelType} • Tank: {pump.tankId || 'Unmapped'}</p>
                </div>
                {!opening ? (
                  <button
                    type="button"
                    onClick={() => togglePump(pump.dispenserId)}
                    className={`px-3 py-1.5 rounded text-xs font-semibold ${isSelected ? 'bg-ecana-blue text-white' : 'bg-gray-100 text-gray-700'}`}
                  >
                    {isSelected ? 'Selected' : 'Select'}
                  </button>
                ) : isOpen ? (
                  <Button variant="danger" size="sm" onClick={() => removePump(pump.dispenserId)}>Remove</Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => addPump(pump.dispenserId)}>Add Late</Button>
                )}
              </div>
            );
          })}
        </div>

        {!opening && (
          <div className="mt-4">
            <Button onClick={submitInitialOpen}>Create Today Open-Pumps List</Button>
          </div>
        )}
      </Card>

      {opening && (
        <Card title="Today Open List">
          <ul className="space-y-2">
            {opening.pumps.map((pump) => (
              <li key={pump._id} className="text-sm text-gray-700">
                {pump.pumpLabel} ({pump._id}) {pump.addedLate ? '• Added late' : ''}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
