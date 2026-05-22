'use client';

import { useState, useEffect } from 'react';
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
  const [todayReadings, setTodayReadings] = useState([]);
  const [todayStock, setTodayStock] = useState([]);
  const [todaySales, setTodaySales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user?.stationId) {
      fetchData();
    } else if (session) {
      setLoading(false);
    }
  }, [session]);

  const fetchData = async () => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const [shiftRes, readingsRes, stockRes, salesRes] = await Promise.all([
        fetch(`/api/day-shifts?stationId=${session.user.stationId}&status=in_progress`),
        fetch(`/api/meter-readings?stationId=${session.user.stationId}&date=${today}`),
        fetch(`/api/tank-stock?stationId=${session.user.stationId}&date=${today}`),
        fetch(`/api/sales?supervisorId=${session.user.id}`),
      ]);
      const shiftData = await shiftRes.json();
      const readingsData = await readingsRes.json();
      const stockData = await stockRes.json();
      const salesData = await salesRes.json();

      if (shiftData.dayShifts?.length > 0) {
        setActiveDayShift(shiftData.dayShifts[0]);
      }

      setTodayReadings(readingsData.readings || []);
      setTodayStock(stockData.entries || []);

      const todaysSales = (salesData.salesEntries || []).filter(s =>
        new Date(s.date).toISOString().split('T')[0] === today
      );
      setTodaySales(todaysSales);
    } catch (err) {
      console.error('Error fetching supervisor data:', err);
    } finally {
      setLoading(false);
    }
  };

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

  const today = new Date().toLocaleDateString('en-NG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const totalLitersToday = todaySales.reduce((sum, s) => sum + (Number(s.liters) || 0), 0);
  const totalCashToday = todaySales.reduce((sum, s) => sum + (Number(s.cashAmount) || 0), 0);
  const totalPosToday = todaySales.reduce((sum, s) => sum + (Number(s.posAmount) || 0), 0);
  const totalAmountToday = totalCashToday + totalPosToday;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Supervisor Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">{today}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Signed in as</p>
          <p className="text-sm font-semibold text-slate-900 truncate max-w-[10rem]">{session?.user?.name}</p>
        </div>
      </div>

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
        <StatCard title="Liters Today" value={formatLiters(totalLitersToday)} color="blue" />
        <StatCard title="Cash Today" value={formatCurrency(totalCashToday)} color="emerald" />
        <StatCard title="POS Today" value={formatCurrency(totalPosToday)} color="blue" />
        <StatCard title="Total Today" value={formatCurrency(totalAmountToday)} color="maroon" />
      </div>

      <Card title="Quick Actions">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="/supervisor/sales"
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

      {todaySales.length > 0 && (
        <Card title={`Today's Sales (${todaySales.length})`}>
          <div className="space-y-2">
            {todaySales.map((sale, index) => (
              <div key={index} className="p-4 bg-slate-50 rounded-xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-ecana-maroon/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-ecana-maroon">{sale.fuelType}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{formatLiters(sale.liters)}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(sale.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 sm:gap-6">
                  <div className="text-center">
                    <p className="text-xs text-slate-400 uppercase">Cash</p>
                    <p className="text-sm font-medium text-slate-700">{formatCurrency(sale.cashAmount)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400 uppercase">POS</p>
                    <p className="text-sm font-medium text-slate-700">{formatCurrency(sale.posAmount)}</p>
                  </div>
                  <div className="text-center pl-4 border-l border-slate-200">
                    <p className="text-xs text-slate-400 uppercase">Total</p>
                    <p className="text-sm font-bold text-ecana-maroon">{formatCurrency(sale.totalAmount)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
