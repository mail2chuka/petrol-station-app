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

const emptyForm = (dispensers) => ({
  dispenserId: dispensers.length === 1 ? dispensers[0].dispenserId : '',
  liters: '',
  cashAmount: '',
  posAmount: '',
});

export default function RecordSalesPage() {
  const { data: session } = useSession();
  const [activeDayShift, setActiveDayShift] = useState(null);
  const [dispensers, setDispensers] = useState([]);
  const [formData, setFormData] = useState({ dispenserId: '', liters: '', cashAmount: '', posAmount: '' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  /* Display/edit state */
  const [submittedSale, setSubmittedSale] = useState(null); // non-null = show display card
  const [editSaleId, setEditSaleId] = useState(null);       // non-null = editing existing sale

  useEffect(() => {
    fetchData();
  }, [session]);

  const fetchData = async () => {
    if (!session?.user?.stationId) return;
    try {
      const res = await fetch(`/api/day-shifts?stationId=${session.user.stationId}&status=in_progress`);
      const data = await res.json();
      if (data.dayShifts?.length > 0) {
        const dayShift = data.dayShifts[0];
        setActiveDayShift(dayShift);
        const assignments = dayShift.dispenserAssignments || [];
        setDispensers(assignments);
        setFormData(emptyForm(assignments));
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const isEditing = !!editSaleId;
    const url = isEditing ? `/api/sales/${editSaleId}` : '/api/sales';
    const method = isEditing ? 'PATCH' : 'POST';

    const body = isEditing
      ? {
          liters: parseFloat(formData.liters),
          cashAmount: parseFloat(formData.cashAmount) || 0,
          posAmount: parseFloat(formData.posAmount) || 0,
        }
      : {
          dayShiftId: activeDayShift._id,
          dispenserId: formData.dispenserId,
          liters: parseFloat(formData.liters),
          cashAmount: parseFloat(formData.cashAmount) || 0,
          posAmount: parseFloat(formData.posAmount) || 0,
        };

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok) {
        setSubmittedSale(data.salesEntry);
        setEditSaleId(null);
        setFormData(emptyForm(dispensers));
      } else {
        setError(data.error || 'Failed to record sale');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = () => {
    if (!submittedSale) return;
    setEditSaleId(submittedSale._id);
    setFormData({
      dispenserId: submittedSale.dispenserId || '',
      liters: String(submittedSale.liters),
      cashAmount: String(submittedSale.cashAmount),
      posAmount: String(submittedSale.posAmount),
    });
    setSubmittedSale(null);
    setError('');
  };

  const handleRecordAnother = () => {
    setSubmittedSale(null);
    setEditSaleId(null);
    setFormData(emptyForm(dispensers));
    setError('');
  };

  const handleCancelEdit = () => {
    setEditSaleId(null);
    setFormData(emptyForm(dispensers));
    setError('');
  };

  if (loading) return <Loading />;

  if (!activeDayShift) {
    return (
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">Record Sales</h1>
        <Card>
          <p className="text-sm text-amber-700">
            No active day shift. Please wait for the manager to begin the day.
          </p>
        </Card>
      </div>
    );
  }

  const selectedDispenser = dispensers.find((d) => d.dispenserId === formData.dispenserId);
  const totalAmount = (parseFloat(formData.cashAmount) || 0) + (parseFloat(formData.posAmount) || 0);

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">Record Sales</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl mb-4 text-sm">
          {error}
        </div>
      )}

      {/* ── DISPLAY MODE: sale just recorded ── */}
      {submittedSale ? (
        <Card title="Sale Recorded">
          <div className="space-y-4">
            {/* Dispenser info */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm shrink-0">
                ✓
              </div>
              <div>
                <p className="font-semibold text-slate-900">
                  {submittedSale.dispenserName}
                  <span className="mx-2 text-slate-300">•</span>
                  <span className="text-slate-600">{submittedSale.fuelType}</span>
                </p>
                <p className="text-sm text-slate-500">
                  {new Date(submittedSale.createdAt || Date.now()).toLocaleTimeString('en-NG', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>

            {/* Figures */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Liters', value: `${Number(submittedSale.liters).toFixed(2)} L`, highlight: false },
                { label: 'Cash', value: formatCurrency(submittedSale.cashAmount), highlight: false },
                { label: 'POS', value: formatCurrency(submittedSale.posAmount), highlight: false },
                { label: 'Total', value: formatCurrency(submittedSale.totalAmount), highlight: true },
              ].map(({ label, value, highlight }) => (
                <div
                  key={label}
                  className={`rounded-xl p-3 ${highlight ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50'}`}
                >
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">
                    {label}
                  </p>
                  <p
                    className={`text-lg font-bold ${
                      highlight ? 'text-emerald-700' : 'text-slate-900'
                    }`}
                  >
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button variant="primary" size="sm" onClick={handleRecordAnother}>
                Record Another Sale
              </Button>
              <Button variant="secondary" size="sm" onClick={handleEdit}>
                Edit This Sale
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        /* ── FORM MODE: new sale or editing existing ── */
        <Card title={editSaleId ? 'Edit Sale' : 'Sales Entry'}>
          {editSaleId && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              Editing an existing sale. Changes will update the original record.
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editSaleId && (
              <Select
                label="Dispenser"
                name="dispenserId"
                value={formData.dispenserId}
                onChange={handleChange}
                options={[
                  { value: '', label: 'Select dispenser...' },
                  ...dispensers.map((d) => ({
                    value: d.dispenserId,
                    label: `${d.dispenserName} (${d.fuelType})`,
                  })),
                ]}
                required
              />
            )}

            {editSaleId && (
              <div className="p-3 bg-slate-50 rounded-xl text-sm">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Dispenser</p>
                <p className="font-semibold text-slate-900">
                  {dispensers.find((d) => d.dispenserId === formData.dispenserId)?.dispenserName ||
                    formData.dispenserId}
                </p>
              </div>
            )}

            {!editSaleId && selectedDispenser && (
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
                <p className="text-2xl font-bold text-emerald-600 mt-1">
                  {formatCurrency(totalAmount)}
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                type="submit"
                variant="primary"
                isLoading={submitting}
                size="lg"
                className="flex-1"
              >
                {editSaleId ? 'Update Sale' : 'Record Sale'}
              </Button>
              {editSaleId && (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={handleCancelEdit}
                  disabled={submitting}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
