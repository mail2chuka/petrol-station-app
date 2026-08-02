'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Card from '@/components/Card';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}

function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
}

export default function CashierDashboard() {
  const { data: session } = useSession();
  const [activeDayShift, setActiveDayShift] = useState(null);
  const [payments, setPayments] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);

  const stationId = session?.user?.stationId;

  const loadData = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const shiftRes = await fetch(`/api/day-shifts?stationId=${stationId}&status=in_progress`);
      const shiftData = await shiftRes.json();
      const shift = (shiftData.dayShifts || [])[0] || null;
      setActiveDayShift(shift);

      // Payments are scoped to the active shift (not just today's date) so a
      // pump reused across shifts doesn't show a prior shift's collection as
      // "already collected" for the current shift, and the totals below don't
      // double up an earlier ended shift's collections into today's figures.
      const [paymentsData, depositsData] = await Promise.all([
        shift
          ? fetch(`/api/payments?stationId=${stationId}&dayShiftId=${shift._id}`).then(r => r.json())
          : Promise.resolve({ paymentRecords: [] }),
        fetch(`/api/cash-deposits?stationId=${stationId}&date=${today()}`).then(r => r.json()),
      ]);

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

  // Track collection per pump (dispenserId), not per supervisor
  const collectedMap = {};
  for (const p of payments) {
    const did = p.dispenserId;
    if (!collectedMap[did]) collectedMap[did] = [];
    collectedMap[did].push(p);
  }

  const dispensers = activeDayShift?.dispenserAssignments || [];
  const uncollectedDisps = dispensers.filter(d => !collectedMap[d.dispenserId]?.length);
  const allCollected = dispensers.length > 0 && uncollectedDisps.length === 0;

  const totalCash = payments.reduce((s, p) => s + (p.cashReceived || 0), 0);
  const totalPos = payments.reduce((s, p) => s + (p.posReceived || 0), 0);
  const totalCollected = totalCash + totalPos;
  const totalDeposited = deposits.reduce((s, d) => s + (d.amount || 0), 0);

  const todayLabel = new Date(today() + 'T12:00:00').toLocaleDateString('en-NG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Cashier Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Welcome, <span className="font-medium text-gray-700">{session?.user?.name || 'Cashier'}</span>. {todayLabel}.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      ) : (
        <>
          {!activeDayShift && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-4 rounded-xl">
              <p className="font-semibold">No Active Day Shift</p>
              <p className="text-sm mt-1">The manager has not started today&apos;s day yet. Collections can only be recorded once the day is open.</p>
            </div>
          )}

          {activeDayShift && allCollected && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-4 rounded-xl flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
              <div>
                <p className="font-semibold">All Pumps Collected — Day can be closed</p>
                <p className="text-sm mt-0.5">All {dispensers.length} pump{dispensers.length !== 1 ? 's' : ''} have been collected from today.</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card-modern p-5 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Cash Collected</p>
              <p className="text-lg sm:text-xl font-bold text-gray-800 break-words tabular-nums leading-tight">₦{fmt(totalCash)}</p>
            </div>
            <div className="card-modern p-5 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">POS Collected</p>
              <p className="text-lg sm:text-xl font-bold text-gray-800 break-words tabular-nums leading-tight">₦{fmt(totalPos)}</p>
            </div>
            <div className="card-modern p-5 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Collected</p>
              <p className="text-lg sm:text-xl font-bold text-ecana-maroon break-words tabular-nums leading-tight">₦{fmt(totalCollected)}</p>
            </div>
            <div className="card-modern p-5 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Bank Deposits</p>
              <p className="text-lg sm:text-xl font-bold text-green-700 break-words tabular-nums leading-tight">₦{fmt(totalDeposited)}</p>
            </div>
          </div>

          {activeDayShift && dispensers.length > 0 && (
            <Card title="Pump Collection Status">
              <div className="divide-y divide-gray-100">
                {dispensers.map(disp => {
                  const records = collectedMap[disp.dispenserId] || [];
                  const done = records.length > 0;
                  const dispTotal = records.reduce((s, p) => s + (p.totalReceived || 0), 0);
                  return (
                    <div key={disp.dispenserId} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${done ? 'bg-green-500' : 'bg-amber-400'}`} />
                        <div>
                          <p className="font-medium text-gray-800 text-sm">{disp.dispenserName}</p>
                          {disp.supervisorName && (
                            <p className="text-xs text-gray-400">{disp.supervisorName}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {done ? (
                          <span className="text-sm font-semibold text-gray-700">₦{fmt(dispTotal)}</span>
                        ) : (
                          <Link
                            href="/cashier/payments"
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
              {uncollectedDisps.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <Link
                    href="/cashier/payments"
                    className="inline-flex items-center text-sm font-medium text-white bg-ecana-maroon hover:bg-ecana-maroon/90 px-4 py-2 rounded-lg transition-colors"
                  >
                    Record Collections →
                  </Link>
                </div>
              )}
            </Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link href="/cashier/payments" className="card-modern p-5 block hover:shadow-md transition-shadow group">
              <p className="font-semibold text-gray-800 group-hover:text-ecana-maroon transition-colors">Record Collections</p>
              <p className="text-sm text-gray-500 mt-1">Collect cash and POS from each supervisor.</p>
            </Link>
            <Link href="/cashier/deposits" className="card-modern p-5 block hover:shadow-md transition-shadow group">
              <p className="font-semibold text-gray-800 group-hover:text-ecana-maroon transition-colors">Bank Deposits</p>
              <p className="text-sm text-gray-500 mt-1">Record cash deposited to the bank. Multiple deposits allowed per day.</p>
            </Link>
            <Link href="/cashier/view-payments" className="card-modern p-5 block hover:shadow-md transition-shadow group">
              <p className="font-semibold text-gray-800 group-hover:text-ecana-maroon transition-colors">Payment History</p>
              <p className="text-sm text-gray-500 mt-1">Browse collections and deposits by date.</p>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
