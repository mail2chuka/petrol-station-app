'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/Button';

const NIGERIAN_BANKS = [
  'Access Bank', 'Citibank', 'Ecobank', 'Fidelity Bank', 'First Bank',
  'First City Monument Bank (FCMB)', 'Globus Bank', 'GTBank', 'Heritage Bank',
  'Keystone Bank', 'Kuda Bank', 'Moniepoint', 'OPay', 'Palmpay', 'Polaris Bank',
  'Providus Bank', 'Stanbic IBTC', 'Standard Chartered', 'Sterling Bank',
  'SunTrust Bank', 'Titan Trust Bank', 'UBA', 'Union Bank', 'Unity Bank',
  'VFD Microfinance Bank', 'Wema Bank', 'Zenith Bank', 'Other',
];

const BANK_OPTIONS = [
  { value: '', label: 'Select bank...' },
  ...NIGERIAN_BANKS.map(b => ({ value: b, label: b })),
];

function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
}

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}

// Live estimate of the amount the supervisor should hand over, derived from the
// pump meter when the formal sale hasn't been recorded yet:
//   (closing − opening − rtt) × price per litre
function meterExpected(meter, price) {
  if (!meter || meter.opening == null || meter.closing == null) return null;
  const dispensed = Math.max(0, Number(meter.closing) - Number(meter.opening) - Number(meter.rtt || 0));
  const p = Number(price) || 0;
  return { dispensed, price: p, amount: dispensed * p };
}

function emptyPosEntry() {
  return { bank: '', amount: '', terminalId: '' };
}

function PosEntryRow({ entry, index, onChange, onRemove }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_120px_auto] gap-2 items-end">
      <Select
        label={index === 0 ? 'Bank' : undefined}
        value={entry.bank}
        onChange={e => onChange(index, 'bank', e.target.value)}
        options={BANK_OPTIONS}
      />
      <Input
        label={index === 0 ? 'Amount (₦)' : undefined}
        type="text"
        inputMode="decimal"
        value={entry.amount}
        onChange={e => onChange(index, 'amount', e.target.value)}
        placeholder="0"
      />
      <Input
        label={index === 0 ? 'Terminal ID (opt.)' : undefined}
        value={entry.terminalId}
        onChange={e => onChange(index, 'terminalId', e.target.value)}
        placeholder="e.g. 1234567"
      />
      <button
        type="button"
        onClick={() => onRemove(index)}
        className={`${index === 0 ? 'self-end' : ''} px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium`}
        aria-label="Remove"
      >
        ✕
      </button>
    </div>
  );
}

