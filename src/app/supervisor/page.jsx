'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Loading from '@/components/Loading';

export default function SupervisorDashboard() {
  const { data: session } = useSession();
  const [activeDayShift, setActiveDayShift] = useState(null);
  const [myAssignment, setMyAssignment] = useState(null);
  const [todayReadings, setTodayReadings] = useState([]);
  const [todayStock, setTodayStock] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user?.stationId) fetchData();
  }, [session]);

  const fetchData = async () => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const [shiftRes, readingsRes, stockRes] = await Promise.all([
        fetch(`/api/day-shifts?stationId=${session.user.stationId}&status=in_progress`),
        fetch(`/api/meter-readings?stationId=${session.user.stationId}&date=${today}`),
        fetch(`/api/tank-stock?stationId=${session.user.stationId}&date=${today}`),
      ]);
      const shiftData = await shiftRes.json();
      const readingsData = await readingsRes.json();
      const stockData = await stockRes.json();

      if (shiftData.dayShifts?.length > 0) {
        const shift = shiftData.dayShifts[0];
        setActiveDayShift(shift);
        const assignment = shift.dispenserAssignments?.find(
          (a) => a.attendantId === session.user.id
        );
        setMyAssignment(assignment || null);
      }

      setTodayReadings(readingsData.readings || []);
      setTodayStock(stockData.entries || []);
    } catch (err) {
      console.error('Error fetching supervisor data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading />;

  const today = new Date().toLocaleDateString('en-NG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

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
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="font-medium text-sm">No active day shift</p>
            <p className="text-xs text-amber-700 mt-0.5">The manager has not started today&apos;s shift yet.</p>
          </div>
        </div>
      )}

      {myAssignment && (
        <Card title="My Assignment Today">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Dispenser', value: myAssignment.dispenserName },
              { label: 'Fuel Type', value: myAssignment.fuelType },
              { label: 'Tank', value: myAssignment.tankLabel || myAssignment.tankId || 'Unmapped' },
              { label: 'Initial Reading', value: `${Number(myAssignment.initialReading || 0).toLocaleString()}L` },
            ].map((item) => (
              <div key={item.label} className="p-3 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500 uppercase tracking-wide">{item.label}</p>
                <p className="text-base font-bold text-slate-900 mt-1">{item.value}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card title="Meter Readings Today">
          {todayReadings.length === 0 ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">No readings submitted yet.</p>
              <a href="/supervisor/meter-readings" className="text-sm font-medium text-ecana-blue hover:underline">Enter now →</a>
            </div>
          ) : (
            <div className="space-y-2">
              {todayReadings.map((r) => (
                <div key={r._id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 font-medium">{r.pumpLabel || r.pumpId}</span>
                  <div className="flex items-center gap-2 text-slate-500 text-xs">
                    <span>{r.opening} → {r.closing}</span>
                    {r.discrepancyFlag && <span className="text-amber-600 font-bold">⚠</span>}
                  </div>
                </div>
              ))}
              <a href="/supervisor/meter-readings" className="text-xs font-medium text-ecana-blue hover:underline block mt-2">Update →</a>
            </div>
          )}
        </Card>

        <Card title="Tank Stock Today">
          {todayStock.length === 0 ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">No stock entries submitted yet.</p>
              <a href="/supervisor/tank-stock" className="text-sm font-medium text-ecana-blue hover:underline">Enter now →</a>
            </div>
          ) : (
            <div className="space-y-2">
              {todayStock.map((s) => (
                <div key={s._id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 font-medium">
                    {s.tankLabel || s.tankId}
                    <span className="text-xs text-slate-400 ml-1 capitalize">({s.period})</span>
                  </span>
                  <span className="text-slate-500 text-xs">{Number(s.closingStockMeasured).toLocaleString()}L</span>
                </div>
              ))}
              <a href="/supervisor/tank-stock" className="text-xs font-medium text-ecana-blue hover:underline block mt-2">Update →</a>
            </div>
          )}
        </Card>
      </div>

      <Card title="Quick Actions">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { href: '/supervisor/meter-readings', label: 'Meter Readings', desc: 'Enter opening, closing & RTT' },
            { href: '/supervisor/tank-stock', label: 'Tank Stock', desc: 'Enter opening & closing stock' },
            { href: '/attendant/sales', label: 'Record Sales', desc: 'Enter liters sold & payments' },
          ].map((action) => (
            <a
              key={action.href}
              href={action.href}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4 hover:bg-slate-100 transition-all"
            >
              <p className="text-sm font-semibold text-slate-900">{action.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{action.desc}</p>
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
