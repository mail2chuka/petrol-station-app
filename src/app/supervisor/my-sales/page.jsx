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
      }
      const results = await Promise.all(promises);
      const salesData = await results[0].json();
      setSales(salesData.salesEntries || []);

      if (results[1]) {
        const assignData = await results[1].json();
        setAssignments(assignData.assignments || []);
      }
    } catch {
      // silent — table will just be empty
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading />;

  // Build a dispenserId -> attendantName lookup from assignments
  const attendantByDispenser = {};
  assignments.forEach((a) => {
    attendantByDispenser[a.dispenserId] = a.attendantName || '—';
  });

  // Derive unique fuel types from sales for the filter
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
