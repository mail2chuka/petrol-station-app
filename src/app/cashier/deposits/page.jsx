'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Input from '@/components/Input';
import Button from '@/components/Button';

const NIGERIAN_BANKS = [
  'Access Bank', 'Citibank', 'Ecobank', 'Fidelity Bank', 'First Bank',
  'First City Monument Bank (FCMB)', 'GTBank', 'Heritage Bank', 'Keystone Bank',
  'Kuda Bank', 'Moniepoint', 'OPay', 'Palmpay', 'Polaris Bank', 'Providus Bank',
  'Stanbic IBTC', 'Standard Chartered', 'Sterling Bank', 'SunTrust Bank',
  'Titan Trust Bank', 'UBA', 'Union Bank', 'Unity Bank', 'Wema Bank', 'Zenith Bank', 'Other',
];

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmt(n) {
  return `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

const EMPTY_FORM = { amount: '', bankName: '', bankBranch: '', accountNumber: '', note: '' };

function StatusBadge({ status }) {
  const map = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

export default function CashDepositsPage() {
  const { data: session } = useSession();
  const stationId = session?.user?.stationId;

  const [todayDeposits, setTodayDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const todayStr = today();

  const fetchDeposits = useCallback(async () => {
    if (!stationId) return;
    try {
      const res = await fetch(`/api/cash-deposits?stationId=${stationId}&date=${todayStr}`);
      const data = await res.json();
      setTodayDeposits(data.cashDeposits || []);
    } catch (err) {
      console.error('Error fetching deposits:', err);
    } finally {
      setLoading(false);
    }
  }, [stationId, todayStr]);

  useEffect(() => { if (stationId) fetchDeposits(); }, [session]);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (!form.bankName.trim()) { setError('Bank name is required.'); return; }
    if (!form.accountNumber.trim()) { setError('Account number is required.'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Enter a valid amount greater than zero.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/cash-deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          date: todayStr,
          amount: parseFloat(form.amount),
          bankName: form.bankName.trim(),
          bankBranch: form.bankBranch.trim(),
          accountNumber: form.accountNumber.trim(),
          note: form.note.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to record deposit.'); return; }
      setSuccess(`Deposit of ${fmt(parseFloat(form.amount))} to ${form.bankName} submitted for approval.`);
      setForm(EMPTY_FORM);
      await fetchDeposits();
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const totalToday = todayDeposits.reduce((s, d) => s + (d.amount || 0), 0);
  const totalApproved = todayDeposits.filter(d => d.status === 'approved').reduce((s, d) => s + (d.amount || 0), 0);
  const totalPending = todayDeposits.filter(d => d.status === 'pending').reduce((s, d) => s + (d.amount || 0), 0);

  const dateLabel = new Date(todayStr + 'T12:00:00').toLocaleDateString('en-NG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bank Deposits</h1>
        <p className="text-sm text-slate-500 mt-1">{dateLabel}</p>
      </div>

      {/* Today's deposits summary */}
      {!loading && todayDeposits.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card-modern p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Deposits Today</p>
            <p className="text-2xl font-bold text-gray-800">{todayDeposits.length}</p>
          </div>
          <div className="card-modern p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Approved</p>
            <p className="text-xl font-bold text-green-700">{fmt(totalApproved)}</p>
          </div>
          <div className="card-modern p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Pending</p>
            <p className="text-xl font-bold text-amber-600">{fmt(totalPending)}</p>
          </div>
        </div>
      )}

      {/* Today's deposit list */}
      {!loading && todayDeposits.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Today&apos;s Deposits</p>
            <p className="text-sm font-bold text-ecana-maroon">{fmt(totalToday)} total</p>
          </div>
          <div className="divide-y divide-gray-100">
            {todayDeposits.map((dep, i) => (
              <div key={dep._id} className="flex items-start justify-between px-4 py-3 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">#{i + 1} — {fmt(dep.amount)}</p>
                    <StatusBadge status={dep.status} />
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">{dep.bankName}{dep.bankBranch ? ` — ${dep.bankBranch}` : ''}</p>
                  <p className="text-xs text-gray-400">Acct: {dep.accountNumber}</p>
                  {dep.adminNote && (
                    <p className="text-xs text-gray-500 mt-1 italic">Admin: {dep.adminNote}</p>
                  )}
                </div>
                <p className="text-xs text-gray-400 shrink-0">
                  {new Date(dep.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && <div className="flex justify-center py-8"><div className="spinner" /></div>}

      {/* Add deposit form */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowForm(f => !f)}
          className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-ecana-maroon text-white text-sm font-bold flex items-center justify-center">+</span>
            <span className="text-sm font-semibold text-gray-800">
              {todayDeposits.length === 0 ? 'Record First Deposit' : 'Add Another Deposit'}
            </span>
          </div>
          <span className="text-gray-400 text-lg">{showForm ? '▲' : '▼'}</span>
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
            {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">{success}</div>}

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

            {/* Bank name — select from list */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Bank Name <span className="text-red-500">*</span></label>
              <select
                name="bankName"
                value={form.bankName}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 text-sm text-slate-900 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-ecana-maroon focus:ring-4 focus:ring-ecana-maroon/10 transition-all bg-white"
              >
                <option value="">Select bank...</option>
                {NIGERIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Branch (Optional)"
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
                rows={2}
                className="w-full px-4 py-3 text-sm text-slate-900 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-ecana-maroon resize-none"
                placeholder="Teller slip number, reference, etc."
              />
            </div>

            <div className="flex gap-3">
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Deposit for Approval'}
              </Button>
              {todayDeposits.length > 0 && (
                <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setError(''); setSuccess(''); }}>
                  Done
                </Button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
