'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import DateCalendar from '@/components/DateCalendar';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}

function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
}

export default function ViewPaymentsPage() {
  const { data: session } = useSession();
  const [payments, setPayments] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [markedDates, setMarkedDates] = useState({});
  const [date, setDate] = useState(today());

  const stationId = session?.user?.stationId;

  const fetchMonthMarks = useCallback(async (monthStr) => {
    if (!stationId) return;
    try {
      const res = await fetch(`/api/payments?stationId=${stationId}&month=${monthStr}`);
      const data = await res.json();
      const grouped = {};
      for (const p of (data.paymentRecords || [])) {
        const d = (p.date || p.createdAt || '').slice(0, 10);
        if (!d) continue;
        if (!grouped[d]) grouped[d] = { total: 0, pending: 0 };
        grouped[d].total += 1;
      }
      setMarkedDates(prev => ({ ...prev, ...grouped }));
    } catch {}
  }, [stationId]);

  const fetchForDate = useCallback(async (dateStr) => {
    if (!stationId) return;
    setLoading(true);
    try {
      const [paymentsRes, depositsRes] = await Promise.all([
        fetch(`/api/payments?stationId=${stationId}&date=${dateStr}`),
        fetch(`/api/cash-deposits?stationId=${stationId}&date=${dateStr}`),
      ]);
      const [paymentsData, depositsData] = await Promise.all([paymentsRes.json(), depositsRes.json()]);
      setPayments(paymentsData.paymentRecords || []);
      setDeposits(depositsData.cashDeposits || []);
    } catch (err) {
      console.error('Error fetching payments:', err);
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    if (!stationId) return;
    fetchMonthMarks(date.slice(0, 7));
    fetchForDate(date);
  }, [session]);

  const handleDateChange = (newDate) => {
    setDate(newDate);
    fetchForDate(newDate);
    if (newDate.slice(0, 7) !== date.slice(0, 7)) {
      fetchMonthMarks(newDate.slice(0, 7));
    }
  };

  const totalCash = payments.reduce((s, p) => s + (p.cashReceived || 0), 0);
  const totalPos = payments.reduce((s, p) => s + (p.posReceived || 0), 0);
  const totalCollected = totalCash + totalPos;
  const totalDeposited = deposits.reduce((s, d) => s + (d.amount || 0), 0);

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-NG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Payment Records</h1>
        <p className="text-sm text-slate-500 mt-1">View collections and deposits for any date.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left: Calendar */}
        <div className="w-full lg:w-80 shrink-0">
          <DateCalendar
            value={date}
            onChange={handleDateChange}
            markedDates={markedDates}
            onMonthChange={fetchMonthMarks}
            maxDate={today()}
          />
          <p className="text-xs text-gray-500 mt-2 text-center">Green = collections recorded that day</p>
        </div>

        {/* Right: Records */}
        <div className="flex-1 min-w-0 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-gray-700 mb-3">{dateLabel}</h2>

            {/* Summary tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="card-modern p-4 text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Cash Collected</p>
                <p className="text-xl font-bold text-gray-800">₦{fmt(totalCash)}</p>
              </div>
              <div className="card-modern p-4 text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">POS Collected</p>
                <p className="text-xl font-bold text-gray-800">₦{fmt(totalPos)}</p>
              </div>
              <div className="card-modern p-4 text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Collected</p>
                <p className="text-xl font-bold text-ecana-maroon">₦{fmt(totalCollected)}</p>
              </div>
              <div className="card-modern p-4 text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Bank Deposits</p>
                <p className="text-xl font-bold text-green-700">₦{fmt(totalDeposited)}</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><div className="spinner" /></div>
          ) : (
            <>
              {/* Collections from supervisors */}
              <Card title={`Collections from Supervisors (${payments.length})`}>
                {payments.length === 0 ? (
                  <p className="text-sm text-gray-500 py-2">No collections recorded for this date.</p>
                ) : (
                  <div className="overflow-auto max-h-[60vh]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="pb-2 pr-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Supervisor</th>
                          <th className="pb-2 pr-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Cash</th>
                          <th className="pb-2 pr-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">POS</th>
                          <th className="pb-2 pr-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                          <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Recorded By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {payments.map((p) => (
                          <tr key={p._id}>
                            <td className="py-2.5 pr-4">
                              <p className="font-medium text-gray-800">{p.supervisorName}</p>
                              <p className="text-xs text-gray-400">
                                {new Date(p.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </td>
                            <td className="py-2.5 pr-4 text-right text-gray-700">₦{fmt(p.cashReceived)}</td>
                            <td className="py-2.5 pr-4 text-right text-gray-700">₦{fmt(p.posReceived)}</td>
                            <td className="py-2.5 pr-4 text-right font-semibold text-gray-900">₦{fmt(p.totalReceived)}</td>
                            <td className="py-2.5 text-xs text-gray-500">{p.recordedByName || '—'}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-gray-300 bg-gray-50">
                          <td className="py-2.5 pr-4 font-semibold text-gray-700 text-xs uppercase">Total</td>
                          <td className="py-2.5 pr-4 text-right font-semibold text-gray-900">₦{fmt(totalCash)}</td>
                          <td className="py-2.5 pr-4 text-right font-semibold text-gray-900">₦{fmt(totalPos)}</td>
                          <td className="py-2.5 pr-4 text-right font-bold text-ecana-maroon">₦{fmt(totalCollected)}</td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* Bank deposits */}
              <Card title={`Bank Deposits (${deposits.length})`}>
                {deposits.length === 0 ? (
                  <p className="text-sm text-gray-500 py-2">No bank deposits recorded for this date.</p>
                ) : (
                  <div className="space-y-3">
                    {deposits.map((dep) => (
                      <div key={dep._id} className="flex items-start justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div>
                          <p className="font-semibold text-slate-900">₦{fmt(dep.amount)}</p>
                          <p className="text-sm text-slate-600">{dep.bankName}{dep.bankBranch ? ` — ${dep.bankBranch}` : ''}</p>
                          <p className="text-xs text-slate-400">Acc: {dep.accountNumber}</p>
                          {dep.note && <p className="text-xs text-slate-500 mt-1">{dep.note}</p>}
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                          dep.status === 'approved' ? 'bg-green-100 text-green-800' :
                          dep.status === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {dep.status}
                        </span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700">Total Deposited</span>
                      <span className="font-bold text-green-700">₦{fmt(totalDeposited)}</span>
                    </div>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
