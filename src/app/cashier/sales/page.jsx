'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Loading from '@/components/Loading';

function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

export default function CashierSalesPage() {
  const { data: session } = useSession();
  const [date, setDate] = useState(todayStr());
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (session) fetchSales();
  }, [session, date]);

  async function fetchSales() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/sales?date=${date}`);
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Failed to load sales');
      else setSales(data.salesEntries || []);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  const totalLiters = sales.reduce((s, e) => s + (Number(e.liters) || 0), 0);
  const totalExpected = sales.reduce((s, e) => s + (Number(e.expectedAmount) || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Sales Records</h1>
        <p className="text-sm text-gray-500 mt-1">Daily sales entries recorded by supervisors at the pumps.</p>
      </div>

      <Card>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={date}
              max={todayStr()}
              onChange={e => setDate(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-ecana-maroon"
            />
          </div>
          <button onClick={fetchSales} disabled={loading}
            className="px-4 py-1.5 text-sm bg-ecana-maroon text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium">
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </Card>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}

      {loading ? <Loading /> : (
        <Card title={`Sales Entries — ${date} (${sales.length} record${sales.length !== 1 ? 's' : ''})`}>
          {sales.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No sales records for this date.</p>
          ) : (
            <>
              <div className="overflow-auto max-h-[60vh]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="pb-2 pr-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
                      <th className="pb-2 pr-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Pump</th>
                      <th className="pb-2 pr-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Fuel</th>
                      <th className="pb-2 pr-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Supervisor</th>
                      <th className="pb-2 pr-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Liters (L)</th>
                      <th className="pb-2 pr-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Price/L (₦)</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Expected (₦)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sales.map((s, i) => (
                      <tr key={s._id || i} className="hover:bg-gray-50">
                        <td className="py-2.5 pr-4 text-gray-600">{s.createdAt ? fmtTime(s.createdAt) : '—'}</td>
                        <td className="py-2.5 pr-4 font-medium text-gray-900">{s.dispenserName || '—'}</td>
                        <td className="py-2.5 pr-4 text-gray-700">{s.fuelType || '—'}</td>
                        <td className="py-2.5 pr-4 text-gray-700">{s.supervisorName || '—'}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-900">{fmtNum(s.liters)}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-700">{fmtNum(s.pricePerLiter)}</td>
                        <td className="py-2.5 text-right font-semibold text-gray-900">{fmtNum(s.expectedAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td colSpan={4} className="py-2.5 pr-4 text-xs font-bold text-gray-600 uppercase tracking-wide">Total</td>
                      <td className="py-2.5 pr-4 text-right text-sm font-bold text-gray-900">{fmtNum(totalLiters)}</td>
                      <td className="py-2.5 pr-4"></td>
                      <td className="py-2.5 text-right text-sm font-bold text-gray-900">{fmtNum(totalExpected)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
