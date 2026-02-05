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
  const [dispensers, setDispensers] = useState([]);
  const [attendants, setAttendants] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, [session]);

  const fetchData = async () => {
    if (!activeStationId) return;

    try {
      const [dispensersRes, usersRes] = await Promise.all([
        fetch(`/api/stations/${activeStationId}/dispensers`),
        fetch(`/api/users?role=attendant&stationId=${activeStationId}`),
      ]);

      const dispensersData = await dispensersRes.json();
      const usersData = await usersRes.json();

      const activeDispensers = dispensersData.dispensers?.filter(d => d.isActive) || [];
      setDispensers(activeDispensers);
      setAttendants(usersData.users || []);

      // Initialize assignments
      setAssignments(
        activeDispensers.map(d => ({
          dispenserId: d.dispenserId,
          dispenserName: d.name,
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
    for (const assignment of assignments) {
      if (!assignment.attendantId || !assignment.initialReading) {
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
          dispensers: assignments.map(a => ({
            dispenserId: a.dispenserId,
            attendantId: a.attendantId,
            initialReading: parseFloat(a.initialReading),
          })),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        alert('Day started successfully!');
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
        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {assignments.map((assignment, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-lg">
                <h3 className="font-medium text-lg mb-4">
                  {assignment.dispenserName} ({assignment.fuelType})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Select
                    label="Attendant"
                    name={`attendant-${index}`}
                    value={assignment.attendantId}
                    onChange={(e) => handleAssignmentChange(index, 'attendantId', e.target.value)}
                    options={attendants.map(a => ({
                      value: a._id,
                      label: a.name,
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
