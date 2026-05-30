'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Button from '@/components/Button';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmt(n) {
  return `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RecordSalesPage() {
  const { data: session } = useSession();
  const stationId = session?.user?.stationId;

  const [activeDayShift, setActiveDayShift] = useState(null);
  const [dispensers, setDispensers] = useState([]);      // dispenserAssignments from shift
  const [meterReadings, setMeterReadings] = useState({}); // { dispenserId: reading }
  const [existingSales, setExistingSales] = useState({});  // { dispenserId: salesEntry }
  const [forms, setForms] = useState({});                  // { dispenserId: { liters, cash, pos } }
  const [editing, setEditing] = useState({});              // { dispenserId: bool }
  const [submitting, setSubmitting] = useState({});
  const [messages, setMessages] = useState({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const [shiftRes, salesRes, readingsRes] = await Promise.all([
        fetch(`/api/day-shifts?stationId=${stationId}&status=in_progress`),
        fetch(`/api/sales?stationId=${stationId}&supervisorId=${session.user.id}`),
        fetch(`/api/meter-readings?stationId=${stationId}&date=${today()}`),
      ]);
      const [shiftData, salesData, readingsData] = await Promise.all([
        shiftRes.json(), salesRes.json(), readingsRes.json(),
      ]);

      const shift = (shiftData.dayShifts || [])[0] || null;
      setActiveDayShift(shift);

      const assignments = shift?.dispenserAssignments || [];
      setDispensers(assignments);

      // Map sales by dispenserId
      const salesMap = {};
      for (const s of (salesData.salesEntries || [])) {
        if (shift && s.dayShiftId === shift._id) {
          salesMap[s.dispenserId] = s;
        }
      }
      setExistingSales(salesMap);

      // Map meter readings by pumpId (dispenserId)
      const readingsMap = {};
      for (const r of (readingsData.readings || [])) {
        readingsMap[r.pumpId] = r;
      }
      setMeterReadings(readingsMap);

      // Build form state — pre-fill liters from meter reading if no existing sale
      const initialForms = {};
      const initialEditing = {};
      for (const d of assignments) {
        const existing = salesMap[d.dispenserId];
        const reading = readingsMap[d.dispenserId];
        const suggestedLiters = reading
          ? Math.max(0, (reading.closing || 0) - (reading.opening || 0) - (reading.rtt || 0))
          : null;

        initialForms[d.dispenserId] = existing
          ? { liters: String(existing.liters), cash: String(existing.cashAmount), pos: String(existing.posAmount) }
          : { liters: suggestedLiters != null ? suggestedLiters.toFixed(2) : '', cash: '', pos: '' };

        initialEditing[d.dispenserId] = !existing;
      }
      setForms(initialForms);
      setEditing(initialEditing);
      setMessages({});
    } catch (err) {
      console.error('Error loading sales data:', err);
    } finally {
      setLoading(false);
    }
  }, [stationId, session?.user?.id]);

  useEffect(() => {
    if (stationId) loadData();
  }, [session]);

  const updateForm = (dispId, field, value) => {
    setForms(prev => ({ ...prev, [dispId]: { ...prev[dispId], [field]: value } }));
  };

  const startEditing = (dispId) => {
    const existing = existingSales[dispId];
    if (existing) {
      setForms(prev => ({
        ...prev,
        [dispId]: { liters: String(existing.liters), cash: String(existing.cashAmount), pos: String(existing.posAmount) },
      }));
    }
    setEditing(prev => ({ ...prev, [dispId]: true }));
    setMessages(prev => ({ ...prev, [dispId]: '' }));
  };

  const cancelEditing = (dispId) => {
    setEditing(prev => ({ ...prev, [dispId]: false }));
    setMessages(prev => ({ ...prev, [dispId]: '' }));
  };

  const submitSale = async (dispenser) => {
    const f = forms[dispenser.dispenserId] || {};
    const liters = parseFloat(f.liters);
    const cash = parseFloat(f.cash) || 0;
    const pos = parseFloat(f.pos) || 0;

    if (!liters || liters <= 0) {
      setMessages(prev => ({ ...prev, [dispenser.dispenserId]: 'Enter a valid liters amount.' }));
      return;
    }

    setSubmitting(prev => ({ ...prev, [dispenser.dispenserId]: true }));
    setMessages(prev => ({ ...prev, [dispenser.dispenserId]: '' }));

    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dayShiftId: activeDayShift._id,
          dispenserId: dispenser.dispenserId,
          liters,
          cashAmount: cash,
          posAmount: pos,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages(prev => ({ ...prev, [dispenser.dispenserId]: data.error || 'Failed to save' }));
      } else {
        await loadData();
      }
    } catch {
      setMessages(prev => ({ ...prev, [dispenser.dispenserId]: 'An error occurred.' }));
    } finally {
      setSubmitting(prev => ({ ...prev, [dispenser.dispenserId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Record Sales</h1>
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      </div>
    );
  }

  if (!activeDayShift) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Record Sales</h1>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-4 rounded-xl text-sm">
          No active day shift. The manager must begin the day before sales can be recorded.
        </div>
      </div>
    );
  }

  const totalSalesLiters = Object.values(existingSales).reduce((s, e) => s + (e.liters || 0), 0);
  const totalSalesCash = Object.values(existingSales).reduce((s, e) => s + (e.cashAmount || 0), 0);
  const totalSalesPos = Object.values(existingSales).reduce((s, e) => s + (e.posAmount || 0), 0);
  const recordedCount = Object.keys(existingSales).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Record Sales</h1>
          <p className="text-sm text-slate-500 mt-1">Enter liters sold and payment breakdown for each pump.</p>
        </div>
        <button
          onClick={loadData}
          className="text-xs text-gray-500 hover:text-ecana-maroon border border-gray-200 rounded-lg px-3 py-1.5 hover:border-ecana-maroon transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Summary bar — only shown once some sales are recorded */}
      {recordedCount > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card-modern p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Pumps Done</p>
            <p className="text-2xl font-bold text-gray-800">{recordedCount}/{dispensers.length}</p>
          </div>
          <div className="card-modern p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Liters</p>
            <p className="text-2xl font-bold text-gray-800">{totalSalesLiters.toFixed(1)} L</p>
          </div>
          <div className="card-modern p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Cash</p>
            <p className="text-xl font-bold text-gray-800">{fmt(totalSalesCash)}</p>
          </div>
          <div className="card-modern p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">POS</p>
            <p className="text-xl font-bold text-gray-800">{fmt(totalSalesPos)}</p>
          </div>
        </div>
      )}

      {dispensers.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
          No pumps were activated for today&apos;s shift. Ask the manager to begin day with active pumps.
        </div>
      ) : (
        <div className="space-y-4">
          {dispensers.map((dispenser) => {
            const existing = existingSales[dispenser.dispenserId];
            const reading = meterReadings[dispenser.dispenserId];
            const isEditing = editing[dispenser.dispenserId];
            const f = forms[dispenser.dispenserId] || {};

            const suggestedLiters = reading
              ? Math.max(0, (reading.closing || 0) - (reading.opening || 0) - (reading.rtt || 0))
              : null;

            const cashVal = parseFloat(f.cash) || 0;
            const posVal = parseFloat(f.pos) || 0;
            const litersVal = parseFloat(f.liters) || 0;
            const liveTotal = cashVal + posVal;

            const priceEntry = activeDayShift?.pricesAtStart;
            const pricePerLiter = priceEntry instanceof Map
              ? priceEntry.get(dispenser.fuelType)
              : priceEntry?.[dispenser.fuelType];
            const expectedAmt = litersVal * (pricePerLiter || 0);

            const savedAt = existing
              ? new Date(existing.updatedAt || existing.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
              : null;

            return (
              <Card
                key={dispenser.dispenserId}
                title={dispenser.dispenserName}
                subtitle={`${dispenser.fuelType}${existing ? ` · Saved at ${savedAt}` : ' · Not yet recorded'}`}
              >
                {/* Meter reading hint */}
                {reading && (
                  <div className="mb-4 flex items-center gap-2 text-sm text-slate-500 bg-slate-50 rounded-xl px-3 py-2">
                    <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span>
                      Meter reading: {reading.opening} → {reading.closing} (RTT {reading.rtt ?? 0})
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span className="font-semibold text-slate-700">Net: {suggestedLiters?.toFixed(2)} L</span>
                    </span>
                  </div>
                )}

                {/* Display mode */}
                {existing && !isEditing ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Liters Sold', value: `${Number(existing.liters).toFixed(2)} L`, highlight: false },
                        { label: 'Cash', value: fmt(existing.cashAmount), highlight: false },
                        { label: 'POS', value: fmt(existing.posAmount), highlight: false },
                        { label: 'Total', value: fmt(existing.totalAmount), highlight: true },
                      ].map(({ label, value, highlight }) => (
                        <div key={label} className={`rounded-xl p-3 ${highlight ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50'}`}>
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
                          <p className={`text-lg font-bold ${highlight ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</p>
                        </div>
                      ))}
                    </div>

                    {existing.discrepancy !== 0 && (
                      <div className={`px-3 py-2 rounded-lg text-sm font-medium ${existing.discrepancy < 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                        {existing.discrepancy < 0 ? 'Short' : 'Over'} by {fmt(Math.abs(existing.discrepancy))}
                        {pricePerLiter ? ` (expected ${fmt(existing.expectedAmount)} at ₦${pricePerLiter}/L)` : ''}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button variant="secondary" size="sm" onClick={() => startEditing(dispenser.dispenserId)}>
                        Edit
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Input mode */
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <Input
                          label={suggestedLiters != null ? `Liters Sold (meter: ${suggestedLiters.toFixed(2)} L)` : 'Liters Sold'}
                          type="number"
                          value={f.liters || ''}
                          onChange={e => updateForm(dispenser.dispenserId, 'liters', e.target.value)}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                        />
                      </div>
                      <Input
                        label="Cash Received (₦)"
                        type="number"
                        value={f.cash || ''}
                        onChange={e => updateForm(dispenser.dispenserId, 'cash', e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                      />
                      <Input
                        label="POS Received (₦)"
                        type="number"
                        value={f.pos || ''}
                        onChange={e => updateForm(dispenser.dispenserId, 'pos', e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                      />
                    </div>

                    {/* Live totals preview */}
                    {(cashVal > 0 || posVal > 0 || litersVal > 0) && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 rounded-xl p-3">
                          <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Total Payment</p>
                          <p className="text-lg font-bold text-slate-900">{fmt(liveTotal)}</p>
                        </div>
                        {pricePerLiter && litersVal > 0 && (
                          <div className={`rounded-xl p-3 ${Math.abs(liveTotal - expectedAmt) < 0.01 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                            <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Expected ({fmt(pricePerLiter)}/L)</p>
                            <p className="text-lg font-bold text-slate-900">{fmt(expectedAmt)}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {messages[dispenser.dispenserId] && (
                      <p className="text-sm text-red-600">{messages[dispenser.dispenserId]}</p>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => submitSale(dispenser)}
                        disabled={submitting[dispenser.dispenserId] || !f.liters}
                      >
                        {submitting[dispenser.dispenserId] ? 'Saving...' : existing ? 'Update Sale' : 'Save Sale'}
                      </Button>
                      {existing && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => cancelEditing(dispenser.dispenserId)}
                          disabled={submitting[dispenser.dispenserId]}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
