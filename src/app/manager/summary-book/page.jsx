"use client";

import { useEffect, useState, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
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

  const [productFilter, setProductFilter] = useState('');

  if (loading) return <Loading />;

  function fmtNum(n) {
    return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const visibleRows = productFilter ? rows.filter(r => r.product === productFilter) : rows;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Daily Summary Book</h1>
        <p className="text-sm text-gray-600 mt-1">Per-product summary with opening stock, stock in, sales, tolerance, shortage and closing stock.</p>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded">{error}</div>}

      <Card title="Filters & Export">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Product</label>
            <select value={productFilter} onChange={e => setProductFilter(e.target.value)}
              className="w-full text-sm border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-ecana-maroon bg-white">
              <option value="">All</option>
              {['PMS','AGO','LPG','DPK'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <Button onClick={fetchRows}>Load Summary</Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => exportFile('excel')}>Excel</Button>
            <Button variant="primary" onClick={() => exportFile('pdf')}>PDF</Button>
          </div>
        </div>
      </Card>

      <Card title="Summary Rows">
        {visibleRows.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            <p className="font-medium">No data for this date range.</p>
            <p className="mt-1 text-gray-400">Summary rows appear after the manager ends the day and confirms closing stock for each tank.</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['Date','Product','Opening Stock (L)','Stock In (L)','Tolerance (L)','Exp. Tolerance (L)','Sales (L)','Price/L (₦)','Sales Amount (₦)','Shortage Recorded (L)','Closing Stock (L)'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleRows.map((r, i) => {
                  const overage = r.overage ?? 0;
                  const shortage = r.shortage ?? 0;
                  const expTol = r.expectedTolerance ?? 0;
                  const isFlagged = expTol > 0 && shortage > expTol;
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium text-gray-900 whitespace-nowrap">{new Date(r.date + 'T12:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                      <td className="px-3 py-2.5 text-gray-700">{r.product || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-700">{fmtNum(r.openingStock)}</td>
                      <td className="px-3 py-2.5 text-gray-700">{fmtNum(r.stockIn)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`block font-medium ${overage > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {overage > 0 ? `+${fmtNum(overage)}` : '—'}
                        </span>
                        {(r.sales ?? 0) > 0 && expTol > 0 && (
                          <span className={`text-xs font-medium block ${shortage <= expTol ? 'text-green-600' : 'text-red-600'}`}>
                            {shortage <= expTol
                              ? `Within ${(r.tolerancePercent ?? ((expTol / (r.sales ?? 0)) * 100)).toFixed(1)}% tolerance`
                              : `${fmtNum(shortage - expTol)} L over tolerance`}
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 ${isFlagged ? 'bg-amber-50 text-amber-800 font-semibold' : 'text-gray-700'}`}>
                        {fmtNum(expTol)}{isFlagged && <span className="ml-1 text-amber-600">⚠</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">{fmtNum(r.sales)}</td>
                      <td className="px-3 py-2.5 text-gray-700">{fmtNum(r.priceForDay)}</td>
                      <td className="px-3 py-2.5 text-gray-700">{fmtNum((r.priceForDay ?? 0) * (r.sales ?? 0))}</td>
                      <td className={`px-3 py-2.5 ${r.shortage > 0 ? 'text-red-600 font-medium' : 'text-gray-700'}`}>{fmtNum(r.shortage)}</td>
                      <td className="px-3 py-2.5 text-gray-700">{fmtNum(r.closingStock)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
