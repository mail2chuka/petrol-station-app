'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Loading from '@/components/Loading';
import DateCalendar from '@/components/DateCalendar';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
}

function ClosingStockPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const activeStationId =
    session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;

  const [date, setDate] = useState(todayStr());
  const [station, setStation] = useState(null);
  const [tankStockEntries, setTankStockEntries] = useState([]);
  const [markedDates, setMarkedDates] = useState({});
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchMonthMarks = useCallback(async (monthStr) => {
    if (!activeStationId) return;
    setLoadingMonth(true);
    try {
      const res = await fetch(`/api/tank-stock?stationId=${activeStationId}&month=${monthStr}`);
      const data = await res.json();
      if (!res.ok) return;
      const hasClosure = {};
      const hasSomething = {};
      for (const e of data.entries || []) {
        const d = new Date(e.date).toISOString().split('T')[0];
        hasSomething[d] = true;
        if (e.period === 'closing') hasClosure[d] = true;
      }
      const marks = {};
      for (const d of Object.keys(hasSomething)) {
        marks[d] = { total: 1, pending: hasClosure[d] ? 0 : 1 };
      }
      setMarkedDates(marks);
    } catch {} finally { setLoadingMonth(false); }
  }, [activeStationId]);

  useEffect(() => {
    if (activeStationId) {
      const m = new Date().toISOString().slice(0, 7);
      fetchMonthMarks(m);
      fetchData();
    }
  }, [activeStationId, date]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [stationRes, tsRes] = await Promise.all([
        fetch(`/api/stations/${activeStationId}`),
        fetch(`/api/tank-stock?stationId=${activeStationId}&date=${date}`),
      ]);
      const [stationData, tsData] = await Promise.all([
        stationRes.json(),
        tsRes.json(),
      ]);

      if (!stationRes.ok) {
        setError(stationData.error || 'Failed to load station');
        return;
      }
      if (!tsRes.ok) {
        setError(tsData.error || 'Failed to load tank stock entries');
        return;
      }

      const stationObj = stationData.station || null;
      setStation(stationObj);
      const entries = tsData.entries || [];
      setTankStockEntries(entries);
    } catch (err) {
      setError(`Failed to load data: ${err.message || 'Please try again.'}`);
    } finally {
      setLoading(false);
    }
  };


  if (!activeStationId) {
    return (
      <Card title="Select Station">
        <p className="text-sm text-gray-600">Choose a station from the Admin Stations page to manage.</p>
      </Card>
    );
  }

  const activeTanks = (station?.tanks || []).filter(t => t.isActive !== false);
  const closingByTankId = {};
  for (const e of tankStockEntries.filter(e => e.period === 'closing')) {
    closingByTankId[e.tankId] = e;
  }
  const openingByTankId = {};
  for (const e of tankStockEntries.filter(e => e.period === 'opening')) {
    openingByTankId[e.tankId] = e;
  }
  const allEntered = activeTanks.length > 0 && activeTanks.every(t => closingByTankId[t._id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Tank Dipstick Readings</h1>
        <p className="text-gray-500 mt-1">
          View tank opening and closing dipstick readings entered by supervisors for the selected date.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-xl text-sm">
        Tank dipstick readings are now entered by supervisors. This page shows a read-only view of what was recorded.
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
        {/* Calendar */}
        <div className="space-y-2">
          <DateCalendar
            value={date}
            onChange={(d) => setDate(d)}
            onMonthChange={fetchMonthMarks}
            markedDates={markedDates}
            maxDate={todayStr()}
          />
          {loadingMonth && <p className="text-xs text-center text-gray-400">Loading month data…</p>}
        </div>

        {/* Stock content */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">
              {new Date(date + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </h2>
            <button onClick={fetchData} disabled={loading} className="text-sm text-ecana-maroon hover:underline font-medium disabled:opacity-50">
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {loading && <div className="flex justify-center py-12"><div className="spinner" /></div>}

          {!loading && station && (
        <>
          {allEntered && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              All tanks have closing dipstick readings recorded for this date.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeTanks.length === 0 ? (
              <Card>
                <p className="text-amber-700 text-sm font-medium">No active tanks configured for this station.</p>
                <p className="text-gray-500 text-xs mt-1">Go to <strong>Station Config</strong> and add tanks.</p>
              </Card>
            ) : (
              activeTanks.map(tank => {
                const saved = closingByTankId[tank._id];
                const opening = openingByTankId[tank._id];
                const openingDipstick = opening?.closingStockMeasured;
                const closingDipstick = saved?.closingStockMeasured;
                const volumeUsed = openingDipstick != null && closingDipstick != null
                  ? (openingDipstick - closingDipstick) : null;

                return (
                  <div key={tank._id} className="card-modern p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="font-semibold text-gray-800">{tank.label}</p>
                        <span className={`badge ${tank.product === 'PMS' ? 'badge-success' : 'badge-info'}`}>
                          {tank.product}
                        </span>
                      </div>
                      {!saved && (
                        <span className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                          Awaiting supervisor
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-50 rounded-xl p-3">
                        <p className="text-xs text-blue-600 font-medium uppercase tracking-wide mb-1">Opening Dipstick</p>
                        <p className="text-xl font-bold text-gray-900">
                          {openingDipstick != null ? fmt(openingDipstick) : <span className="text-gray-400 text-base font-normal">—</span>}
                          {openingDipstick != null && <span className="text-sm font-normal text-gray-500 ml-1">L</span>}
                        </p>
                        {opening?.supervisorName && (
                          <p className="text-xs text-gray-400 mt-1">by {opening.supervisorName}</p>
                        )}
                      </div>
                      <div className="bg-emerald-50 rounded-xl p-3">
                        <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide mb-1">Closing Dipstick</p>
                        <p className="text-xl font-bold text-gray-900">
                          {closingDipstick != null ? fmt(closingDipstick) : <span className="text-gray-400 text-base font-normal">—</span>}
                          {closingDipstick != null && <span className="text-sm font-normal text-gray-500 ml-1">L</span>}
                        </p>
                        {saved?.supervisorName && (
                          <p className="text-xs text-gray-400 mt-1">by {saved.supervisorName}</p>
                        )}
                      </div>
                    </div>

                    {volumeUsed != null && (
                      <div className="mt-3 flex items-center justify-between bg-slate-50 rounded-xl px-4 py-2.5 text-sm">
                        <span className="text-gray-500">Volume Used</span>
                        <span className="font-bold text-gray-900">{fmt(volumeUsed)} L</span>
                      </div>
                    )}

                    {saved?.notes && (
                      <p className="text-xs text-gray-500 mt-2">{saved.notes}</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClosingStockPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ClosingStockPageContent />
    </Suspense>
  );
}
