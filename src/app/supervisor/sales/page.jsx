'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '₦0.00';
  return `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RecordSalesPage() {
  const { data: session } = useSession();
  const [activeDayShift, setActiveDayShift] = useState(null);
  const [dispensers, setDispensers] = useState([]);
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
    if (!session?.user?.stationId) return;

    try {
      const res = await fetch(
        `/api/day-shifts?stationId=${session.user.stationId}&status=in_progress`
      );
      const data = await res.json();

      if (data.dayShifts?.length > 0) {
        const dayShift = data.dayShifts[0];
        setActiveDayShift(dayShift);
        setDispensers(dayShift.dispenserAssignments || []);

        if (dayShift.dispenserAssignments?.length === 1) {
          setFormData(prev => ({ ...prev, dispenserId: dayShift.dispenserAssignments[0].dispenserId }));
        }
      }
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
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
        setFormData(prev => ({
          dispenserId: dispensers.length === 1 ? dispensers[0].dispenserId : '',
          liters: '',
          cashAmount: '',
          posAmount: '',
        }));
      } else {
        setError(data.error || 'Failed to record sales');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;

  if (!activeDayShift) {
    return (
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">Record Sales</h1>
        <Card>
          <p className="text-sm text-amber-700">No active day shift. Please wait for the manager to begin the day.</p>
        </Card>
      </div>
    );
  }

  const selectedDispenser = dispensers.find(d => d.dispenserId === formData.dispenserId);
  const totalAmount = (parseFloat(formData.cashAmount) || 0) + (parseFloat(formData.posAmount) || 0);

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">Record Sales</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl mb-4 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl mb-4 text-sm">
          {success}
        </div>
      )}

      <Card title="Sales Entry">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Dispenser"
            name="dispenserId"
            value={formData.dispenserId}
            onChange={handleChange}
            options={[
              { value: '', label: 'Select dispenser...' },
              ...dispensers.map(d => ({
                value: d.dispenserId,
                label: `${d.dispenserName} (${d.fuelType})`,
              })),
            ]}
            required
          />

          {selectedDispenser && (
            <div className="p-4 bg-ecana-blue/5 rounded-xl border border-ecana-blue/20">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Selected Dispenser</p>
              <p className="font-semibold text-slate-900 mt-1">
                {selectedDispenser.dispenserName}
                <span className="mx-2 text-slate-300">•</span>
                <span className="text-ecana-blue">{selectedDispenser.fuelType}</span>
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
