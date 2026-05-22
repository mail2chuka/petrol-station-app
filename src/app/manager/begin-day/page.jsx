"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

function BeginDayPageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const activeStationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;
  const [station, setStation] = useState(null);
  const [supervisors, setSupervisors] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [openPumps, setOpenPumps] = useState([]);
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
      const [stationsRes, dispensersRes, usersRes, openingsRes] = await Promise.all([
        fetch('/api/stations'),
        fetch(`/api/stations/${activeStationId}/dispensers`),
        fetch(`/api/users?role=supervisor&stationId=${activeStationId}`),
        fetch(`/api/pump-openings?stationId=${activeStationId}&date=${new Date().toISOString().split('T')[0]}`),
      ]);

      const stationsData = await stationsRes.json();
      const dispensersData = await dispensersRes.json();
      const usersData = await usersRes.json();
      const openingsData = await openingsRes.json();

      const currentStation = (stationsData.stations || []).find((s) => s._id === activeStationId) || null;
      setStation(currentStation);
      setPricesAtStart({
        PMS: currentStation?.currentPrices?.PMS != null ? String(currentStation.currentPrices.PMS) : '',
        AGO: currentStation?.currentPrices?.AGO != null ? String(currentStation.currentPrices.AGO) : '',
      });
      const todayOpening = (openingsData.openings || [])[0] || null;
      const openPumpIds = new Set((todayOpening?.pumps || []).map((pump) => pump._id));
      setOpenPumps(todayOpening?.pumps || []);

      const activeDispensers = (dispensersData.dispensers || [])
        .filter((dispenser) => dispenser.isActive)
        .filter((dispenser) => openPumpIds.size === 0 || openPumpIds.has(dispenser.dispenserId));
      setSupervisors(usersData.users || []);

      // Initialize assignments
      setAssignments(
        activeDispensers.map(d => ({
          dispenserId: d.dispenserId,
          dispenserName: d.name,
          tankId: d.tankId || '',
          fuelType: d.fuelType,
          attendantId: '',
          initialReading: '',
        }))
      );
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignmentChange = (index, field, value) => {
    const newAssignments = [...assignments];
    newAssignments[index][field] = value;
    setAssignments(newAssignments);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    // Validate all assignments
    if (!pricesAtStart.PMS || !pricesAtStart.AGO) {
      setError('Please enter the PMS and AGO prices for the day.');
      setSubmitting(false);
      return;
    }

    for (const assignment of assignments) {
      if (!assignment.attendantId || assignment.initialReading === '') {
        setError('Please fill in all fields for each dispenser');
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
            PMS: parseFloat(pricesAtStart.PMS),
            AGO: parseFloat(pricesAtStart.AGO),
          },
          dispensers: assignments.map(a => ({
            dispenserId: a.dispenserId,
            fuelType: a.fuelType,
            attendantId: a.attendantId,
            initialReading: parseFloat(a.initialReading),
          })),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        const nextUrl = adminStationId ? `/manager?stationId=${adminStationId}` : '/manager';
        router.push(nextUrl);
      } else {
        setError(data.error || 'Failed to begin day');
      }
    } catch (error) {
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

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Begin Day</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <Card title="Dispenser Assignments">
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="PMS Price For The Day (N/L)"
            type="number"
            name="price-pms"
            value={pricesAtStart.PMS}
            onChange={(e) => setPricesAtStart((current) => ({ ...current, PMS: e.target.value }))}
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
            onChange={(e) => setPricesAtStart((current) => ({ ...current, AGO: e.target.value }))}
            placeholder="Enter AGO price"
            step="0.01"
            min="0.01"
            required
          />
        </div>
        {openPumps.length > 0 && (
          <div className="mb-4 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900">
            Assignments are limited to pumps in today&apos;s open-pumps list.
          </div>
        )}
        {openPumps.length === 0 && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            No open-pumps list found for today. All active pumps are shown.
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {assignments.map((assignment, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-lg">
                <h3 className="font-medium text-lg mb-4">
                  {assignment.dispenserName} ({assignment.fuelType})
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Tank: {station?.tanks?.find((tank) => tank._id === assignment.tankId)?.label || assignment.tankId || 'Unmapped'}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Select
                    label="Supervisor"
                    name={`attendant-${index}`}
                    value={assignment.attendantId}
                    onChange={(e) => handleAssignmentChange(index, 'attendantId', e.target.value)}
                    options={supervisors.map(supervisor => ({
                      value: supervisor._id,
                      label: supervisor.name,
                    }))}
                    required
                  />
                  <Input
                    label="Initial Reading (Liters)"
                    type="number"
                    name={`reading-${index}`}
                    value={assignment.initialReading}
                    onChange={(e) => handleAssignmentChange(index, 'initialReading', e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Starting Day...' : 'Begin Day'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function BeginDayPage() {
  return (
    <Suspense fallback={<Loading /> }>
      <BeginDayPageContent />
    </Suspense>
  );
}
