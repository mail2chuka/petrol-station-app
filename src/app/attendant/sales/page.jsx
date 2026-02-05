'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

// Format currency with Naira symbol
function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '₦0.00';
  }
  return `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RecordSalesPage() {
  const { data: session } = useSession();
  const [activeDayShift, setActiveDayShift] = useState(null);
  const [myAssignments, setMyAssignments] = useState([]);
  const [formData, setFormData] = useState({
    dispenserId: '',
    liters: '',
    cashAmount: '',
    posAmount: '',
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchData();
  }, [session]);

  const fetchData = async () => {
    if (!session?.user?.stationId || !session?.user?.id) return;

    try {
      const res = await fetch(
        `/api/day-shifts?stationId=${session.user.stationId}&status=in_progress`
      );
      const data = await res.json();

      if (data.dayShifts?.length > 0) {
        const dayShift = data.dayShifts[0];
        setActiveDayShift(dayShift);

        // Find all my assignments (in case assigned to multiple dispensers)
        const assignments = dayShift.dispenserAssignments.filter(
          a => a.attendantId === session.user.id
        );
        setMyAssignments(assignments);

        if (assignments.length === 1) {
          setFormData(prev => ({ ...prev, dispenserId: assignments[0].dispenserId }));
        }
      }
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
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dayShiftId: activeDayShift._id,
          dispenserId: formData.dispenserId,
          liters: parseFloat(formData.liters),
          cashAmount: parseFloat(formData.cashAmount) || 0,
          posAmount: parseFloat(formData.posAmount) || 0,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess('Sales recorded successfully!');
        setFormData({
          dispenserId: myAssignments.length === 1 ? myAssignments[0].dispenserId : '',
          liters: '',
          cashAmount: '',
          posAmount: ''
        });
      } else {
        setError(data.error || 'Failed to record sales');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;

  if (!activeDayShift || myAssignments.length === 0) {
    return (
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">Record Sales</h1>
        <Card>
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-amber-100 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-slate-700 font-medium">Not assigned to a dispenser</p>
            <p className="text-sm text-slate-500 mt-1">Please contact your manager for assignment.</p>
          </div>
        </Card>
      </div>
    );
  }

  const selectedAssignment = myAssignments.find(a => a.dispenserId === formData.dispenserId);
  const totalAmount = (parseFloat(formData.cashAmount) || 0) + (parseFloat(formData.posAmount) || 0);

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">Record Sales</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl mb-4 flex items-start gap-3">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl mb-4 flex items-start gap-3">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span>{success}</span>
        </div>
      )}

      <Card title="Sales Entry">
        <form onSubmit={handleSubmit} className="space-y-4">
          {myAssignments.length > 1 && (
            <Select
              label="Select Dispenser"
              name="dispenserId"
              value={formData.dispenserId}
              onChange={handleChange}
              options={myAssignments.map(a => ({
                value: a.dispenserId,
                label: `${a.dispenserName} (${a.fuelType})`,
              }))}
              required
            />
          )}

          {selectedAssignment && (
            <div className="p-4 bg-ecana-blue/5 rounded-xl border border-ecana-blue/20">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Dispenser</p>
              <p className="font-semibold text-slate-900 mt-1">
                {selectedAssignment.dispenserName}
                <span className="mx-2 text-slate-300">•</span>
                <span className="text-ecana-blue">{selectedAssignment.fuelType}</span>
              </p>
            </div>
          )}

          <Input
            label="Liters Sold"
            type="number"
            name="liters"
            value={formData.liters}
            onChange={handleChange}
            placeholder="0.00"
            step="0.01"
            min="0.01"
            required
          />

          <Input
            label="Cash Amount (₦)"
            type="number"
            name="cashAmount"
            value={formData.cashAmount}
            onChange={handleChange}
            placeholder="0.00"
            step="0.01"
            min="0"
          />

          <Input
            label="POS Amount (₦)"
            type="number"
            name="posAmount"
            value={formData.posAmount}
            onChange={handleChange}
            placeholder="0.00"
            step="0.01"
            min="0"
          />

          {totalAmount > 0 && (
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Total Amount</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(totalAmount)}</p>
            </div>
          )}

          <Button type="submit" variant="primary" isLoading={submitting} fullWidth size="lg" className="mt-6">
            {submitting ? 'Recording...' : 'Record Sales'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
