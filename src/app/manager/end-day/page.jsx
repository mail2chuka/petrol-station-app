"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

function EndDayPageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const activeStationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;
  const [activeDayShift, setActiveDayShift] = useState(null);
  const [finalReadings, setFinalReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchActiveDayShift();
  }, [session]);

  const fetchActiveDayShift = async () => {
    if (!activeStationId) return;

    try {
      const res = await fetch(
        `/api/day-shifts?stationId=${activeStationId}&status=in_progress`
      );
      const data = await res.json();

      if (data.dayShifts?.length > 0) {
        const dayShift = data.dayShifts[0];
        setActiveDayShift(dayShift);
        
        // Initialize final readings
        setFinalReadings(
          dayShift.dispenserAssignments.map(d => ({
            dispenserId: d.dispenserId,
            dispenserName: d.dispenserName,
            fuelType: d.fuelType,
            attendantName: d.attendantName,
            initialReading: d.initialReading,
            finalReading: '',
          }))
        );
      } else {
        setError('No active day shift found');
      }
    } catch (error) {
      console.error('Error fetching day shift:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleReadingChange = (index, value) => {
    const newReadings = [...finalReadings];
    newReadings[index].finalReading = value;
    setFinalReadings(newReadings);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    // Validate all readings
    for (const reading of finalReadings) {
      if (!reading.finalReading) {
        setError('Please fill in all final readings');
        setSubmitting(false);
        return;
      }
      if (parseFloat(reading.finalReading) < reading.initialReading) {
        setError('Final reading cannot be less than initial reading');
        setSubmitting(false);
        return;
      }
    }

    try {
      const res = await fetch(`/api/day-shifts/${activeDayShift._id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          finalReadings: finalReadings.map(r => ({
            dispenserId: r.dispenserId,
            finalReading: parseFloat(r.finalReading),
          })),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        alert('Day ended successfully!');
        const nextUrl = adminStationId ? `/manager?stationId=${adminStationId}` : '/manager';
        router.push(nextUrl);
      } else {
        setError(data.error || 'Failed to end day');
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

  if (!activeDayShift) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-800 mb-8">End Day</h1>
        <Card>
          <p className="text-red-600">{error || 'No active day shift found'}</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">End Day</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <Card title="Final Dispenser Readings">
        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {finalReadings.map((reading, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-lg">
                <h3 className="font-medium text-lg mb-2">
                  {reading.dispenserName} ({reading.fuelType})
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Attendant: {reading.attendantName}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Initial Reading
                    </label>
                    <input
                      type="text"
                      value={`${reading.initialReading.toFixed(2)}L`}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
                    />
                  </div>
                  <Input
                    label="Final Reading (Liters)"
                    type="number"
                    name={`final-${index}`}
                    value={reading.finalReading}
                    onChange={(e) => handleReadingChange(index, e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min={reading.initialReading}
                    required
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Total Sold
                    </label>
                    <input
                      type="text"
                      value={
                        reading.finalReading
                          ? `${(parseFloat(reading.finalReading) - reading.initialReading).toFixed(2)}L`
                          : '0.00L'
                      }
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <Button type="submit" variant="danger" disabled={submitting}>
              {submitting ? 'Ending Day...' : 'End Day'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function EndDayPage() {
  return (
    <Suspense fallback={<Loading /> }>
      <EndDayPageContent />
    </Suspense>
  );
}
