'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Card, { StatCard } from '@/components/Card';
import Table from '@/components/Table';
import Loading from '@/components/Loading';

function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '0.00';
  return Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatLiters(liters) {
  if (liters === null || liters === undefined || isNaN(liters)) return '0.00';
  return Number(liters).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MySalesPage() {
  const { data: session } = useSession();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSales();
  }, [session]);

  const fetchSales = async () => {
    if (!session?.user?.id) return;

    try {
      const res = await fetch(`/api/sales?supervisorId=${session.user.id}`);
      const data = await res.json();
      setSales(data.salesEntries || []);
    } catch {
      // silent — table will just be empty
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      header: 'Date/Time',
      render: (row) => new Date(row.createdAt).toLocaleString('en-NG', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      }),
    },
    { header: 'Dispenser', field: 'dispenserName' },
    { header: 'Fuel', field: 'fuelType' },
    { header: 'Liters (L)', render: (row) => formatLiters(row.liters) },
    { header: 'Cash (₦)', render: (row) => formatCurrency(row.cashAmount) },
    { header: 'POS (₦)', render: (row) => formatCurrency(row.posAmount) },
    {
      header: 'Total (₦)',
      render: (row) => (
        <span className="font-semibold text-ecana-maroon">{formatCurrency(row.totalAmount)}</span>
      ),
    },
  ];

  if (loading) return <Loading />;

  const totalLiters = sales.reduce((sum, s) => sum + (Number(s.liters) || 0), 0);
  const totalCash = sales.reduce((sum, s) => sum + (Number(s.cashAmount) || 0), 0);
  const totalPos = sales.reduce((sum, s) => sum + (Number(s.posAmount) || 0), 0);
  const totalAmount = sales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">My Sales</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard title="Total Liters" value={formatLiters(totalLiters)} color="blue" />
        <StatCard title="Total Cash" value={formatCurrency(totalCash)} color="emerald" />
        <StatCard title="Total POS" value={formatCurrency(totalPos)} color="blue" />
        <StatCard title="Total Amount" value={formatCurrency(totalAmount)} color="maroon" />
      </div>

      <Card title={`Sales History (${sales.length} records)`}>
        <Table columns={columns} data={sales} emptyMessage="No sales recorded yet" />
      </Card>
    </div>
  );
}
