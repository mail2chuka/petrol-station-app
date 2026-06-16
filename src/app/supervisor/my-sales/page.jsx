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

  useEffect(() => {
    if (session?.user?.id) fetchData();
  }, [session]);

  const fetchData = async () => {
    if (!session?.user?.id) return;
    try {
      const today = todayIso();
      const promises = [fetch(`/api/sales?supervisorId=${session.user.id}`)];
      if (stationId) {
        promises.push(fetch(`/api/attendant-assignments?stationId=${stationId}&date=${today}`));
        promises.push(fetch(`/api/stations/${stationId}`));
        promises.push(fetch(`/api/tank-stock?stationId=${stationId}&date=${today}`));
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
      return { tank, openingVal, closingVal, used };
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
      render: (row) => dispenserTankMap[row.dispenserId]?.tankLabel || '—',
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

      {/* Tank Summary */}
      {tankSummary.length > 0 && (
        <div className="mb-6">
          <Card title="Tank Dipstick — Today">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 pr-4 font-semibold text-slate-500">Tank</th>
                    <th className="text-left py-2 pr-4 font-semibold text-slate-500">Product</th>
                    <th className="text-right py-2 pr-4 font-semibold text-slate-500">Opening (L)</th>
                    <th className="text-right py-2 pr-4 font-semibold text-slate-500">Closing (L)</th>
                    <th className="text-right py-2 font-semibold text-slate-500">Used (L)</th>
                  </tr>
                </thead>
                <tbody>
                  {tankSummary.map(({ tank, openingVal, closingVal, used }) => (
                    <tr key={tank._id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 pr-4 font-medium text-slate-800">{tank.label}</td>
                      <td className="py-2.5 pr-4">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                          {tank.product}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">
                        {openingVal != null ? formatLiters(openingVal) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">
                        {closingVal != null ? formatLiters(closingVal) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={`py-2.5 text-right font-semibold ${used != null ? 'text-ecana-maroon' : 'text-slate-300'}`}>
                        {used != null ? formatLiters(used) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
