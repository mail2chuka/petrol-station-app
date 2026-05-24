'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Card from '@/components/Card';

function todayStr() { return new Date().toISOString().split('T')[0]; }
function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
}

const SEVERITY_STYLES = {
  critical: { dot: 'bg-red-500', pill: 'bg-red-100 text-red-700', row: 'bg-red-50', label: 'text-red-700' },
  warning:  { dot: 'bg-amber-500', pill: 'bg-amber-100 text-amber-700', row: 'bg-amber-50', label: 'text-amber-700' },
  info:     { dot: 'bg-blue-400', pill: 'bg-blue-100 text-blue-700', row: 'bg-blue-50', label: 'text-gray-800' },
};

const SHIFT_STATUS = {
  in_progress: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700' },
  ended:       { label: 'Ended', cls: 'bg-green-100 text-green-700' },
  none:        { label: 'Not Started', cls: 'bg-gray-100 text-gray-500' },
};

const MODULES = [
  { label: 'Daily Report', href: '/auditor/daily', desc: 'Sales, collections, meter readings, tank stock — full daily view per station.' },
  { label: 'Monthly Report', href: '/auditor/monthly', desc: 'Month-by-day revenue and sales breakdown across a selected station.' },
  { label: 'Meter Book', href: '/auditor/meter-book', desc: 'Pump meter readings with opening/closing discrepancy detection.' },
  { label: 'Tank Stock', href: '/auditor/tank-stock', desc: 'Opening and closing tank stock entries with variance.' },
  { label: 'Flags', href: '/auditor/flags', desc: 'All raised flags — open, acknowledged, and resolved.' },
];

export default function DailyAuditorDashboard() {
  const { data: session } = useSession();
  const [stations, setStations] = useState([]);
  const [todayShifts, setTodayShifts] = useState([]);
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = todayStr();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [stRes, shRes, flRes] = await Promise.all([
          fetch('/api/stations'),
          fetch(`/api/day-shifts?date=${today}&limit=20`),
          fetch('/api/flags?status=open&limit=100'),
        ]);
        const [stData, shData, flData] = await Promise.all([stRes.json(), shRes.json(), flRes.json()]);
        setStations(stData.stations || []);
        setTodayShifts(shData.dayShifts || []);
        setFlags(flData.flags || []);
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, []);

  // Cross-reference stations with today's shifts
  const shiftByStation = {};
  for (const shift of todayShifts) {
    shiftByStation[String(shift.stationId)] = shift;
  }

  const openFlags = flags.filter(f => f.status === 'open');
  const critical = openFlags.filter(f => f.severity === 'critical');
  const warning  = openFlags.filter(f => f.severity === 'warning');
  const info     = openFlags.filter(f => f.severity === 'info');

  const shiftsStarted = todayShifts.length;
  const shiftsEnded   = todayShifts.filter(s => s.status === 'ended').length;

  const todayLabel = new Date(today + 'T12:00:00').toLocaleDateString('en-NG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Audit Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Welcome, <span className="font-medium text-gray-700">{session?.user?.name || 'Auditor'}</span>. {todayLabel}.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      ) : (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card-modern p-5 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Stations</p>
              <p className="text-3xl font-bold text-gray-800">{stations.length}</p>
            </div>
            <div className="card-modern p-5 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Today's Shifts</p>
              <p className="text-3xl font-bold text-gray-800">{shiftsStarted}</p>
              <p className="text-xs text-gray-400 mt-0.5">{shiftsEnded} ended · {shiftsStarted - shiftsEnded} active</p>
            </div>
            <div className={`card-modern p-5 text-center ${critical.length > 0 ? 'bg-red-50 border-red-200' : ''}`}>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Critical Flags</p>
              <p className={`text-3xl font-bold ${critical.length > 0 ? 'text-red-700' : 'text-gray-800'}`}>{critical.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">open</p>
            </div>
            <div className={`card-modern p-5 text-center ${warning.length > 0 ? 'bg-amber-50 border-amber-200' : ''}`}>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Warning Flags</p>
              <p className={`text-3xl font-bold ${warning.length > 0 ? 'text-amber-700' : 'text-gray-800'}`}>{warning.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">open</p>
            </div>
          </div>

          {/* Today's station overview */}
          <Card title={`Today's Station Overview — ${todayLabel}`}>
            {stations.length === 0 ? (
              <p className="text-sm text-gray-500">No stations found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-gray-200">
                      <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Station</th>
                      <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Shift Status</th>
                      <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide text-right">Expected</th>
                      <th className="pb-3 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide text-right">Discrepancy</th>
                      <th className="pb-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stations.map(station => {
                      const shift = shiftByStation[String(station._id)];
                      const statusKey = shift ? shift.status : 'none';
                      const st = SHIFT_STATUS[statusKey] || SHIFT_STATUS.none;
                      const discrepancy = shift?.discrepancy ?? null;
                      return (
                        <tr key={station._id}>
                          <td className="py-3 pr-4">
                            <p className="font-medium text-gray-800">{station.name}</p>
                            <p className="text-xs text-gray-400">{station.code}</p>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${st.cls}`}>
                              {st.label}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-right text-gray-700">
                            {shift ? `₦${fmt(shift.expectedAmount)}` : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="py-3 pr-4 text-right font-semibold">
                            {discrepancy === null ? (
                              <span className="text-gray-300">—</span>
                            ) : (
                              <span className={discrepancy < 0 ? 'text-red-600' : discrepancy > 0 ? 'text-green-600' : 'text-gray-400'}>
                                {discrepancy >= 0 ? '+' : ''}₦{fmt(discrepancy)}
                              </span>
                            )}
                          </td>
                          <td className="py-3">
                            <Link
                              href={`/auditor/daily?stationId=${station._id}&date=${today}`}
                              className="text-xs font-medium text-ecana-maroon hover:underline"
                            >
                              View Report →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Open flags — critical first */}
          {openFlags.length > 0 ? (
            <Card title={`Open Flags (${openFlags.length})`}>
              <div className="space-y-2">
                {[...critical, ...warning, ...info].slice(0, 8).map(flag => {
                  const s = SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.info;
                  return (
                    <div key={flag._id} className={`flex items-start gap-3 p-3 rounded-lg ${s.row}`}>
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${s.label}`}>{flag.reason}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {flag.stationName} · {new Date(flag.createdAt).toLocaleDateString('en-NG')}
                          {flag.targetType && ` · ${flag.targetType.replace('_', ' ')}`}
                          {flag.raisedByUserName && ` · by ${flag.raisedByUserName}`}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-semibold uppercase px-2 py-0.5 rounded-full ${s.pill}`}>
                        {flag.severity}
                      </span>
                    </div>
                  );
                })}
              </div>
              {openFlags.length > 8 && (
                <div className="mt-3 pt-3 border-t border-gray-100 text-center">
                  <Link href="/auditor/flags" className="text-sm text-ecana-maroon hover:underline font-medium">
                    View all {openFlags.length} open flags →
                  </Link>
                </div>
              )}
            </Card>
          ) : (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              No open flags — all clear.
            </div>
          )}

          {/* Audit modules */}
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-3">Audit Tools</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {MODULES.map(m => (
                <Link
                  key={m.href}
                  href={m.href}
                  className="card-modern p-5 block hover:shadow-md transition-shadow group"
                >
                  <p className="font-semibold text-gray-800 group-hover:text-ecana-maroon transition-colors">
                    {m.label}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">{m.desc}</p>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
