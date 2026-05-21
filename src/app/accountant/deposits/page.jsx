'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

function formatCurrency(n) {
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
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    bankName: '',
    bankBranch: '',
    accountNumber: '',
    note: '',
  });

  useEffect(() => {
    if (session?.user?.stationId) fetchDeposits();
  }, [session]);

  const fetchDeposits = async () => {
    try {
      const res = await fetch(`/api/cash-deposits?stationId=${session.user.stationId}&limit=50`);
      const data = await res.json();
      setDeposits(data.cashDeposits || []);
    } catch (err) {
      console.error('Error fetching deposits:', err);
    } finally {
      setLoading(false);
    }
  };

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
          stationId: session.user.stationId,
          date: form.date,
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
      setForm({ date: new Date().toISOString().split('T')[0], amount: '', bankName: '', bankBranch: '', accountNumber: '', note: '' });
      fetchDeposits();
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Cash Deposits</h1>
        <p className="text-sm text-slate-500 mt-1">Record cash deposits made to the bank. Deposits are sent to the admin for approval.</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">{success}</div>}

      <Card title="Record New Deposit">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Date"
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              required
            />
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
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Bank Name"
              name="bankName"
              value={form.bankName}
              onChange={handleChange}
              placeholder="e.g. First Bank"
              required
            />
            <Input
              label="Bank Branch (Optional)"
              name="bankBranch"
              value={form.bankBranch}
              onChange={handleChange}
              placeholder="e.g. Ikeja Branch"
            />
          </div>
          <Input
            label="Account Number"
            name="accountNumber"
            value={form.accountNumber}
            onChange={handleChange}
            placeholder="10-digit account number"
            required
          />
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

      <Card title={`Deposit History (${deposits.length})`}>
        {deposits.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No deposits recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {deposits.map((dep) => (
              <div key={dep._id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{formatCurrency(dep.amount)}</p>
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
  );
}
