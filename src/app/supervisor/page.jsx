'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Card, { StatCard } from '@/components/Card';
import Loading from '@/components/Loading';

function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '₦0.00';
  return `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatLiters(liters) {
  if (liters === null || liters === undefined || isNaN(liters)) return '0.00L';
  return `${Number(liters).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}L`;
}

export default function SupervisorDashboard() {
  const { data: session } = useSession();
  const [activeDayShift, setActiveDayShift] = useState(null);
  const [todaySales, setTodaySales] = useState([]);
  const [operatingDate, setOperatingDate] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const stationId = session?.user?.stationId;
  const supervisorId = session?.user?.id;

  const fetchData = useCallback(async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
    try {
      setError('');
      const shiftRes = await fetch(`/api/day-shifts?stationId=${stationId}&status=in_progress`);
      if (!shiftRes.ok) throw new Error('Failed to load active shift');
      const shiftData = await shiftRes.json();
      const openShift = (shiftData.dayShifts || [])[0] || null;
      let displayedShift = openShift;
      if (!displayedShift) {
        const recentRes = await fetch(`/api/day-shifts?stationId=${stationId}`);
        if (!recentRes.ok) throw new Error('Failed to load recent shifts');
        const recent = (await recentRes.json()).dayShifts?.[0];
        const closedToday = recent?.endTime &&
          new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date(recent.endTime)) === today;
        if (recent && (new Date(recent.date).toISOString().slice(0, 10) === today || closedToday)) {
          displayedShift = recent;
        }
      }
      const date = displayedShift ? new Date(displayedShift.date).toISOString().slice(0, 10) : today;
      setActiveDayShift(openShift);
      setOperatingDate(date);

      const salesRes = await fetch(`/api/sales?supervisorId=${supervisorId}&date=${date}`, { cache: 'no-store' });
      if (!salesRes.ok) throw new Error('Failed to load supervisor entries');
      const salesData = await salesRes.json();
      setTodaySales(salesData.salesEntries || []);
    } catch (err) {
      console.error('Error fetching supervisor data:', err);
      setError('Dashboard entries could not be loaded. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [stationId, supervisorId]);

  useEffect(() => {
    if (stationId && supervisorId) {
      fetchData();
    } else if (session) {
      setLoading(false);
    }
  }, [stationId, supervisorId, session, fetchData]);

  if (loading) return <Loading />;

  if (!session?.user?.stationId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Supervisor Dashboard</h1>
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl text-sm">
          Your account is not assigned to a station. Please contact your administrator.
        </div>
      </div>
    );
  }

  const today = new Date(`${operatingDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date())}T12:00:00`).toLocaleDateString('en-NG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Lagos',
  });

  const totalLitersToday = todaySales.reduce((sum, s) => sum + (Number(s.liters) || 0), 0);
  const totalExpectedToday = todaySales.reduce((sum, s) => sum + (Number(s.expectedAmount) || 0), 0);
  const pumpCount = new Set(todaySales.map(s => s.dispenserId)).size;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Supervisor Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">{activeDayShift ? 'Open shift operating date: ' : ''}{today}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Signed in as</p>
          <p className="text-sm font-semibold text-slate-900 truncate max-w-[10rem]">{session?.user?.name}</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}

      {!activeDayShift && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl flex items-start gap-3">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="font-medium">No active day shift</p>
            <p className="text-sm text-amber-700 mt-0.5">Please wait for the manager to begin the day.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Liters Recorded" value={formatLiters(totalLitersToday)} color="blue" />
        <StatCard title="Expected Sales" value={formatCurrency(totalExpectedToday)} color="emerald" />
        <StatCard title="Sales Entries" value={String(todaySales.length)} color="blue" />
        <StatCard title="Pumps Recorded" value={String(pumpCount)} color="maroon" />
      </div>

      {todaySales.length > 0 && (
        <Card title="Recent Sales Entries">
          <div className="divide-y divide-slate-100">
            {todaySales.slice(0, 5).map(sale => (
              <div key={sale._id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 text-sm">
                <div>
                  <p className="font-medium text-slate-800">{sale.dispenserName}</p>
                  <p className="text-slate-500">{sale.fuelType} · {formatLiters(sale.liters)}</p>
                </div>
                <span className="font-semibold tabular-nums text-slate-800">{formatCurrency(sale.expectedAmount)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Quick Actions">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="/supervisor/meter-readings"
            className={`group rounded-xl border p-4 transition-all duration-200 ${
              activeDayShift
                ? 'border-ecana-blue/20 bg-ecana-blue/5 hover:bg-ecana-blue/10'
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeDayShift ? 'bg-ecana-blue text-white' : 'bg-slate-200 text-slate-400'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className={`text-sm font-semibold ${activeDayShift ? 'text-slate-900' : 'text-slate-500'}`}>Record Sales</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeDayShift ? 'Enter liters sold and payments' : 'Waiting for manager to begin the day'}
                </p>
              </div>
            </div>
          </a>

          <a
            href="/supervisor/my-sales"
            className="group rounded-xl border border-emerald-200/50 bg-emerald-50/50 p-4 hover:bg-emerald-100/50 transition-all duration-200"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">My Sales</p>
                <p className="text-xs text-slate-500 mt-0.5">View your sales history and totals</p>
              </div>
            </div>
          </a>
        </div>
      </Card>

    </div>
  );
}