// Collection form for a single pump
function CollectionForm({ dispenser, salesEntry, meterReading, pricePerLiter, activeDayShift, onSubmitted }) {
  const [cash, setCash] = useState('');
  const [posEntries, setPosEntries] = useState([emptyPosEntry()]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const posTotal = posEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const grandTotal = (parseFloat(cash) || 0) + posTotal;

  // Prefer the supervisor's recorded sale; otherwise estimate live from the meter.
  const price = salesEntry?.pricePerLiter ?? pricePerLiter ?? 0;
  const est = salesEntry ? null : meterExpected(meterReading, price);
  const liters = salesEntry?.liters ?? est?.dispensed ?? null;
  const expected = salesEntry?.expectedAmount ?? est?.amount ?? null;
  const isEstimate = !salesEntry && expected !== null;
  const isMatch = expected !== null && Math.abs(grandTotal - expected) < 0.01;

  const updatePosEntry = (index, field, value) => {
    setPosEntries(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
    setError('');
  };

  const addPosEntry = () => setPosEntries(prev => [...prev, emptyPosEntry()]);

  const removePosEntry = (index) => {
    if (posEntries.length === 1) {
      setPosEntries([emptyPosEntry()]);
    } else {
      setPosEntries(prev => prev.filter((_, i) => i !== index));
    }
  };

  const submit = async () => {
    const cashAmt = parseFloat(cash) || 0;
    const validPos = posEntries.filter(e => e.bank && parseFloat(e.amount) > 0);

    if (cashAmt === 0 && validPos.length === 0) {
      setError('Enter a cash amount or at least one POS entry.');
      return;
    }
    const invalidPos = posEntries.filter(e => parseFloat(e.amount) > 0 && !e.bank);
    if (invalidPos.length > 0) {
      setError('Select a bank for each POS entry that has an amount.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dayShiftId: activeDayShift._id,
          dispenserId: dispenser.dispenserId,
          cashReceived: cashAmt,
          posEntries: validPos.map(e => ({
            bank: e.bank,
            amount: parseFloat(e.amount),
            terminalId: e.terminalId || null,
          })),
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to record.'); return; }
      setCash(''); setPosEntries([emptyPosEntry()]); setNotes('');
      onSubmitted();
    } catch {
      setError('An error occurred.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-amber-100 p-4 bg-amber-50/30 space-y-4">
      {expected !== null && (
        <div className="p-3 bg-white rounded-xl border border-amber-200 text-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Expected from {dispenser.dispenserName}
            {isEstimate && (
              <span className="ml-1 normal-case font-medium text-amber-600">
                · estimated from meter
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-4">
            <div>
              <p className="text-xs text-gray-400">Liters{isEstimate ? ' (dispensed − RTT)' : ''}</p>
              <p className="font-semibold text-gray-800">{fmt(Number(liters))} L</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Price/L</p>
              <p className="font-semibold text-gray-800">₦{fmt(price)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">{isEstimate ? 'Est. Expected' : 'Expected'}</p>
              <p className="font-bold text-ecana-maroon">₦{fmt(expected)}</p>
            </div>
          </div>
        </div>
      )}

      <div>
        <Input
          label="Cash Received (₦)"
          type="text"
          inputMode="decimal"
          value={cash}
          onChange={e => { setCash(e.target.value); setError(''); }}
          placeholder="0"
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">
          POS Payments <span className="text-xs font-normal text-slate-400">(add one row per bank)</span>
        </p>
        {posEntries.map((entry, i) => (
          <PosEntryRow
            key={i}
            entry={entry}
            index={i}
            onChange={updatePosEntry}
            onRemove={removePosEntry}
          />
        ))}
        <button
          type="button"
          onClick={addPosEntry}
          className="flex items-center gap-1.5 text-sm text-ecana-maroon hover:underline font-medium"
        >
          <span className="text-lg leading-none">+</span> Add another bank / POS terminal
        </button>
      </div>

      {(parseFloat(cash) > 0 || posTotal > 0) && (
        <div className="p-3 bg-white rounded-xl border border-gray-200 text-sm space-y-1.5">
          <div className="flex justify-between text-gray-600">
            <span>Cash</span><span>₦{fmt(parseFloat(cash) || 0)}</span>
          </div>
          {posEntries.filter(e => parseFloat(e.amount) > 0).map((e, i) => (
            <div key={i} className="flex justify-between text-gray-600">
              <span>{e.bank || 'POS'}{e.terminalId ? ` (${e.terminalId})` : ''}</span>
              <span>₦{fmt(parseFloat(e.amount))}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold text-gray-900 pt-1.5 border-t border-gray-200">
            <span>Grand Total</span><span>₦{fmt(grandTotal)}</span>
          </div>
          {expected !== null && (
            <div className={`flex justify-between text-sm font-semibold ${isMatch ? 'text-green-600' : 'text-amber-700'}`}>
              <span>{isMatch ? '✓ Matches expected sales' : `Difference: ₦${fmt(Math.abs(grandTotal - expected))}`}</span>
              <span>Expected: ₦{fmt(expected)}</span>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes (Optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          className="w-full px-4 py-3 text-sm border-2 border-slate-200 rounded-xl focus:outline-none focus:border-ecana-maroon resize-none"
          placeholder="Any notes about this collection..."
        />
      </div>

      {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

      <Button variant="primary" onClick={submit} disabled={saving}>
        {saving ? 'Recording...' : 'Record Collection'}
      </Button>
    </div>
  );
}

export default function RecordPaymentsPage() {
  const { data: session } = useSession();
  const [activeDayShift, setActiveDayShift] = useState(null);
  const [shiftOptions, setShiftOptions] = useState([]);
  const [dispensers, setDispensers] = useState([]);
  const [salesByDispenser, setSalesByDispenser] = useState({});
  const [metersByDispenser, setMetersByDispenser] = useState({});
  const [collectedMap, setCollectedMap] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState('');

  const stationId = session?.user?.stationId;

  const loadData = useCallback(async (requestedShiftId = null) => {
    if (!stationId) return;
    setLoading(true);
    setGlobalError('');
    try {
      const shiftRes = await fetch(`/api/day-shifts?stationId=${stationId}`);
      const shiftData = await shiftRes.json();
      const shifts = shiftData.dayShifts || [];
      setShiftOptions(shifts);
      const shift = requestedShiftId
        ? shifts.find(item => item._id === requestedShiftId)
        : shifts.find(item => item.status === 'in_progress') || shifts.find(item => item.collectionStatus === 'pending') || shifts[0] || null;
      setActiveDayShift(shift);
      setDispensers(shift?.dispenserAssignments || []);

      if (!shift) {
        setMetersByDispenser({});
        setCollectedMap({});
        setSalesByDispenser({});
        return;
      }

      const shiftDate = new Date(shift.date).toISOString().split('T')[0];
      const [paymentsRes, metersRes, salesRes] = await Promise.all([
        fetch(`/api/payments?stationId=${stationId}&dayShiftId=${shift._id}`),
        fetch(`/api/meter-readings?stationId=${stationId}&date=${shiftDate}`),
        fetch(`/api/sales?stationId=${stationId}&dayShiftId=${shift._id}`),
      ]);
      const [paymentsData, metersData, salesData] = await Promise.all([
        paymentsRes.json(), metersRes.json(), salesRes.json(),
      ]);

      // Map meter readings by pumpId (= dispenserId) for live expected estimates
      const metersMap = {};
      for (const m of (metersData.readings || [])) {
        metersMap[m.pumpId] = m;
      }
      setMetersByDispenser(metersMap);

      // Map payment records by dispenserId (multiple allowed per pump)
      const map = {};
      for (const p of (paymentsData.paymentRecords || [])) {
        const did = p.dispenserId;
        if (!map[did]) map[did] = [];
        map[did].push(p);
      }
      setCollectedMap(map);

      const salesMap = {};
      for (const sale of (salesData.salesEntries || [])) {
        const current = salesMap[sale.dispenserId] || { ...sale, liters: 0, expectedAmount: 0 };
        current.liters += Number(sale.liters) || 0;
        current.expectedAmount += Number(sale.expectedAmount) || 0;
        salesMap[sale.dispenserId] = current;
      }
      setSalesByDispenser(salesMap);
    } catch {
      setGlobalError('Failed to load data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => { if (stationId) loadData(); }, [session, stationId, loadData]);

  if (loading) return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Record Collections</h1>
      <div className="flex justify-center py-16"><div className="spinner" /></div>
    </div>
  );

  const saleDisps = dispensers.filter(d => (salesByDispenser[d.dispenserId]?.expectedAmount || 0) > 0);
  const unsoldDisps = dispensers.filter(d => !saleDisps.some(saleDisp => saleDisp.dispenserId === d.dispenserId));
  const collectionRows = saleDisps.map(disp => {
    const records = collectedMap[disp.dispenserId] || [];
    const collected = records.reduce((sum, record) => sum + (Number(record.totalReceived) || 0), 0);
    const expected = Number(salesByDispenser[disp.dispenserId]?.expectedAmount) || 0;
    return { disp, records, expected, collected, outstanding: Math.max(0, expected - collected) };
  });
  const noInitialCollection = collectionRows.filter(row => row.collected <= 0);
  const pendingRows = collectionRows.filter(row => row.outstanding > 0.01);
  const settledRows = collectionRows.filter(row => row.outstanding <= 0.01 && row.collected > 0);
  const allCollected = saleDisps.length > 0 && noInitialCollection.length === 0;

  const totalCash = Object.values(collectedMap).flat().reduce((s, p) => s + (p.cashReceived || 0), 0);
  const totalPos = Object.values(collectedMap).flat().reduce((s, p) => s + (p.posReceived || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Record Collections</h1>
          <p className="text-sm text-slate-500 mt-1">Collect cash and POS for each pump — add one POS row per bank used.</p>
        </div>
        <button onClick={loadData} className="text-xs text-gray-500 hover:text-ecana-maroon border border-gray-200 rounded-lg px-3 py-1.5 transition-colors">Refresh</button>
      </div>

      {shiftOptions.length > 0 && (
        <div className="card-modern p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-sm font-medium text-gray-700" htmlFor="collection-shift">Shift to reconcile</label>
          <select
            id="collection-shift"
            value={activeDayShift?._id || ''}
            onChange={event => { setExpandedId(null); loadData(event.target.value); }}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:border-ecana-maroon"
          >
            {shiftOptions.map(shift => (
              <option key={shift._id} value={shift._id}>
                {new Date(shift.date).toLocaleDateString('en-NG')} · {shift.shiftLabel || 'Full Day'} · {shift.status === 'ended' ? (shift.collectionStatus === 'pending' ? 'Closed — balance pending' : 'Closed') : 'Open'}
              </option>
            ))}
          </select>
        </div>
      )}

      {globalError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{globalError}</div>}

      {!activeDayShift && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-4 rounded-xl">
          <p className="font-semibold">No Active Day Shift</p>
          <p className="text-sm mt-1">The manager has not started today&apos;s day yet.</p>
        </div>
      )}

      {activeDayShift && allCollected && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-4 rounded-xl flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
          <div>
            <p className="font-semibold">Initial collections recorded</p>
            <p className="text-sm mt-0.5">Cash: ₦{fmt(totalCash)} · POS: ₦{fmt(totalPos)} · Total: ₦{fmt(totalCash + totalPos)}</p>
          </div>
        </div>
      )}

      {activeDayShift && dispensers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Pumps with Sales', val: saleDisps.length, color: '' },
            { label: 'Settled', val: settledRows.length, color: 'text-green-700' },
            { label: 'Pending Balance', val: pendingRows.length, color: pendingRows.length > 0 ? 'text-amber-600' : '' },
            { label: 'Total Today', val: `₦${fmt(totalCash + totalPos)}`, color: 'text-ecana-maroon', small: true },
          ].map(({ label, val, color, small }) => (
            <div key={label} className="card-modern p-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
              <p className={`${small ? 'text-xl' : 'text-2xl'} font-bold ${color || 'text-gray-800'}`}>{val}</p>
            </div>
          ))}
        </div>
      )}

      {activeDayShift && unsoldDisps.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <span className="font-semibold">No sales / no collection needed:</span> {unsoldDisps.map(disp => disp.dispenserName).join(', ')}.
        </div>
      )}

      {/* Pumps with sales but no initial collection */}
      {activeDayShift && noInitialCollection.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> Collection Not Recorded ({noInitialCollection.length})
          </h2>
          <div className="space-y-3">
            {noInitialCollection.map(({ disp }) => {
              const isOpen = expandedId === disp.dispenserId;
              const salesEntry = salesByDispenser[disp.dispenserId];
              return (
                <div key={disp.dispenserId} className="bg-white border-2 border-amber-200 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-semibold text-gray-800">{disp.dispenserName}</p>
                      <p className="text-xs text-gray-500">{disp.fuelType} · {disp.supervisorName}</p>
                      {(() => {
                        if (salesEntry) return <p className="text-xs text-gray-500">Expected: ₦{fmt(salesEntry.expectedAmount)}</p>;
                        const est = meterExpected(metersByDispenser[disp.dispenserId], activeDayShift?.pricesAtStart?.[disp.fuelType]);
                        if (est) return <p className="text-xs text-amber-600">Est. expected: ₦{fmt(est.amount)} <span className="text-gray-400">(from meter)</span></p>;
                        return <p className="text-xs text-gray-400">No sales recorded yet</p>;
                      })()}
                    </div>
                    <button
                      onClick={() => setExpandedId(isOpen ? null : disp.dispenserId)}
                      className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${isOpen ? 'bg-gray-100 text-gray-600' : 'bg-ecana-maroon text-white hover:bg-ecana-maroon/90'}`}
                    >
                      {isOpen ? 'Cancel' : 'Collect →'}
                    </button>
                  </div>
                  {isOpen && (
                    <CollectionForm
                      dispenser={disp}
                      salesEntry={salesByDispenser[disp.dispenserId] || null}
                      meterReading={metersByDispenser[disp.dispenserId] || null}
                      pricePerLiter={activeDayShift?.pricesAtStart?.[disp.fuelType]}
                      activeDayShift={activeDayShift}
                      onSubmitted={() => { setExpandedId(null); loadData(activeDayShift._id); }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Collected pumps */}
      {collectionRows.filter(row => row.collected > 0).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-green-700 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" /> Collection Records ({collectionRows.filter(row => row.collected > 0).length})
          </h2>
          <div className="space-y-3">
            {collectionRows.filter(row => row.collected > 0).map(({ disp, records, expected, collected, outstanding }) => {
              const dispCash = records.reduce((s, p) => s + (p.cashReceived || 0), 0);
              const dispPos = records.reduce((s, p) => s + (p.posReceived || 0), 0);
              const dispTotal = collected;
              const salesEntry = salesByDispenser[disp.dispenserId];
              const isMatch = outstanding <= 0.01;
              const isOpen = expandedId === `extra-${disp.dispenserId}`;

              return (
                <div key={disp.dispenserId} className={`bg-white border rounded-2xl p-4 ${isMatch ? 'border-green-200' : 'border-amber-300'}`}>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${isMatch ? 'bg-green-500' : 'bg-amber-500'}`} />
                      <div>
                        <p className="font-semibold text-gray-800">{disp.dispenserName}</p>
                        <p className="text-xs text-gray-500">{disp.fuelType} · {disp.supervisorName}</p>
                        {!isMatch && salesEntry && (
                          <p className="text-xs text-amber-700 font-medium">
                            Diff: ₦{fmt(Math.abs(dispTotal - salesEntry.expectedAmount))} (Expected: ₦{fmt(salesEntry.expectedAmount)})
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-900">₦{fmt(dispTotal)}</p>
                      <p className="text-xs text-gray-500">Cash: ₦{fmt(dispCash)} · POS: ₦{fmt(dispPos)}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {records.map((r, ri) => (
                      <div key={r._id || ri} className="text-xs bg-slate-50 rounded-lg px-3 py-2 space-y-0.5">
                        <div className="flex justify-between text-gray-600">
                          <span>{new Date(r.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="font-semibold text-gray-800">₦{fmt(r.totalReceived)}</span>
                        </div>
                        {r.cashReceived > 0 && (
                          <div className="flex justify-between text-gray-500">
                            <span>Cash</span><span>₦{fmt(r.cashReceived)}</span>
                          </div>
                        )}
                        {(r.posEntries || []).map((pe, pi) => (
                          <div key={pi} className="flex justify-between text-gray-500">
                            <span>{pe.bank}{pe.terminalId ? ` (${pe.terminalId})` : ''}</span>
                            <span>₦{fmt(pe.amount)}</span>
                          </div>
                        ))}
                        {r.notes && <p className="text-gray-400 italic">{r.notes}</p>}
                      </div>
                    ))}
                  </div>

                  {activeDayShift && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      {isOpen ? (
                        <div className="space-y-2">
                          <CollectionForm
                            dispenser={disp}
                            salesEntry={salesByDispenser[disp.dispenserId] || null}
                            meterReading={metersByDispenser[disp.dispenserId] || null}
                            pricePerLiter={activeDayShift?.pricesAtStart?.[disp.fuelType]}
                            activeDayShift={activeDayShift}
                            onSubmitted={() => { setExpandedId(null); loadData(activeDayShift._id); }}
                          />
                          <button onClick={() => setExpandedId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setExpandedId(`extra-${disp.dispenserId}`)} className="text-xs text-gray-400 hover:text-ecana-maroon transition-colors">
                          {activeDayShift.status === 'ended' ? '+ Record settlement' : '+ Add another collection'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeDayShift && dispensers.length === 0 && (
        <Card>
          <p className="text-sm text-amber-700 text-center py-4">
            No pumps activated for today&apos;s shift. Ask the manager to begin the day.
          </p>
        </Card>
      )}

      {(totalCash > 0 || totalPos > 0) && (
        <Card title="Today's Collection Summary">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600"><span>Total Cash</span><span className="font-semibold">₦{fmt(totalCash)}</span></div>
            <div className="flex justify-between text-sm text-gray-600"><span>Total POS</span><span className="font-semibold">₦{fmt(totalPos)}</span></div>
            <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200"><span>Grand Total</span><span className="text-ecana-maroon">₦{fmt(totalCash + totalPos)}</span></div>
          </div>
        </Card>
      )}
    </div>
  );
}
