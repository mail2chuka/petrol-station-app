'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Card from '@/components/Card';
import Loading from '@/components/Loading';

const MODULES = [
  {
    label: 'Daily Report',
    href: '/external-auditor/daily',
    desc: 'View the complete daily report for any station and date — sales, collections, meter readings, tank stock.',
  },
  {
    label: 'Monthly Report',
    href: '/external-auditor/monthly',
    desc: 'Month-by-day breakdown of revenue, volumes, and discrepancies for any station.',
  },
];

function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
}

export default function ExternalAuditorDashboard() {
  const { data: session } = useSession();
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stations')
      .then(r => r.json())
      .then(d => setStations(d.stations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString('en-NG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-800">External Audit Portal</h1>
        <p className="text-gray-500 mt-1">
          Welcome, <span className="font-medium text-gray-700">{session?.user?.name || 'Auditor'}</span>. {today}.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="spinner" /></div>
      ) : (
        <>
          {/* Stations overview */}
          <Card title="Stations Under Review">
            {stations.length === 0 ? (
              <p className="text-sm text-gray-500">No stations found.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {stations.map(station => (
                  <div key={station._id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="w-9 h-9 rounded-lg bg-ecana-maroon/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-ecana-maroon">{station.code?.slice(0, 2)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{station.name}</p>
                      <p className="text-xs text-gray-500 truncate">{station.location || station.code}</p>
                    </div>
                    <div className="ml-auto flex gap-1.5 shrink-0">
                      <Link
                        href={`/external-auditor/daily?stationId=${station._id}`}
                        className="text-xs px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-ecana-maroon hover:text-ecana-maroon transition-colors font-medium"
                      >
                        Daily
                      </Link>
                      <Link
                        href={`/external-auditor/monthly?stationId=${station._id}`}
                        className="text-xs px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-ecana-maroon hover:text-ecana-maroon transition-colors font-medium"
                      >
                        Monthly
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Module cards */}
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-3">Reports</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          {/* Access note */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
            External auditor access is read-only. You can view all station data and generate printable reports.
          </div>
        </>
      )}
    </div>
  );
}
