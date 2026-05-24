'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Card from '@/components/Card';

function today() {
  return new Date().toISOString().split('T')[0];
}

function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
}

export default function AccountantDashboard() {
  const { data: session } = useSession();
  const [activeDayShift, setActiveDayShift] = useState(null);
  const [supervisors, setSupervisors] = useState([]);
  const [payments, setPayments] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);

  const stationId = session?.user?.stationId;

  const loadData = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const [shiftRes, usersRes, paymentsRes, depositsRes] = await Promise.all([
        fetch(`/api/day-shifts?stationId=${stationId}&status=in_progress`),
        fetch(`/api/users?role=supervisor&stationId=${stationId}`),
        fetch(`/api/payments?stationId=${stationId}&date=${today()}`),
        fetch(`/api/cash-deposits?stationId=${stationId}&date=${today()}`),
      ]);

      const [shiftData, usersData, paymentsData, depositsData] = await Promise.all([
        shiftRes.json(), usersRes.json(), paymentsRes.json(), depositsRes.json(),
      ]);

      setActiveDayShift((shiftData.dayShifts || [])[0] || null);
      setSupervisors(usersData.users || []);
      setPayments(paymentsData.paymentRecords || []);
      setDeposits(depositsData.cashDeposits || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    if (stationId) loadData();
  }, [session]);

  // Group payments by supervisorId
  const collectedMap = {};
  for (const p of payments) {
    const sid = p.supervisorId?.toString();
    if (!collectedMap[sid]) collectedMap[sid] = [];
    collectedMap[sid].push(p);
  }

  const uncollectedSups = supervisors.filter(s => !collectedMap[s._id]?.length);
  const allCollected = supervisors.length > 0 && uncollectedSups.length === 0;

  const totalCash = payments.reduce((s, p) => s + (p.cashReceived || 0), 0);
  const totalPos = payments.reduce((s, p) => s + (p.posReceived || 0), 0);
  const totalCollected = totalCash + totalPos;
  const totalDeposited = deposits.reduce((s, d) => s + (d.amount || 0), 0);

  const todayLabel = new Date(today() + 'T12:00:00').toLocaleDateString('en-NG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Accountant Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Welcome, <span className="font-medium text-gray-700">{session?.user?.name || 'Accountant'}</span>. {todayLabel}.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      ) : (
        <>
          {/* No active shift */}
          {!activeDayShift && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-4 rounded-xl">
              <p className="font-semibold">No Active Day Shift</p>
              <p className="text-sm mt-1">The manager has not started today's day yet. Collections can only be recorded once the day is open.</p>
            </div>
          )}

          {/* All collected banner */}
          {activeDayShift && allCollected && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-4 rounded-xl flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
              <div>
                <p className="font-semibold">All Supervisors Collected — Day can be closed</p>
                <p className="text-sm mt-0.5">All {supervisors.length} supervisor{supervisors.length !== 1 ? 's' : ''} have been collected from today.</p>
              </div>
            </div>
          )}

          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card-modern p-5 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Cash Collected</p>
              <p className="text-2xl font-bold text-gray-800">₦{fmt(totalCash)}</p>
            </div>
            <div className="card-modern p-5 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">POS Collected</p>
              <p className="text-2xl font-bold text-gray-800">₦{fmt(totalPos)}</p>
            </div>
            <div className="card-modern p-5 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Collected</p>
              <p className="text-2xl font-bold text-ecana-maroon">₦{fmt(totalCollected)}</p>
            </div>
            <div className="card-modern p-5 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Bank Deposits</p>
              <p className="text-2xl font-bold text-green-700">₦{fmt(totalDeposited)}</p>
            </div>
          </div>

          {/* Supervisor reconciliation status */}
          {activeDayShift && supervisors.length > 0 && (
            <Card title="Supervisor Collection Status">
              <div className="divide-y divide-gray-100">
                {supervisors.map(sup => {
                  const records = collectedMap[sup._id] || [];
                  const done = records.length > 0;
                  const supTotal = records.reduce((s, p) => s + (p.totalReceived || 0), 0);
                  return (
                    <div key={sup._id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${done ? 'bg-green-500' : 'bg-amber-400'}`} />
                        <p className="font-medium text-gray-800 text-sm">{sup.name}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {done ? (
                          <span className="text-sm font-semibold text-gray-700">₦{fmt(supTotal)}</span>
                        ) : (
                          <Link
                            href="/accountant/payments"
                            className="text-xs font-medium text-ecana-maroon hover:underline"
                          >
                            Collect →
                          </Link>
                        )}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          done ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {done ? `${records.length} record${records.length !== 1 ? 's' : ''}` : 'Pending'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {uncollectedSups.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <Link
                    href="/accountant/payments"
                    className="inline-flex items-center text-sm font-medium text-white bg-ecana-maroon hover:bg-ecana-maroon/90 px-4 py-2 rounded-lg transition-colors"
                  >
                    Record Collections →
                  </Link>
                </div>
              )}
            </Card>
          )}

          {/* Quick actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link
              href="/accountant/payments"
              className="card-modern p-5 block hover:shadow-md transition-shadow group"
            >
              <p className="font-semibold text-gray-800 group-hover:text-ecana-maroon transition-colors">Record Collections</p>
              <p className="text-sm text-gray-500 mt-1">Collect cash and POS from each supervisor.</p>
            </Link>
            <Link
              href="/accountant/deposits"
              className="card-modern p-5 block hover:shadow-md transition-shadow group"
            >
              <p className="font-semibold text-gray-800 group-hover:text-ecana-maroon transition-colors">Bank Deposits</p>
              <p className="text-sm text-gray-500 mt-1">Record cash deposited to the bank.</p>
            </Link>
            <Link
              href="/accountant/view-payments"
              className="card-modern p-5 block hover:shadow-md transition-shadow group"
            >
              <p className="font-semibold text-gray-800 group-hover:text-ecana-maroon transition-colors">Payment History</p>
              <p className="text-sm text-gray-500 mt-1">Browse collections and deposits by date.</p>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
