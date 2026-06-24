'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Card from '@/components/Card';
import Loading from '@/components/Loading';

const MODULES = [
  { label: 'Daily Report', href: '/auditor/daily', desc: 'Full daily report: sales, meter readings, collections, tank stock.' },
  { label: 'Monthly Report', href: '/auditor/monthly', desc: 'Month-by-day revenue and sales breakdown for any station.' },
  { label: 'Meter Book', href: '/auditor/meter-book', desc: 'Verify pump meter readings and spot discrepancies.' },
  { label: 'Tank Stock', href: '/auditor/tank-stock', desc: 'Review opening and closing tank stock entries.' },
  { label: 'Flags', href: '/auditor/flags', desc: 'Raise discrepancy flags and track resolution status.' },
];

const SEVERITY_STYLES = {
  critical: { dot: 'bg-red-500', pill: 'bg-red-100 text-red-700', row: 'bg-red-50', label: 'text-red-700' },
  warning:  { dot: 'bg-amber-500', pill: 'bg-amber-100 text-amber-700', row: 'bg-amber-50', label: 'text-amber-700' },
  info:     { dot: 'bg-blue-400', pill: 'bg-blue-100 text-blue-700', row: 'bg-blue-50', label: 'text-gray-800' },
};

export default function AuditorDashboard() {
  const { data: session } = useSession();
  const [stations, setStations] = useState([]);
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [stRes, flRes] = await Promise.all([
          fetch('/api/stations'),
          fetch('/api/flags?status=open&limit=50'),
        ]);
        const [stData, flData] = await Promise.all([stRes.json(), flRes.json()]);
        setStations(stData.stations || []);
        setFlags(flData.flags || []);
      } catch {
        // silent — tiles just show 0
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const openFlags = flags.filter(f => f.status === 'open');
  const critical = openFlags.filter(f => f.severity === 'critical').length;
  const warning  = openFlags.filter(f => f.severity === 'warning').length;
  const info     = openFlags.filter(f => f.severity === 'info').length;

  const today = new Date().toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Audit Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Welcome, <span className="font-medium text-gray-700">{session?.user?.name || 'Auditor'}</span>. {today}.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="spinner" /></div>
      ) : (
        <>
          {/* Stats tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card-modern p-5 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Stations</p>
              <p className="text-2xl font-bold text-gray-800 tabular-nums">{stations.length}</p>
            </div>
            <div className={`card-modern p-5 text-center ${critical > 0 ? 'bg-red-50 border-red-200' : ''}`}>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Critical</p>
              <p className={`text-2xl font-bold tabular-nums ${critical > 0 ? 'text-red-700' : 'text-gray-800'}`}>{critical}</p>
              <p className="text-xs text-gray-400 mt-0.5">open flags</p>
            </div>
            <div className={`card-modern p-5 text-center ${warning > 0 ? 'bg-amber-50 border-amber-200' : ''}`}>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Warning</p>
              <p className={`text-2xl font-bold tabular-nums ${warning > 0 ? 'text-amber-700' : 'text-gray-800'}`}>{warning}</p>
              <p className="text-xs text-gray-400 mt-0.5">open flags</p>
            </div>
            <div className="card-modern p-5 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Info</p>
              <p className="text-2xl font-bold text-gray-800 tabular-nums">{info}</p>
              <p className="text-xs text-gray-400 mt-0.5">open flags</p>
            </div>
          </div>

          {/* Open flags preview */}
          {openFlags.length > 0 && (
            <Card title="Open Flags">
              <div className="space-y-2">
                {openFlags.slice(0, 6).map(flag => {
                  const s = SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.info;
                  return (
                    <div key={flag._id} className={`flex items-start gap-3 p-3 rounded-lg ${s.row}`}>
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${s.label}`}>{flag.reason}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {flag.stationName} · {new Date(flag.createdAt).toLocaleDateString('en-NG')}
                          {flag.targetType && ` · ${flag.targetType.replace('_', ' ')}`}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-semibold uppercase px-2 py-0.5 rounded-full ${s.pill}`}>
                        {flag.severity}
                      </span>
                    </div>
                  );
                })}
              </div>
              {openFlags.length > 6 && (
                <div className="mt-3 pt-3 border-t border-gray-100 text-center">
                  <Link href="/auditor/flags" className="text-sm text-ecana-maroon hover:underline font-medium">
                    View all {openFlags.length} open flags →
                  </Link>
                </div>
              )}
            </Card>
          )}

          {openFlags.length === 0 && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              No open flags — all clear.
            </div>
          )}

          {/* Module cards */}
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-3">Audit Modules</h2>
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
