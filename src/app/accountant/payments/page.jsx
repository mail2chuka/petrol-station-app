'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

export default function RecordPaymentsPage() {
  const { data: session } = useSession();
  const [activeDayShift, setActiveDayShift] = useState(null);
  const [attendants, setAttendants] = useState([]);
  const [formData, setFormData] = useState({
    attendantId: '',
    cashReceived: '',
    posReceived: '',
    notes: '',
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchData();
  }, [session]);

  const fetchData = async () => {
    if (!session?.user?.stationId) return;

    try {
      const [dayShiftRes, usersRes] = await Promise.all([
        fetch(`/api/day-shifts?stationId=${session.user.stationId}&status=in_progress`),
        fetch(`/api/users?role=attendant&stationId=${session.user.stationId}`),
      ]);

      const dayShiftData = await dayShiftRes.json();
      const usersData = await usersRes.json();

      if (dayShiftData.dayShifts?.length > 0) {
        setActiveDayShift(dayShiftData.dayShifts[0]);
      }

      setAttendants(usersData.users || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dayShiftId: activeDayShift._id,
          attendantId: formData.attendantId,
          cashReceived: parseFloat(formData.cashReceived) || 0,
          posReceived: parseFloat(formData.posReceived) || 0,
          notes: formData.notes,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess('Payment recorded successfully!');
        setFormData({ attendantId: '', cashReceived: '', posReceived: '', notes: '' });
      } else {
        setError(data.error || 'Failed to record payment');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;

  if (!activeDayShift) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Record Payments</h1>
        <Card>
          <p className="text-red-600">
            No active day shift found. Please wait for the manager to begin the day.
          </p>
        </Card>
      </div>
    );
  }

  const totalReceived = (parseFloat(formData.cashReceived) || 0) + (parseFloat(formData.posReceived) || 0);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Record Payments</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      <Card title="Payment Details">
        <form onSubmit={handleSubmit}>
          <Select
            label="Select Attendant"
            name="attendantId"
            value={formData.attendantId}
            onChange={handleChange}
            options={attendants.map(a => ({
              value: a._id,
              label: a.name,
            }))}
            required
          />

          <Input
            label="Cash Received (₦)"
            type="number"
            name="cashReceived"
            value={formData.cashReceived}
            onChange={handleChange}
            placeholder="0.00"
            step="0.01"
            min="0"
          />

          <Input
            label="POS Received (₦)"
            type="number"
            name="posReceived"
            value={formData.posReceived}
            onChange={handleChange}
            placeholder="0.00"
            step="0.01"
            min="0"
          />

          {totalReceived > 0 && (
            <div className="mb-4 p-3 bg-ecana-maroon-50 rounded-lg">
              <p className="text-xs text-gray-600">Total Received</p>
              <p className="text-2xl font-bold text-ecana-maroon">₦{totalReceived.toFixed(2)}</p>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="3"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Any additional notes..."
            />
          </div>

          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Recording...' : 'Record Payment'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
