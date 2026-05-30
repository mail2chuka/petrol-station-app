'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Button from '@/components/Button';
import DateCalendar from '@/components/DateCalendar';

function today() {
  return new Date().toISOString().split('T')[0];
}

function fmt(n) {
  return `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

function StatusBadge({ status }) {
  const map = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] || ''}`}>
      {status}
    </span>
  );
}

export default function CashDepositsPage() {
  const { data: session } = useSession();
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [date, setDate] = useState(today());
  const [markedDates, setMarkedDates] = useState({});
  const [form, setForm] = useState({
    amount: '',
    bankName: '',
    bankBranch: '',
    accountNumber: '',
    note: '',
  });

  const stationId = session?.user?.stationId;

  const fetchDeposits = useCallback(async () => {
    if (!stationId) return;
    try {
      const res = await fetch(`/api/cash-deposits?stationId=${stationId}&limit=200`);
      const data = await res.json();
      const all = data.cashDeposits || [];
      setDeposits(all);

      // Build month marks from all loaded deposits
      const grouped = {};
      for (const dep of all) {
        const d = (dep.date || dep.createdAt || '').slice(0, 10);
        if (!d) continue;
        if (!grouped[d]) grouped[d] = { total: 0, pending: 0 };
        grouped[d].total += 1;
        if (dep.status === 'pending') grouped[d].pending += 1;
      }
      setMarkedDates(grouped);
    } catch (err) {
      console.error('Error fetching deposits:', err);
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    if (stationId) fetchDeposits();
  }, [session]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.bankName.trim() || !form.accountNumber.trim() || !form.amount) {
      setError('Bank name, account number, and amount are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/cash-deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          date,
          amount: parseFloat(form.amount),
          bankName: form.bankName.trim(),
          bankBranch: form.bankBranch.trim(),
          accountNumber: form.accountNumber.trim(),
          note: form.note.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to record deposit');
        return;
      }
      setSuccess('Deposit recorded and sent to admin for approval.');
      setForm({ amount: '', bankName: '', bankBranch: '', accountNumber: '', note: '' });
      fetchDeposits();
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter deposits shown in history to those matching selected date
  const depositsForDate = deposits.filter(d => (d.date || d.createdAt || '').slice(0, 10) === date);
  const allDeposits = deposits.slice(0, 30);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Cash Deposits</h1>
        <p className="text-sm text-slate-500 mt-1">Record cash deposits made to the bank. Select a date then fill in the deposit details.</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">{success}</div>}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left: Calendar */}
        <div className="w-full lg:w-80 shrink-0 space-y-3">
          <DateCalendar
            value={date}
            onChange={setDate}
            markedDates={markedDates}
            maxDate={today()}
          />
          <p className="text-xs text-gray-500 text-center">Amber = pending approval · Green = approved</p>

          {/* Deposits for selected date */}
          {!loading && depositsForDate.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Deposits on {new Date(date + 'T12:00:00').toLocaleDateString('en-NG', { dateStyle: 'medium' })}
              </p>
              {depositsForDate.map((dep) => (
                <div key={dep._id} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{fmt(dep.amount)}</p>
                    <p className="text-xs text-gray-500">{dep.bankName}</p>
                  </div>
                  <StatusBadge status={dep.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Form + history */}
        <div className="flex-1 min-w-0 space-y-4">
          <Card title={`Record Deposit — ${new Date(date + 'T12:00:00').toLocaleDateString('en-NG', { dateStyle: 'long' })}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Amount (₦)"
                  type="number"
                  name="amount"
                  value={form.amount}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  required
                />
                <Input
                  label="Bank Name"
                  name="bankName"
                  value={form.bankName}
                  onChange={handleChange}
                  placeholder="e.g. First Bank"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Bank Branch (Optional)"
                  name="bankBranch"
                  value={form.bankBranch}
                  onChange={handleChange}
                  placeholder="e.g. Ikeja Branch"
                />
                <Input
                  label="Account Number"
                  name="accountNumber"
                  value={form.accountNumber}
                  onChange={handleChange}
                  placeholder="10-digit account number"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Note (Optional)</label>
                <textarea
                  name="note"
                  value={form.note}
                  onChange={handleChange}
                  rows="2"
                  className="w-full px-4 py-3 text-sm text-slate-900 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-ecana-maroon focus:ring-4 focus:ring-ecana-maroon/10 transition-all resize-none"
                  placeholder="Any additional notes about this deposit..."
                />
              </div>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'Recording...' : 'Record Deposit'}
              </Button>
            </form>
          </Card>

          <Card title={`Recent Deposit History (${allDeposits.length})`}>
            {loading ? (
              <div className="flex justify-center py-8"><div className="spinner" /></div>
            ) : allDeposits.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No deposits recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {allDeposits.map((dep) => (
                  <div key={dep._id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{fmt(dep.amount)}</p>
                        <p className="text-sm text-slate-600 mt-0.5">{dep.bankName}{dep.bankBranch ? ` — ${dep.bankBranch}` : ''}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Acc: {dep.accountNumber}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <StatusBadge status={dep.status} />
                        <p className="text-xs text-slate-400 mt-1">{new Date(dep.date).toLocaleDateString('en-NG')}</p>
                      </div>
                    </div>
                    {dep.adminNote && (
                      <p className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-200">
                        Admin note: {dep.adminNote}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
