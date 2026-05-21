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
  const [posTerminals, setPosTerminals] = useState([]);
  const [formData, setFormData] = useState({
    attendantId: '',
    cashReceived: '',
    posReceived: '',
    posTerminalId: '',
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
      const [dayShiftRes, usersRes, terminalsRes] = await Promise.all([
        fetch(`/api/day-shifts?stationId=${session.user.stationId}&status=in_progress`),
        fetch(`/api/users?role=supervisor&stationId=${session.user.stationId}`),
        fetch(`/api/pos-terminals?stationId=${session.user.stationId}`),
      ]);

      const dayShiftData = await dayShiftRes.json();
      const usersData = await usersRes.json();
      const terminalsData = await terminalsRes.json();

      if (dayShiftData.dayShifts?.length > 0) {
        setActiveDayShift(dayShiftData.dayShifts[0]);
      }

      setAttendants(usersData.users || []);
      setPosTerminals(terminalsData.terminals || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      // Clear terminal selection if POS amount is cleared
      ...(name === 'posReceived' && !value ? { posTerminalId: '' } : {}),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const posAmount = parseFloat(formData.posReceived) || 0;
    if (posAmount > 0 && posTerminals.length > 0 && !formData.posTerminalId) {
      setError('Please select which POS terminal was used.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dayShiftId: activeDayShift._id,
          attendantId: formData.attendantId,
          cashReceived: parseFloat(formData.cashReceived) || 0,
          posReceived: posAmount,
          posTerminalId: formData.posTerminalId || null,
          notes: formData.notes,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess('Payment recorded successfully!');
        setFormData({ attendantId: '', cashReceived: '', posReceived: '', posTerminalId: '', notes: '' });
      } else {
        setError(data.error || 'Failed to record payment');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;

  if (!activeDayShift) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Record Payments</h1>
        <Card>
          <p className="text-sm text-amber-700">No active day shift found. Please wait for the manager to begin the day.</p>
        </Card>
      </div>
    );
  }

  const cashAmount = parseFloat(formData.cashReceived) || 0;
  const posAmount = parseFloat(formData.posReceived) || 0;
  const totalReceived = cashAmount + posAmount;
  const showTerminalSelector = posAmount > 0 && posTerminals.length > 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Record Payments</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl mb-4 text-sm">
          {success}
        </div>
      )}

      <Card title="Payment Details">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Supervisor / Attendant"
            name="attendantId"
            value={formData.attendantId}
            onChange={handleChange}
            options={[
              { value: '', label: 'Select supervisor...' },
              ...attendants.map((a) => ({ value: a._id, label: a.name })),
            ]}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>

          {showTerminalSelector && (
            <Select
              label="POS Terminal Used"
              name="posTerminalId"
              value={formData.posTerminalId}
              onChange={handleChange}
              options={[
                { value: '', label: 'Select terminal...' },
                ...posTerminals.map((t) => ({
                  value: t._id,
                  label: `${t.label} (${t.provider})`,
                })),
              ]}
              required
            />
          )}

          {posAmount > 0 && posTerminals.length === 0 && (
            <p className="text-xs text-amber-600">No POS terminals configured for this station. Ask admin to add terminals.</p>
          )}

          {totalReceived > 0 && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Cash</span><span>₦{cashAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600 mt-1">
                <span>POS</span><span>₦{posAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 mt-2 pt-2 border-t border-slate-200">
                <span>Total</span><span>₦{totalReceived.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes (Optional)</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="3"
              className="w-full px-4 py-3 text-sm text-slate-900 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-ecana-maroon focus:ring-4 focus:ring-ecana-maroon/10 transition-all resize-none"
              placeholder="Any additional notes..."
            />
          </div>

          <Button type="submit" variant="primary" disabled={submitting || !formData.attendantId}>
            {submitting ? 'Recording...' : 'Record Payment'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
