'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Loading from '@/components/Loading';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
}

function EndDayPageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const activeStationId =
    session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;

  const [activeDayShift, setActiveDayShift] = useState(null);
  const [station, setStation] = useState(null);
  const [meterReadings, setMeterReadings] = useState([]);
  const [tankStockEntries, setTankStockEntries] = useState([]);
  const [salesEntries, setSalesEntries] = useState([]);
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [dateStr, setDateStr] = useState(todayStr());

  // Per-tank closing stock form state
  const [stockForms, setStockForms] = useState({});
  const [stockEditing, setStockEditing] = useState({});
  const [stockSaving, setStockSaving] = useState({});
  const [stockErrors, setStockErrors] = useState({});

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (session?.user) fetchData();
  }, [session, activeStationId]);

  const fetchData = async () => {
    if (!activeStationId) return;
    setLoading(true);
    try {
      const dsRes = await fetch(`/api/day-shifts?stationId=${activeStationId}&status=in_progress`);
      const dsData = await dsRes.json();
      const dayShift = dsData.dayShifts?.[0] || null;
      setActiveDayShift(dayShift);

      if (!dayShift) {
        setLoading(false);
        return;
      }

      const shiftDate = new Date(dayShift.date).toISOString().split('T')[0];
      setDateStr(shiftDate);

      const [stationRes, mrRes, tsRes, salesRes, payRes] = await Promise.all([
        fetch(`/api/stations/${activeStationId}`),
        fetch(`/api/meter-readings?stationId=${activeStationId}&date=${shiftDate}`),
        fetch(`/api/tank-stock?stationId=${activeStationId}&date=${shiftDate}`),
        fetch(`/api/sales?dayShiftId=${dayShift._id}`),
        fetch(`/api/payments?dayShiftId=${dayShift._id}`),
      ]);

      const [stationData, mrData, tsData, salesData, payData] = await Promise.all([
        stationRes.json(),
        mrRes.json(),
        tsRes.json(),
        salesRes.json(),
        payRes.json(),
      ]);

      const stationObj = stationData.station || null;
      setStation(stationObj);
      setMeterReadings(mrData.readings || []);
      setSalesEntries(salesData.salesEntries || []);
      setPaymentRecords(payData.paymentRecords || []);

      initTankState(stationObj, tsData.entries || []);
      setTankStockEntries(tsData.entries || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const initTankState = (stationObj, entries) => {
    const activeTanks = (stationObj?.tanks || []).filter(t => t.isActive);
    const closingByTankId = {};
    for (const e of entries.filter(e => e.period === 'closing')) {
      closingByTankId[e.tankId] = e;
    }
    const newForms = {};
    const newEditing = {};
    for (const tank of activeTanks) {
      const saved = closingByTankId[tank._id];
      newForms[tank._id] = saved
        ? { value: String(saved.closingStockMeasured), notes: saved.notes || '' }
        : { value: '', notes: '' };
      newEditing[tank._id] = !saved;
    }
    setStockForms(newForms);
    setStockEditing(newEditing);
  };

  const refreshTankStock = async () => {
    const tsRes = await fetch(`/api/tank-stock?stationId=${activeStationId}&date=${dateStr}`);
    const tsData = await tsRes.json();
    const entries = tsData.entries || [];
    setTankStockEntries(entries);
    initTankState(station, entries);
  };

  const handleFormChange = (tankId, field, value) => {
    setStockForms(prev => ({ ...prev, [tankId]: { ...prev[tankId], [field]: value } }));
  };

  const handleSaveStock = async (tank) => {
    const form = stockForms[tank._id] || { value: '', notes: '' };
    const value = parseFloat(form.value);
    if (isNaN(value) || value < 0) {
      setStockErrors(prev => ({ ...prev, [tank._id]: 'Enter a valid stock value (0 or greater)' }));
      return;
    }
    setStockErrors(prev => ({ ...prev, [tank._id]: '' }));
    setStockSaving(prev => ({ ...prev, [tank._id]: true }));
    try {
      const res = await fetch('/api/tank-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: activeStationId,
          tankId: tank._id,
          date: dateStr,
          period: 'closing',
          stockValue: value,
          notes: form.notes || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStockErrors(prev => ({ ...prev, [tank._id]: data.error || 'Failed to save' }));
      } else {
        await refreshTankStock();
      }
    } catch {
      setStockErrors(prev => ({ ...prev, [tank._id]: 'Network error. Please try again.' }));
    } finally {
      setStockSaving(prev => ({ ...prev, [tank._id]: false }));
    }
  };

  const handleStartEdit = (tankId) => {
    setStockEditing(prev => ({ ...prev, [tankId]: true }));
  };

  const handleCancelEdit = (tankId) => {
    const saved = tankStockEntries.find(e => e.tankId === tankId && e.period === 'closing');
    if (saved) {
      setStockForms(prev => ({
        ...prev,
        [tankId]: { value: String(saved.closingStockMeasured), notes: saved.notes || '' },
      }));
    }
    setStockEditing(prev => ({ ...prev, [tankId]: false }));
  };

  const handleEndDay = async () => {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/day-shifts/${activeDayShift._id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        const nextUrl = adminStationId ? `/manager?stationId=${adminStationId}` : '/manager';
        router.push(nextUrl);
      } else {
        setError(data.error || 'Failed to end day');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!activeStationId) {
    return (
      <Card title="Select Station">
        <p className="text-sm text-gray-600">Choose a station from the Admin Stations page to manage.</p>
      </Card>
    );
  }

  if (loading) return <Loading />;

  if (!activeDayShift) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-800 mb-8">End Day</h1>
        <Card>
          <p className="text-red-600">{error || 'No active day shift found.'}</p>
        </Card>
      </div>
    );
  }

  const activeTanks = (station?.tanks || []).filter(t => t.isActive);
  const closingByTankId = {};
  for (const e of tankStockEntries.filter(e => e.period === 'closing')) {
    closingByTankId[e.tankId] = e;
  }
  const allClosingEntered =
    activeTanks.length > 0 && activeTanks.every(t => closingByTankId[t._id]);

  // Sales summary — discrepancy based on supervisor collections vs expected (not payment records)
  const salesByFuel = { PMS: { liters: 0, amount: 0 }, AGO: { liters: 0, amount: 0 } };
  let totalCollected = 0;
  salesEntries.forEach(s => {
    salesByFuel[s.fuelType].liters += s.liters;
    salesByFuel[s.fuelType].amount += s.expectedAmount;
    totalCollected += (s.totalAmount || 0);
  });
  const totalExpected = salesByFuel.PMS.amount + salesByFuel.AGO.amount;
  const discrepancy = totalCollected - totalExpected;

  // Payment records — cashier collections per pump
  const totalCash = paymentRecords.reduce((sum, p) => sum + p.cashReceived, 0);
  const totalPos = paymentRecords.reduce((sum, p) => sum + p.posReceived, 0);

  // Pump table: match meter readings to dispenser assignments
  const readingsByPumpId = {};
  for (const r of meterReadings) readingsByPumpId[r.pumpId] = r;
  const pumpRows = activeDayShift.dispenserAssignments.map(d => ({
    ...d,
    reading: readingsByPumpId[d.dispenserId] || null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">End Day</h1>
        <p className="text-gray-500 mt-1">
          {activeDayShift.stationName} —{' '}
          {new Date(activeDayShift.date).toLocaleDateString('en-NG', { dateStyle: 'full' })}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Section 1: Supervisor Meter Readings — read-only report */}
      <Card title="Supervisor Meter Readings">
        {pumpRows.length === 0 ? (
          <p className="text-gray-400 text-sm">No pumps assigned for this shift.</p>
        ) : (
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200">
                  <th className="pb-3 pr-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Pump</th>
                  <th className="pb-3 pr-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Fuel</th>
                  <th className="pb-3 pr-4 font-semibold text-gray-500 uppercase text-xs tracking-wide text-right">Opening</th>
                  <th className="pb-3 pr-4 font-semibold text-gray-500 uppercase text-xs tracking-wide text-right">Closing</th>
                  <th className="pb-3 pr-4 font-semibold text-gray-500 uppercase text-xs tracking-wide text-right">RTT</th>
                  <th className="pb-3 pr-4 font-semibold text-gray-500 uppercase text-xs tracking-wide text-right">Net Litres</th>
                  <th className="pb-3 font-semibold text-gray-500 uppercase text-xs tracking-wide">Supervisor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pumpRows.map((pump, i) => {
                  const r = pump.reading;
                  const netLitres = r ? Math.max(0, r.closing - r.opening - r.rtt) : null;
                  return (
                    <tr key={i} className={!r ? 'bg-amber-50' : ''}>
                      <td className="py-3 pr-4 font-medium text-gray-800">{pump.dispenserName}</td>
                      <td className="py-3 pr-4">
                        <span className={`badge ${pump.fuelType === 'PMS' ? 'badge-success' : 'badge-info'}`}>
                          {pump.fuelType}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right text-gray-700">
                        {r ? fmt(r.opening) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-3 pr-4 text-right text-gray-700">
                        {r ? fmt(r.closing) : <span className="text-amber-600 font-medium">Not entered</span>}
                      </td>
                      <td className="py-3 pr-4 text-right text-gray-700">
                        {r ? fmt(r.rtt) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold text-gray-800">
                        {netLitres !== null ? fmt(netLitres) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-3 text-gray-600 text-xs">
                        {r ? (
                          <span>
                            {r.supervisorName}
                            {r.discrepancyFlag && (
                              <span className="ml-1 text-amber-600 font-bold">⚠</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-amber-600">No reading</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Section 2: Closing Tank Stock — manager entry */}
      <Card title="Closing Tank Stock">
        <p className="text-sm text-gray-500 mb-5">
          Physically measure and enter the stock remaining in each tank.
          All tanks must be recorded before the day can end.
        </p>

        {activeTanks.length === 0 ? (
          <p className="text-gray-400 text-sm">No tanks configured for this station.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeTanks.map(tank => {
              const saved = closingByTankId[tank._id];
                const isMissing = !saved;
                const isEditing = stockEditing[tank._id];
                const isSaving = stockSaving[tank._id];
                const errMsg = stockErrors[tank._id];
                const form = stockForms[tank._id] || { value: '', notes: '' };

                return (
                  <div key={tank._id} className={`card-modern p-4 ${isMissing ? 'border-2 border-red-400 bg-red-50/30' : ''}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-800">{tank.label}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`badge ${tank.product === 'PMS' ? 'badge-success' : 'badge-info'}`}>
                            {tank.product}
                          </span>
                          {isMissing && (
                            <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                              Required
                            </span>
                          )}
                        </div>
                    </div>
                    {saved && !isEditing && (
                      <button
                        onClick={() => handleStartEdit(tank._id)}
                        className="text-sm text-ecana-maroon hover:underline font-medium"
                      >
                        Edit
                      </button>
                    )}
                  </div>

                  {saved && !isEditing ? (
                    <div>
                      <p className="text-3xl font-bold text-gray-800">
                        {fmt(saved.closingStockMeasured)}{' '}
                        <span className="text-lg font-normal text-gray-500">L</span>
                      </p>
                      {saved.notes && (
                        <p className="text-xs text-gray-500 mt-1">{saved.notes}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">by {saved.supervisorName}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Stock Remaining (Litres)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="input-modern"
                          placeholder="0"
                          value={form.value}
                          onChange={e => handleFormChange(tank._id, 'value', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Notes (optional)
                        </label>
                        <input
                          type="text"
                          className="input-modern"
                          placeholder="Any observations..."
                          value={form.notes}
                          onChange={e => handleFormChange(tank._id, 'notes', e.target.value)}
                        />
                      </div>
                      {errMsg && <p className="text-sm text-red-600">{errMsg}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveStock(tank)}
                          disabled={isSaving}
                          className="btn-modern btn-primary text-sm px-4 py-2 disabled:opacity-60"
                        >
                          {isSaving ? 'Saving…' : 'Save'}
                        </button>
                        {saved && (
                          <button
                            onClick={() => handleCancelEdit(tank._id)}
                            className="btn-modern text-sm px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Section 3: Day Summary */}
      <Card title="Day Summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="text-center p-4 bg-green-50 rounded-xl">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">PMS Sales</p>
            <p className="text-lg font-bold text-gray-800">{fmt(salesByFuel.PMS.liters)} L</p>
            <p className="text-sm text-gray-600">₦{fmt(salesByFuel.PMS.amount)}</p>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-xl">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">AGO Sales</p>
            <p className="text-lg font-bold text-gray-800">{fmt(salesByFuel.AGO.liters)} L</p>
            <p className="text-sm text-gray-600">₦{fmt(salesByFuel.AGO.amount)}</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Expected Revenue</p>
            <p className="text-lg font-bold text-gray-800">₦{fmt(totalExpected)}</p>
          </div>
          <div className={`text-center p-4 rounded-xl ${discrepancy < 0 ? 'bg-red-50' : discrepancy > 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Sales Discrepancy</p>
            <p className={`text-lg font-bold ${discrepancy < 0 ? 'text-red-700' : discrepancy > 0 ? 'text-green-700' : 'text-gray-800'}`}>
              {discrepancy >= 0 ? '+' : ''}₦{fmt(discrepancy)}
            </p>
            <p className="text-xs text-gray-400">collected vs expected</p>
          </div>
        </div>

        {/* Accountant payment summary (separate reconciliation) */}
        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Accountant Collections</p>
          <div className="flex gap-6">
            <div>
              <p className="text-xs text-gray-400">Cash</p>
              <p className="font-semibold text-gray-800">₦{fmt(totalCash)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">POS</p>
              <p className="font-semibold text-gray-800">₦{fmt(totalPos)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Total</p>
              <p className="font-semibold text-gray-800">₦{fmt(totalCash + totalPos)}</p>
            </div>
            {paymentRecords.length === 0 && (
              <p className="text-xs text-amber-600 self-center">No payment records entered yet</p>
            )}
          </div>
        </div>
      </Card>

      {/* End Day action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-8">
        {!allClosingEntered && activeTanks.length > 0 && ((
          () => {
            const missingCount = activeTanks.filter(t => !closingByTankId[t._id]).length;
            return (
              <p className="text-sm font-medium text-red-700 bg-red-50 border border-red-200 px-4 py-2 rounded-lg">
                ⛔ {missingCount} tank{missingCount > 1 ? 's' : ''} still need{missingCount === 1 ? 's' : ''} a closing stock reading before the day can end.
              </p>
            );
          }
        )())}
        <button
          onClick={handleEndDay}
          disabled={submitting || !allClosingEntered}
          className="btn-modern text-white font-semibold px-8 py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: allClosingEntered
              ? 'linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%)'
              : '#d1d5db',
          }}
        >
          {submitting ? 'Ending Day…' : 'End Day'}
        </button>
      </div>
    </div>
  );
}

export default function EndDayPage() {
  return (
    <Suspense fallback={<Loading />}>
      <EndDayPageContent />
    </Suspense>
  );
}
