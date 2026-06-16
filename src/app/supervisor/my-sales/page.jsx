'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Card, { StatCard } from '@/components/Card';
import Table from '@/components/Table';
import Loading from '@/components/Loading';

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}

function formatLiters(liters) {
  if (liters === null || liters === undefined || isNaN(liters)) return '0.00';
  return Number(liters).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Same palette as meter-readings page
const TANK_COLORS = [
  { border: 'border-l-blue-400',   bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-400'   },
  { border: 'border-l-green-400',  bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-400'  },
  { border: 'border-l-amber-400',  bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400'  },
  { border: 'border-l-purple-400', bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-400' },
  { border: 'border-l-rose-400',   bg: 'bg-rose-50',   text: 'text-rose-700',   dot: 'bg-rose-400'   },
];

export default function MySalesPage() {
  const { data: session } = useSession();
  const stationId = session?.user?.stationId;
  const [sales, setSales] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [tankEntries, setTankEntries] = useState([]);
  const [dispenserTankMap, setDispenserTankMap] = useState({}); // dispenserId -> { tankId, tankLabel }
  const [stationTanks, setStationTanks] = useState([]);         // station tank definitions
  const [loading, setLoading] = useState(true);
  const [productFilter, setProductFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState(todayIso());

  useEffect(() => {
    if (session?.user?.id) fetchData();
  }, [session, dateFilter]);

  const fetchData = async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      const promises = [fetch(`/api/sales?supervisorId=${session.user.id}&date=${dateFilter}`)];
      if (stationId) {
        promises.push(fetch(`/api/attendant-assignments?stationId=${stationId}&date=${dateFilter}`));
        promises.push(fetch(`/api/stations/${stationId}`));
        promises.push(fetch(`/api/tank-stock?stationId=${stationId}&date=${dateFilter}`));
      }
      const results = await Promise.all(promises);
      const salesData = await results[0].json();
      setSales(salesData.salesEntries || []);

      if (results[1]) {
        const assignData = await results[1].json();
        setAssignments(assignData.assignments || []);
      }
      if (results[2]) {
        const stationData = await results[2].json();
        const dispensers = stationData.station?.dispensers || [];
        const tanks = stationData.station?.tanks || [];
        setStationTanks(tanks);
        const map = {};
        dispensers.forEach((d) => {
          if (d.tankId) {
            const tank = tanks.find((t) => t._id === d.tankId);
            map[d.dispenserId] = { tankId: d.tankId, tankLabel: tank?.label || d.tankId };
          }
        });
        setDispenserTankMap(map);
      }
      if (results[3]) {
        const tankData = await results[3].json();
        setTankEntries(tankData.entries || []);
      }
    } catch {
      // silent — table will just be empty
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading />;

  // dispenserId -> attendant name
  const attendantByDispenser = {};
  assignments.forEach((a) => {
    attendantByDispenser[a.dispenserId] = a.attendantName || '—';
  });

  // Build tankId → TANK_COLORS index (same logic as meter-readings)
  const tankColorIndex = {};
  let _ci = 0;
  Object.values(dispenserTankMap).forEach(({ tankId }) => {
    if (tankId && !(tankId in tankColorIndex)) {
      tankColorIndex[tankId] = _ci++ % TANK_COLORS.length;
    }
  });
  function getTankColor(tankId) {
    const idx = tankColorIndex[tankId];
    return idx !== undefined ? TANK_COLORS[idx] : null;
  }

  // Build per-tank summary: opening + closing dipstick from today's entries
  const tankSummary = stationTanks
    .filter((t) => t.isActive !== false)
    .map((tank) => {
      const entries = tankEntries.filter((e) => e.tankId === tank._id);
      const opening = entries.find((e) => e.period === 'opening');
      const closing = entries.find((e) => e.period === 'closing');
      const openingVal = opening?.closingStockMeasured ?? null;
      const closingVal = closing?.closingStockMeasured ?? null;
      const used = openingVal != null && closingVal != null ? openingVal - closingVal : null;
      const tc = getTankColor(tank._id);
      return { tank, openingVal, closingVal, used, tc };
    });

  // Fuel types for filter
  const fuelTypes = ['ALL', ...Array.from(new Set(sales.map((s) => s.fuelType).filter(Boolean)))];

  const filteredSales = productFilter === 'ALL'
    ? sales
    : sales.filter((s) => s.fuelType === productFilter);

  const totalLiters = filteredSales.reduce((sum, s) => sum + (Number(s.liters) || 0), 0);

  const columns = [
    {
      header: 'Date/Time',
      render: (row) => new Date(row.createdAt).toLocaleString('en-NG', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      }),
    },
    { header: 'Dispenser', field: 'dispenserName' },
    {
      header: 'Tank',
      render: (row) => {
        const info = dispenserTankMap[row.dispenserId];
        const tc = info ? getTankColor(info.tankId) : null;
        return (
          <span className="flex items-center gap-1.5">
            {tc && <span className={`w-2 h-2 rounded-full shrink-0 ${tc.dot}`} />}
            <span className={tc ? tc.text : 'text-slate-400'}>{info?.tankLabel || '—'}</span>
          </span>
        );
      },
    },
    { header: 'Fuel', field: 'fuelType' },
    {
      header: 'Attendant',
      render: (row) => attendantByDispenser[row.dispenserId] || '—',
    },
    { header: 'Liters (L)', render: (row) => formatLiters(row.liters) },
  ];

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">My Sales</h1>

      {/* Date filter */}
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm font-medium text-slate-600">Date</label>
        <input
          type="date"
          value={dateFilter}
          max={todayIso()}
          onChange={(e) => { setProductFilter('ALL'); setDateFilter(e.target.value); }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-ecana-maroon"
        />
      </div>

      {/* Tank Summary */}
      {tankSummary.length > 0 && (
        <div className="mb-6">
          <Card title="Tank Dipstick — Today">
            {/* Legend */}
            <div className="flex flex-wrap gap-3 items-center mb-3">
              {tankSummary.map(({ tank, tc }) => (
                <div key={tank._id} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${tc?.dot || 'bg-slate-300'}`} />
                  <span className={`text-xs font-medium ${tc?.text || 'text-slate-500'}`}>{tank.label}</span>
                </div>
              ))}
            </div>
            <div className="divide-y divide-slate-100 rounded-xl overflow-hidden border border-slate-100">
              {tankSummary.map(({ tank, openingVal, closingVal, used, tc }) => (
                <div key={tank._id} className={`flex items-center gap-4 px-4 py-3 border-l-4 ${tc?.border || 'border-l-slate-200'} ${tc?.bg || ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${tc?.text || 'text-slate-700'}`}>{tank.label}</p>
                    <p className="text-xs text-slate-400">{tank.product}</p>
                  </div>
                  <div className="text-center px-3">
                    <p className="text-xs text-slate-400 mb-0.5">Opening</p>
                    <p className="text-sm font-bold text-slate-800">
                      {openingVal != null ? formatLiters(openingVal) : <span className="text-slate-300">—</span>}
                    </p>
                  </div>
                  <div className="text-center px-3">
                    <p className="text-xs text-slate-400 mb-0.5">Closing</p>
                    <p className="text-sm font-bold text-slate-800">
                      {closingVal != null ? formatLiters(closingVal) : <span className="text-amber-500 text-xs font-medium">Pending</span>}
                    </p>
                  </div>
                  <div className="text-center px-3">
                    <p className="text-xs text-slate-400 mb-0.5">Used</p>
                    <p className={`text-sm font-bold ${used != null ? 'text-ecana-maroon' : 'text-slate-300'}`}>
                      {used != null ? formatLiters(used) : '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
        <StatCard title="Total Liters" value={formatLiters(totalLiters)} color="blue" />
      </div>

      <Card title={`Sales History (${filteredSales.length} records)`}>
        {/* Product filter */}
        <div className="flex flex-wrap gap-2 mb-4">
          {fuelTypes.map((ft) => (
            <button
              key={ft}
              onClick={() => setProductFilter(ft)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                productFilter === ft
                  ? 'bg-ecana-maroon text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {ft === 'ALL' ? 'All Products' : ft}
            </button>
          ))}
        </div>
        <Table columns={columns} data={filteredSales} emptyMessage="No sales recorded yet" />
      </Card>
    </div>
  );
}
