"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

function BeginDayPageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const activeStationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;
  const [dispensers, setDispensers] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [initialReadings, setInitialReadings] = useState({});
  const [pricesAtStart, setPricesAtStart] = useState({ PMS: '', AGO: '' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
      setPricesAtStart({
        PMS: currentStation?.currentPrices?.PMS != null ? String(currentStation.currentPrices.PMS) : '',
        AGO: currentStation?.currentPrices?.AGO != null ? String(currentStation.currentPrices.AGO) : '',
      });

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
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleReadingChange = (id, value) => {
    setInitialReadings(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const pmsNum = parseFloat(pricesAtStart.PMS);
    const agoNum = parseFloat(pricesAtStart.AGO);
    if (!pricesAtStart.PMS || !pricesAtStart.AGO || isNaN(pmsNum) || isNaN(agoNum) || pmsNum <= 0 || agoNum <= 0) {
      setError('Please enter valid PMS and AGO prices greater than zero.');
      setSubmitting(false);
      return;
    }

    if (selected.size === 0) {
      setError('Please select at least one pump to activate.');
      setSubmitting(false);
      return;
    }

    const selectedDispensers = dispensers.filter(d => selected.has(d.dispenserId));
    for (const d of selectedDispensers) {
      if (initialReadings[d.dispenserId] === undefined || initialReadings[d.dispenserId] === '') {
        setError(`Please enter the initial reading for ${d.name}`);
        setSubmitting(false);
        return;
      }
    }

    try {
      const res = await fetch('/api/day-shifts/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: activeStationId,
          date: new Date().toISOString().split('T')[0],
          pricesAtStart: {
            PMS: pmsNum,
            AGO: agoNum,
          },
          dispensers: selectedDispensers.map(d => ({
            dispenserId: d.dispenserId,
            fuelType: d.fuelType,
            initialReading: parseFloat(initialReadings[d.dispenserId]),
          })),
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
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

  if (!activeStationId) {
    return (
      <Card title="Select Station">
        <p className="text-sm text-gray-600">Choose a station from the Admin Stations page to manage.</p>
      </Card>
    );
  }

  if (loading) return <Loading />;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Begin Day</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card title="Day Prices">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="PMS Price For The Day (N/L)"
              type="number"
              name="price-pms"
              value={pricesAtStart.PMS}
              onChange={e => setPricesAtStart(p => ({ ...p, PMS: e.target.value }))}
              placeholder="Enter PMS price"
              step="0.01"
              min="0.01"
              required
            />
            <Input
              label="AGO Price For The Day (N/L)"
              type="number"
              name="price-ago"
              value={pricesAtStart.AGO}
              onChange={e => setPricesAtStart(p => ({ ...p, AGO: e.target.value }))}
              placeholder="Enter AGO price"
              step="0.01"
              min="0.01"
              required
            />
          </div>
        </Card>

        <Card title="Activate Pumps" className="mt-6">
          <p className="text-sm text-gray-600 mb-4">
            Tick the pumps to activate for today, then enter each pump&apos;s starting meter reading.
          </p>
          {dispensers.length === 0 ? (
            <p className="text-sm text-gray-500">
              No active pumps found. Configure pumps via Admin &rarr; Stations &rarr; Map Pumps/Tanks.
            </p>
          ) : (
            <div className="space-y-3">
              {dispensers.map(d => (
                <div key={d.dispenserId} className="border border-gray-200 rounded-lg p-4">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selected.has(d.dispenserId)}
                      onChange={() => togglePump(d.dispenserId)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                    />
                    <span className="font-medium text-gray-900">{d.name}</span>
                    <span className="text-xs text-gray-500 ml-1">{d.fuelType} &bull; {d.dispenserId}</span>
                  </label>
                  {selected.has(d.dispenserId) && (
                    <div className="mt-3 ml-7 max-w-xs">
                      <Input
                        label="Initial Meter Reading (Liters)"
                        type="number"
                        name={`reading-${d.dispenserId}`}
                        value={initialReadings[d.dispenserId] ?? ''}
                        onChange={e => handleReadingChange(d.dispenserId, e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        required
                      />
                    </div>
                  )}
                </div>
              ))}
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
