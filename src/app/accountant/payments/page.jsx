'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Button from '@/components/Button';

function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
}

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}

export default function RecordPaymentsPage() {
  const { data: session } = useSession();
  const [activeDayShift, setActiveDayShift] = useState(null);
  const [supervisors, setSupervisors] = useState([]);
  const [collectedMap, setCollectedMap] = useState({}); // supervisorId → [PaymentRecord]
  const [expandedId, setExpandedId] = useState(null);
  const [forms, setForms] = useState({}); // supervisorId → { cash, pos, notes }
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
      const [shiftRes, usersRes, paymentsRes] = await Promise.all([
        fetch(`/api/day-shifts?stationId=${stationId}&status=in_progress`),
        fetch(`/api/users?role=supervisor&stationId=${stationId}`),
        fetch(`/api/payments?stationId=${stationId}&date=${today()}`),
      ]);

      const shiftData = await shiftRes.json();
      const usersData = await usersRes.json();
      const paymentsData = await paymentsRes.json();

      const shift = (shiftData.dayShifts || [])[0] || null;
      setActiveDayShift(shift);

      const sups = usersData.users || [];
      setSupervisors(sups);

      // Group payment records by supervisorId
      const map = {};
      for (const p of (paymentsData.paymentRecords || [])) {
        const sid = p.supervisorId?.toString() || p.supervisorId;
        if (!map[sid]) map[sid] = [];
        map[sid].push(p);
      }
      setCollectedMap(map);

      // Init forms for uncollected supervisors
      const initForms = {};
      for (const sup of sups) {
        initForms[sup._id] = { cash: '', pos: '', notes: '' };
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

  // formKey is the key in `forms` state; realSupId is the actual supervisor MongoDB ID
  const submitCollection = async (formKey, realSupId) => {
    const f = forms[formKey] || {};
    const cash = parseFloat(f.cash) || 0;
    const pos = parseFloat(f.pos) || 0;

    if (cash === 0 && pos === 0) {
      setErrors(prev => ({ ...prev, [formKey]: 'Enter cash or POS amount to record.' }));
      return;
    }

    if (!activeDayShift) {
      setErrors(prev => ({ ...prev, [formKey]: 'No active day shift.' }));
      return;
    }

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
          notes: f.notes || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors(prev => ({ ...prev, [formKey]: data.error || 'Failed to record payment.' }));
        return;
      }
      setForms(prev => ({ ...prev, [formKey]: { cash: '', pos: '', notes: '' } }));
      setExpandedId(null);
      await loadData();
    } catch {
      setErrors(prev => ({ ...prev, [formKey]: 'An error occurred. Please try again.' }));
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Record Collections</h1>
          <p className="text-sm text-slate-500 mt-1">Collect from each supervisor and record what you received.</p>
        </div>
        <button
          onClick={loadData}
          className="self-start sm:self-auto text-xs text-gray-500 hover:text-ecana-maroon border border-gray-200 rounded-lg px-3 py-1.5 hover:border-ecana-maroon transition-colors"
        >
          Refresh
        </button>
      </div>

      {globalError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{globalError}</div>
      )}

      {/* No active shift */}
      {!activeDayShift && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-4 rounded-xl">
          <p className="font-semibold">No Active Day Shift</p>
          <p className="text-sm mt-1">The manager has not started today's day yet. Wait for the day to be opened before recording collections.</p>
        </div>
      )}

      {/* All collected banner */}
      {activeDayShift && allCollected && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-4 rounded-xl flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
          <div>
            <p className="font-semibold">All Supervisors Collected</p>
            <p className="text-sm mt-0.5">Total collected today: ₦{fmt(totalCash + totalPos)} (Cash: ₦{fmt(totalCash)} · POS: ₦{fmt(totalPos)})</p>
          </div>
        </div>
      )}

      {/* Summary bar */}
      {activeDayShift && supervisors.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card-modern p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Supervisors</p>
            <p className="text-2xl font-bold text-gray-800">{supervisors.length}</p>
          </div>
          <div className="card-modern p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Collected From</p>
            <p className="text-2xl font-bold text-green-700">{collectedSups.length}</p>
          </div>
          <div className="card-modern p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Pending</p>
            <p className={`text-2xl font-bold ${uncollectedSups.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
              {uncollectedSups.length}
            </p>
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

              return (
                <div key={sup._id} className="bg-white border-2 border-amber-200 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                      <div>
                        <p className="font-semibold text-gray-800">{sup.name}</p>
                        <p className="text-xs text-gray-400">Not yet collected</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : sup._id)}
                      className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${
                        isExpanded
                          ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          : 'bg-ecana-maroon text-white hover:bg-ecana-maroon/90'
                      }`}
                      aria-label={isExpanded ? 'Cancel' : `Collect from ${sup.name}`}
                    >
                      {isExpanded ? 'Cancel' : 'Collect →'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-amber-100 p-4 bg-amber-50/40">
                      <p className="text-sm font-medium text-gray-700 mb-3">
                        Recording collection from <strong>{sup.name}</strong>
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input
                          label="Cash Received (₦)"
                          type="number"
                          value={f.cash}
                          onChange={e => handleFormChange(sup._id, 'cash', e.target.value)}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                        />
                        <Input
                          label="POS Received (₦)"
                          type="number"
                          value={f.pos}
                          onChange={e => handleFormChange(sup._id, 'pos', e.target.value)}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                        />
                      </div>

                      {(cash > 0 || pos > 0) && (
                        <div className="mt-3 p-3 bg-white rounded-xl border border-amber-200 text-sm">
                          <div className="flex justify-between text-gray-600">
                            <span>Cash</span><span>₦{fmt(cash)}</span>
                          </div>
                          <div className="flex justify-between text-gray-600 mt-1">
                            <span>POS</span><span>₦{fmt(pos)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-gray-900 mt-2 pt-2 border-t border-gray-200">
                            <span>Total</span><span>₦{fmt(cash + pos)}</span>
                          </div>
                        </div>
                      )}

                      <div className="mt-3">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes (Optional)</label>
                        <textarea
                          value={f.notes}
                          onChange={e => handleFormChange(sup._id, 'notes', e.target.value)}
                          rows="2"
                          className="w-full px-4 py-3 text-sm text-slate-900 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-ecana-maroon focus:ring-4 focus:ring-ecana-maroon/10 transition-all resize-none"
                          placeholder="Any notes about this collection..."
                        />
                      </div>

                      {errors[sup._id] && (
                        <p className="mt-2 text-sm text-red-600">{errors[sup._id]}</p>
                      )}

                      <div className="mt-4">
                        <Button
                          variant="primary"
                          onClick={() => submitCollection(sup._id, sup._id)}
                          disabled={submitting[sup._id]}
                        >
                          {submitting[sup._id] ? 'Recording...' : 'Record Collection'}
                        </Button>
                      </div>
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

              return (
                <div key={sup._id} className="bg-white border border-green-200 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-gray-800">{sup.name}</p>
                        <p className="text-xs text-gray-400">{records.length} collection{records.length !== 1 ? 's' : ''} recorded</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-900">₦{fmt(supTotal)}</p>
                      <p className="text-xs text-gray-500">Cash: ₦{fmt(supCash)} · POS: ₦{fmt(supPos)}</p>
                    </div>
                  </div>

                  {records.length > 1 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                      {records.map((r, i) => (
                        <div key={r._id || i} className="flex justify-between text-xs text-gray-500">
                          <span>
                            {new Date(r.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                            {r.notes ? ` · ${r.notes}` : ''}
                          </span>
                          <span className="font-medium text-gray-700">₦{fmt(r.totalReceived)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add another collection for this supervisor */}
                  {activeDayShift && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      {expandedId === `extra-${sup._id}` ? (
                        <div>
                          <p className="text-xs font-medium text-gray-600 mb-2">Record additional collection</p>
                          <div className="grid grid-cols-2 gap-3">
                            <Input
                              label="Cash (₦)"
                              type="number"
                              value={forms[`extra-${sup._id}`]?.cash || ''}
                              onChange={e => handleFormChange(`extra-${sup._id}`, 'cash', e.target.value)}
                              placeholder="0.00"
                              step="0.01"
                              min="0"
                            />
                            <Input
                              label="POS (₦)"
                              type="number"
                              value={forms[`extra-${sup._id}`]?.pos || ''}
                              onChange={e => handleFormChange(`extra-${sup._id}`, 'pos', e.target.value)}
                              placeholder="0.00"
                              step="0.01"
                              min="0"
                            />
                          </div>
                          {errors[`extra-${sup._id}`] && (
                            <p className="mt-1 text-xs text-red-600">{errors[`extra-${sup._id}`]}</p>
                          )}
                          <div className="mt-2 flex gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => submitCollection(`extra-${sup._id}`, sup._id)}
                              disabled={submitting[`extra-${sup._id}`]}
                            >
                              {submitting[`extra-${sup._id}`] ? 'Saving...' : 'Add'}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setExpandedId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setForms(prev => ({ ...prev, [`extra-${sup._id}`]: { cash: '', pos: '', notes: '' } }));
                            setExpandedId(`extra-${sup._id}`);
                          }}
                          className="text-xs text-gray-400 hover:text-ecana-maroon transition-colors"
                        >
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

      {/* No supervisors */}
      {activeDayShift && supervisors.length === 0 && (
        <Card>
          <p className="text-sm text-amber-700 text-center py-4">
            No supervisors found for this station. Ask admin to assign supervisors.
          </p>
        </Card>
      )}

      {/* Today totals */}
      {(totalCash > 0 || totalPos > 0) && (
        <Card title="Today's Collection Summary">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Total Cash Collected</span>
              <span className="font-semibold text-gray-900">₦{fmt(totalCash)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Total POS Collected</span>
              <span className="font-semibold text-gray-900">₦{fmt(totalPos)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Grand Total</span>
              <span className="text-ecana-maroon">₦{fmt(totalCash + totalPos)}</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
