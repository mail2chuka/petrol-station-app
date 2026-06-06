"use client";

import { useEffect, useState, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Table from '@/components/Table';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Loading from '@/components/Loading';

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function SummaryBookContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const stationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;

  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (stationId) fetchRows();
  }, [stationId]);

  async function fetchRows() {
    if (!stationId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/reports/summary-book?stationId=${stationId}&from=${from}&to=${to}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to fetch summary book');
      } else {
        setRows(data.rows || []);
      }
    } catch {
      setError('Failed to fetch summary book');
    } finally {
      setLoading(false);
    }
  }

  function exportFile(format) {
    const url = `/api/reports/summary-book/export?stationId=${stationId}&from=${from}&to=${to}&format=${format}`;
    window.open(url, '_blank');
  }

  if (loading) return <Loading />;

  const columns = [
    { header: 'Date', field: 'date' },
    { header: 'Tank', render: (r) => r.tankLabel || r.tankId || '-' },
    { header: 'Product', field: 'product' },
    { header: 'Opening Time', render: (r) => (r.openingTime ? new Date(r.openingTime).toLocaleTimeString('en-NG') : '-') },
    { header: 'Opening Stock', render: (r) => `${(r.openingStock ?? 0).toFixed(2)}L` },
    { header: 'Stock In', render: (r) => `${(r.stockIn ?? 0).toFixed(2)}L` },
    { header: 'Sales', render: (r) => `${(r.sales ?? 0).toFixed(2)}L` },
    { header: 'Price', render: (r) => `₦${(r.priceForDay ?? 0).toFixed(2)}` },
    { header: 'Total Amount', render: (r) => `₦${(r.totalAmount ?? 0).toFixed(2)}` },
    { header: 'Shortage', render: (r) => `${(r.shortage ?? 0).toFixed(2)}L` },
    { header: 'Overage', render: (r) => `${(r.overage ?? 0).toFixed(2)}L` },
    { header: 'Closing Stock', render: (r) => `${(r.closingStock ?? 0).toFixed(2)}L` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Daily Summary Book</h1>
        <p className="text-sm text-gray-600 mt-1">Per-tank summary with opening stock, stock in, sales, price, shortage and closing stock.</p>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded">{error}</div>}

      <Card title="Filters & Export">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button onClick={fetchRows}>Load Summary</Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => exportFile('excel')}>Export Excel</Button>
            <Button variant="primary" onClick={() => exportFile('pdf')}>Export PDF</Button>
          </div>
        </div>
      </Card>

      <Card title="Summary Rows">
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            <p className="font-medium">No data for this date range.</p>
            <p className="mt-1 text-gray-400">
              Summary rows appear after the manager ends the day and confirms closing stock for each tank.
            </p>
          </div>
        ) : (
          <Table columns={columns} data={rows} />
        )}
      </Card>
    </div>
  );
}

export default function SummaryBookPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SummaryBookContent />
    </Suspense>
  );
}
