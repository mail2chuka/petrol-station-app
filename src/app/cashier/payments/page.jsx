'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/Button';

function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function RecordPaymentsPage() {
  const { data: session } = useSession();
  const [activeDayShift, setActiveDayShift] = useState(null);
  const [supervisors, setSupervisors] = useState([]);
  const [salesBySupervisor, setSalesBySupervisor] = useState({});   // { supervisorId: totalAmount }
  const [collectedMap, setCollectedMap] = useState({});              // { supervisorId: [PaymentRecord] }
  const [posTerminals, setPosTerminals] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [forms, setForms] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState('');

  const stationId = session?.user?.stationId;

  const loadData = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    setGlobalError('');
    try {
      const [shiftRes, usersRes, paymentsRes, terminalsRes] = await Promise.all([
        fetch(`/api/day-shifts?stationId=${stationId}&status=in_progress`),
        fetch(`/api/users?role=supervisor&stationId=${stationId}`),
        fetch(`/api/payments?stationId=${stationId}&date=${today()}`),
        fetch(`/api/pos-terminals?stationId=${stationId}`),
      ]);

      const [shiftData, usersData, paymentsData, terminalsData] = await Promise.all([
        shiftRes.json(), usersRes.json(), paymentsRes.json(), terminalsRes.json(),
      ]);

      const shift = (shiftData.dayShifts || [])[0] || null;
      setActiveDayShift(shift);

      const sups = usersData.users || [];
      setSupervisors(sups);
      setPosTerminals(terminalsData.terminals || []);

      // Build payment map
      const map = {};
      for (const p of (paymentsData.paymentRecords || [])) {
        const sid = p.supervisorId?.toString();
        if (!map[sid]) map[sid] = [];
        map[sid].push(p);
      }
      setCollectedMap(map);

      // Fetch today's sales per supervisor so cashier can see what each supervisor should hand over
      if (shift) {
        const salesRes = await fetch(`/api/sales?stationId=${stationId}&dayShiftId=${shift._id}`);
        const salesData = await salesRes.json();
        const salesMap = {};
        for (const s of (salesData.salesEntries || [])) {
          const sid = s.supervisorId?.toString();
          if (!salesMap[sid]) salesMap[sid] = { name: s.supervisorName, total: 0, cash: 0, pos: 0 };
          salesMap[sid].total += s.totalAmount || 0;
          salesMap[sid].cash += s.cashAmount || 0;
          salesMap[sid].pos += s.posAmount || 0;
        }
        setSalesBySupervisor(salesMap);
      }

      const initForms = {};
      for (const sup of sups) {
        initForms[sup._id] = { cash: '', pos: '', posTerminalId: '', notes: '' };
      }
      setForms(initForms);
    } catch (err) {
      console.error('Error loading data:', err);
      setGlobalError('Failed to load data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    if (stationId) loadData();
  }, [session]);

  const handleFormChange = (supId, field, value) => {
    setForms(prev => ({ ...prev, [supId]: { ...prev[supId], [field]: value } }));
    setErrors(prev => ({ ...prev, [supId]: '' }));
  };

  const submitCollection = async (formKey, realSupId) => {
    const f = forms[formKey] || {};
    const cash = parseFloat(f.cash) || 0;
    const pos = parseFloat(f.pos) || 0;

    if (cash === 0 && pos === 0) {
      setErrors(prev => ({ ...prev, [formKey]: 'Enter cash or POS amount.' }));
      return;
    }
    if (pos > 0 && !f.posTerminalId) {
      setErrors(prev => ({ ...prev, [formKey]: 'Select the POS terminal used for the POS payment.' }));
      return;
    }
    if (!activeDayShift) {
      setErrors(prev => ({ ...prev, [formKey]: 'No active day shift.' }));
      return;
    }

    const selectedTerminal = posTerminals.find(t => t._id === f.posTerminalId);

    setSubmitting(prev => ({ ...prev, [formKey]: true }));
    setErrors(prev => ({ ...prev, [formKey]: '' }));

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dayShiftId: activeDayShift._id,
          supervisorId: realSupId,
          cashReceived: cash,
          posReceived: pos,
          posTerminalId: selectedTerminal?._id || null,
          posTerminalLabel: selectedTerminal?.label || null,
          notes: f.notes || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors(prev => ({ ...prev, [formKey]: data.error || 'Failed to record payment.' }));
        return;
      }
      setForms(prev => ({ ...prev, [formKey]: { cash: '', pos: '', posTerminalId: '', notes: '' } }));
      setExpandedId(null);
      await loadData();
    } catch {
      setErrors(prev => ({ ...prev, [formKey]: 'An error occurred.' }));
    } finally {
      setSubmitting(prev => ({ ...prev, [formKey]: false }));
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Record Collections</h1>
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      </div>
    );
  }

  const collectedSups = supervisors.filter(s => collectedMap[s._id]?.length > 0);
  const uncollectedSups = supervisors.filter(s => !collectedMap[s._id]?.length);
  const allCollected = supervisors.length > 0 && uncollectedSups.length === 0;

  const totalCash = Object.values(collectedMap).flat().reduce((s, p) => s + (p.cashReceived || 0), 0);
  const totalPos = Object.values(collectedMap).flat().reduce((s, p) => s + (p.posReceived || 0), 0);

  const terminalOptions = [
    { value: '', label: 'Select POS terminal...' },
    ...posTerminals.map(t => ({ value: t._id, label: `${t.label} (${t.provider})` })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Record Collections</h1>
          <p className="text-sm text-slate-500 mt-1">
            Collect from each supervisor. POS payments require selecting the terminal used.
          </p>
        </div>
        <button onClick={loadData} className="self-start sm:self-auto text-xs text-gray-500 hover:text-ecana-maroon border border-gray-200 rounded-lg px-3 py-1.5 hover:border-ecana-maroon transition-colors">
          Refresh
        </button>
      </div>

      {globalError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{globalError}</div>
      )}

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
            <p className="font-semibold">All Supervisors Collected</p>
            <p className="text-sm mt-0.5">Total: ₦{fmt(totalCash + totalPos)} (Cash: ₦{fmt(totalCash)} · POS: ₦{fmt(totalPos)})</p>
          </div>
        </div>
      )}

      {activeDayShift && supervisors.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card-modern p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Supervisors</p>
            <p className="text-2xl font-bold text-gray-800">{supervisors.length}</p>
          </div>
          <div className="card-modern p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Collected</p>
            <p className="text-2xl font-bold text-green-700">{collectedSups.length}</p>
          </div>
          <div className="card-modern p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Pending</p>
            <p className={`text-2xl font-bold ${uncollectedSups.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{uncollectedSups.length}</p>
          </div>
          <div className="card-modern p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Today</p>
            <p className="text-xl font-bold text-ecana-maroon">₦{fmt(totalCash + totalPos)}</p>
          </div>
        </div>
      )}

      {/* Uncollected supervisors */}
      {activeDayShift && uncollectedSups.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Pending Collection ({uncollectedSups.length})
          </h2>
          <div className="space-y-3">
            {uncollectedSups.map((sup) => {
              const isExpanded = expandedId === sup._id;
              const f = forms[sup._id] || {};
              const cash = parseFloat(f.cash) || 0;
              const pos = parseFloat(f.pos) || 0;
              const supSales = salesBySupervisor[sup._id];

              return (
                <div key={sup._id} className="bg-white border-2 border-amber-200 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                      <div>
                        <p className="font-semibold text-gray-800">{sup.name}</p>
                        {supSales
                          ? <p className="text-xs text-gray-500">Sales: ₦{fmt(supSales.total)} (Cash ₦{fmt(supSales.cash)} · POS ₦{fmt(supSales.pos)})</p>
                          : <p className="text-xs text-gray-400">No sales recorded yet</p>
                        }
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : sup._id)}
                      className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${isExpanded ? 'bg-gray-100 text-gray-600' : 'bg-ecana-maroon text-white hover:bg-ecana-maroon/90'}`}
                    >
                      {isExpanded ? 'Cancel' : 'Collect →'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-amber-100 p-4 bg-amber-50/40 space-y-3">
                      {supSales && (
                        <div className="p-3 bg-white rounded-xl border border-amber-200 text-sm">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Expected from {sup.name}</p>
                          <div className="flex gap-6">
                            <div><p className="text-xs text-gray-400">Cash</p><p className="font-semibold text-gray-800">₦{fmt(supSales.cash)}</p></div>
                            <div><p className="text-xs text-gray-400">POS</p><p className="font-semibold text-gray-800">₦{fmt(supSales.pos)}</p></div>
                            <div><p className="text-xs text-gray-400">Total</p><p className="font-bold text-ecana-maroon">₦{fmt(supSales.total)}</p></div>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input label="Cash Received (₦)" type="number" value={f.cash}
                          onChange={e => handleFormChange(sup._id, 'cash', e.target.value)}
                          placeholder="0.00" step="0.01" min="0" />
                        <Input label="POS Received (₦)" type="number" value={f.pos}
                          onChange={e => handleFormChange(sup._id, 'pos', e.target.value)}
                          placeholder="0.00" step="0.01" min="0" />
                      </div>

                      {/* POS terminal selector — required when POS amount > 0 */}
                      {pos > 0 && (
                        <div>
                          <Select
                            label="POS Terminal Used *"
                            value={f.posTerminalId || ''}
                            onChange={e => handleFormChange(sup._id, 'posTerminalId', e.target.value)}
                            options={posTerminals.length > 0 ? terminalOptions : [{ value: '', label: '— No POS terminals configured —' }]}
                          />
                          {posTerminals.length === 0 && (
                            <p className="text-xs text-amber-700 mt-1">Ask admin to add POS terminals in station settings.</p>
                          )}
                        </div>
                      )}

                      {(cash > 0 || pos > 0) && (
                        <div className="p-3 bg-white rounded-xl border border-amber-200 text-sm">
                          <div className="flex justify-between text-gray-600"><span>Cash</span><span>₦{fmt(cash)}</span></div>
                          <div className="flex justify-between text-gray-600 mt-1"><span>POS</span><span>₦{fmt(pos)}</span></div>
                          {supSales && (
                            <div className={`flex justify-between mt-1 font-medium ${Math.abs(cash + pos - supSales.total) < 0.01 ? 'text-green-600' : 'text-amber-700'}`}>
                              <span>{Math.abs(cash + pos - supSales.total) < 0.01 ? '✓ Matches sales' : `Difference: ₦${fmt(Math.abs(cash + pos - supSales.total))}`}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-gray-900 mt-2 pt-2 border-t border-gray-200">
                            <span>Total Collecting</span><span>₦{fmt(cash + pos)}</span>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes (Optional)</label>
                        <textarea value={f.notes} onChange={e => handleFormChange(sup._id, 'notes', e.target.value)}
                          rows={2} className="w-full px-4 py-3 text-sm border-2 border-slate-200 rounded-xl focus:outline-none focus:border-ecana-maroon resize-none"
                          placeholder="Any notes..." />
                      </div>

                      {errors[sup._id] && <p className="text-sm text-red-600">{errors[sup._id]}</p>}

                      <Button variant="primary" onClick={() => submitCollection(sup._id, sup._id)} disabled={submitting[sup._id]}>
                        {submitting[sup._id] ? 'Recording...' : 'Record Collection'}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Collected supervisors */}
      {collectedSups.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-green-700 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Collected ({collectedSups.length})
          </h2>
          <div className="space-y-3">
            {collectedSups.map((sup) => {
              const records = collectedMap[sup._id] || [];
              const supCash = records.reduce((s, p) => s + (p.cashReceived || 0), 0);
              const supPos = records.reduce((s, p) => s + (p.posReceived || 0), 0);
              const supTotal = supCash + supPos;
              const supSales = salesBySupervisor[sup._id];
              const isMatch = !supSales || Math.abs(supTotal - supSales.total) < 0.01;

              return (
                <div key={sup._id} className={`bg-white border rounded-2xl p-4 ${isMatch ? 'border-green-200' : 'border-amber-300'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${isMatch ? 'bg-green-500' : 'bg-amber-500'}`} />
                      <div>
                        <p className="font-semibold text-gray-800">{sup.name}</p>
                        <p className="text-xs text-gray-400">{records.length} collection{records.length !== 1 ? 's' : ''}</p>
                        {!isMatch && supSales && (
                          <p className="text-xs text-amber-700 font-medium">
                            Sales: ₦{fmt(supSales.total)} · Collected: ₦{fmt(supTotal)} · Diff: ₦{fmt(Math.abs(supTotal - supSales.total))}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-900">₦{fmt(supTotal)}</p>
                      <p className="text-xs text-gray-500">Cash: ₦{fmt(supCash)} · POS: ₦{fmt(supPos)}</p>
                    </div>
                  </div>

                  {records.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                      {records.map((r, i) => (
                        <div key={r._id || i} className="flex items-center justify-between text-xs text-gray-500">
                          <span>
                            {new Date(r.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                            {r.posTerminalLabel ? ` · POS: ${r.posTerminalLabel}` : ''}
                            {r.notes ? ` · ${r.notes}` : ''}
                          </span>
                          <span className="font-medium text-gray-700">₦{fmt(r.totalReceived)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeDayShift && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      {expandedId === `extra-${sup._id}` ? (
                        <div className="space-y-3">
                          <p className="text-xs font-medium text-gray-600">Record additional collection</p>
                          <div className="grid grid-cols-2 gap-3">
                            <Input label="Cash (₦)" type="number" value={forms[`extra-${sup._id}`]?.cash || ''}
                              onChange={e => handleFormChange(`extra-${sup._id}`, 'cash', e.target.value)}
                              placeholder="0.00" step="0.01" min="0" />
                            <Input label="POS (₦)" type="number" value={forms[`extra-${sup._id}`]?.pos || ''}
                              onChange={e => handleFormChange(`extra-${sup._id}`, 'pos', e.target.value)}
                              placeholder="0.00" step="0.01" min="0" />
                          </div>
                          {(parseFloat(forms[`extra-${sup._id}`]?.pos) > 0) && (
                            <Select label="POS Terminal *"
                              value={forms[`extra-${sup._id}`]?.posTerminalId || ''}
                              onChange={e => handleFormChange(`extra-${sup._id}`, 'posTerminalId', e.target.value)}
                              options={terminalOptions} />
                          )}
                          {errors[`extra-${sup._id}`] && <p className="text-xs text-red-600">{errors[`extra-${sup._id}`]}</p>}
                          <div className="flex gap-2">
                            <Button variant="primary" size="sm" onClick={() => submitCollection(`extra-${sup._id}`, sup._id)} disabled={submitting[`extra-${sup._id}`]}>
                              {submitting[`extra-${sup._id}`] ? 'Saving...' : 'Add'}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setExpandedId(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setForms(prev => ({ ...prev, [`extra-${sup._id}`]: { cash: '', pos: '', posTerminalId: '', notes: '' } })); setExpandedId(`extra-${sup._id}`); }}
                          className="text-xs text-gray-400 hover:text-ecana-maroon transition-colors">
                          + Add another collection
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

      {activeDayShift && supervisors.length === 0 && (
        <Card>
          <p className="text-sm text-amber-700 text-center py-4">
            No supervisors found for this station. Ask admin to assign supervisors with this station.
          </p>
        </Card>
      )}

      {(totalCash > 0 || totalPos > 0) && (
        <Card title="Today's Collection Summary">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600"><span>Total Cash Collected</span><span className="font-semibold text-gray-900">₦{fmt(totalCash)}</span></div>
            <div className="flex justify-between text-sm text-gray-600"><span>Total POS Collected</span><span className="font-semibold text-gray-900">₦{fmt(totalPos)}</span></div>
            <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Grand Total</span><span className="text-ecana-maroon">₦{fmt(totalCash + totalPos)}</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
