"use client";

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}

function OpenPumpsContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const stationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;

  const [loading, setLoading] = useState(true);
  const [station, setStation] = useState(null);
  const [opening, setOpening] = useState(null);
  const [activeDay, setActiveDay] = useState(null);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (stationId) fetchData();
  }, [stationId]);

  // Source of truth for "is this pump in today's shift" is the day shift's
  // dispenserAssignments — that's what actually gates supervisor meter entry.
  const openPumpIds = useMemo(
    () => new Set((activeDay?.dispenserAssignments || []).map((d) => d.dispenserId)),
    [activeDay]
  );

  async function fetchData() {
    setLoading(true);
    setError('');
    try {
      const [stationsRes, openingsRes, shiftsRes] = await Promise.all([
        fetch('/api/stations'),
        fetch(`/api/pump-openings?stationId=${stationId}&date=${todayIso()}`),
        fetch(`/api/day-shifts?stationId=${stationId}&date=${todayIso()}`),
      ]);
      const stationsData = await stationsRes.json();
      const openingsData = await openingsRes.json();
      const shiftsData = await shiftsRes.json();

      const currentStation = (stationsData.stations || []).find((s) => s._id === stationId) || null;
      setStation(currentStation);
      setOpening((openingsData.openings || [])[0] || null);
      setActiveDay((shiftsData.dayShifts || []).find((s) => s.status === 'in_progress') || null);
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
    if (!activeDay?._id) {
      setError('No active day shift found.');
      return;
    }
    const res = await fetch(`/api/day-shifts/${activeDay._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add-pump', pumpId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to add pump');
      return;
    }
    setSuccess('Pump added to today\'s shift');
    await fetchData();
  }

  async function removePump(pumpId) {
    setError('');
    setSuccess('');
    if (!activeDay?._id) {
      setError('No active day shift found.');
      return;
    }
    const url = `/api/day-shifts/${activeDay._id}`;
    let res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove-pump', pumpId }),
    });
    let data = await res.json();

    // Pump already has readings — admins may force-remove (drops its records).
    if (res.status === 409 && data.requiresForce) {
      const ok = window.confirm(
        'This pump already has recorded readings. Removing it will delete its readings, sales and collections for the day. Continue?'
      );
      if (!ok) return;
      res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove-pump', pumpId, force: true }),
      });
      data = await res.json();
    }

    if (!res.ok) {
      setError(data.error || 'Failed to remove pump');
      return;
    }
    setSuccess('Pump removed from today\'s shift');
    await fetchData();
  }

  if (!stationId || loading) return <Loading />;

  const activeDispensers = (station?.dispensers || []).filter((d) => d.isActive !== false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Open Pumps for the Day</h1>
        <p className="text-sm text-gray-600 mt-1">Only pumps in this list can receive supervisor meter/RTT entries.</p>
      </div>

      {!activeDay && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">No active day shift found.</p>
          <p className="mt-1">You must <strong>Begin Day</strong> before you can open pumps. Go to Begin Day to start today&apos;s shift first.</p>
        </div>
      )}

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded">{success}</div>}

      {activeDay && (
        <Card title="Station Pump Map">
          {activeDispensers.length === 0 ? (
            <p className="text-sm text-gray-500">No active pumps found on this station. Configure pumps via Admin → Stations → Map Pumps/Tanks.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeDispensers.map((pump) => {
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
          )}

          {!opening && activeDispensers.length > 0 && (
            <div className="mt-4">
              <Button onClick={submitInitialOpen}>Create Today Open-Pumps List</Button>
            </div>
          )}
        </Card>
      )}

      {activeDay && (activeDay.dispenserAssignments || []).length > 0 && (
        <Card title="Today Open List">
          <ul className="space-y-2">
            {activeDay.dispenserAssignments.map((d) => (
              <li key={d.dispenserId} className="text-sm text-gray-700">
                {d.dispenserName || d.dispenserId}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export default function OpenPumpsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <OpenPumpsContent />
    </Suspense>
  );
}
