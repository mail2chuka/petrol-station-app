'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Button from '@/components/Button';
import DateCalendar from '@/components/DateCalendar';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function MeterReadingsPage() {
  const { data: session } = useSession();
  const [openPumps, setOpenPumps] = useState([]);
  const [existingReadings, setExistingReadings] = useState({});
  const [previousClosings, setPreviousClosings] = useState({});
  const [forms, setForms] = useState({});
  const [editing, setEditing] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState({});
  const [messages, setMessages] = useState({});
  const [date, setDate] = useState(today());
  const [markedDates, setMarkedDates] = useState({});

  const stationId = session?.user?.stationId;

  const fetchMonthMarks = useCallback(async (monthStr) => {
    if (!stationId) return;
    try {
      const res = await fetch(`/api/meter-readings?stationId=${stationId}&month=${monthStr}`);
      const data = await res.json();
      const grouped = {};
      for (const r of (data.readings || [])) {
        const d = (r.date || r.createdAt || '').slice(0, 10);
        if (!d) continue;
        if (!grouped[d]) grouped[d] = { total: 0, pending: 0 };
        grouped[d].total += 1;
        if (r.discrepancyFlag) grouped[d].pending += 1;
      }
      setMarkedDates(prev => ({ ...prev, ...grouped }));
    } catch {}
  }, [stationId]);

  const fetchData = useCallback(async (dateStr) => {
    if (!stationId) return;
    setLoading(true);
    try {
      const [openingsRes, readingsRes] = await Promise.all([
        fetch(`/api/pump-openings?stationId=${stationId}&date=${dateStr}`),
        fetch(`/api/meter-readings?stationId=${stationId}&date=${dateStr}`),
      ]);
      const openingsData = await openingsRes.json();
      const readingsData = await readingsRes.json();

      const pumps = (openingsData.openings || [])[0]?.pumps || [];
      setOpenPumps(pumps);

      const readingsMap = {};
      for (const r of (readingsData.readings || [])) {
        readingsMap[r.pumpId] = r;
      }
      setExistingReadings(readingsMap);

      const prevDate = new Date(dateStr + 'T12:00:00');
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];
      const prevRes = await fetch(`/api/meter-readings?stationId=${stationId}&date=${prevDateStr}`);
      const prevData = await prevRes.json();
      const prevMap = {};
      for (const r of (prevData.readings || [])) {
        prevMap[r.pumpId] = r.closing;
      }
      setPreviousClosings(prevMap);

      const initialForms = {};
      const initialEditing = {};
      for (const pump of pumps) {
        const existing = readingsMap[pump._id];
        const prevClosing = prevMap[pump._id];
        initialForms[pump._id] = {
          opening: existing ? String(existing.opening) : (prevClosing != null ? String(prevClosing) : ''),
          closing: existing ? String(existing.closing) : '',
          rtt: existing ? String(existing.rtt) : '0',
          discrepancyComment: existing?.discrepancyComment || '',
        };
        initialEditing[pump._id] = !existing;
      }
      setForms(initialForms);
      setEditing(initialEditing);
      setMessages({});
    } catch (err) {
      console.error('Error loading meter readings data:', err);
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    if (!stationId) return;
    fetchMonthMarks(date.slice(0, 7));
    fetchData(date);
  }, [session]);

  const handleDateChange = (newDate) => {
    setDate(newDate);
    fetchData(newDate);
    if (newDate.slice(0, 7) !== date.slice(0, 7)) {
      fetchMonthMarks(newDate.slice(0, 7));
    }
  };

  const updateForm = (pumpId, field, value) => {
    setForms((prev) => ({ ...prev, [pumpId]: { ...prev[pumpId], [field]: value } }));
  };

  const startEditing = (pumpId) => {
    const existing = existingReadings[pumpId];
    if (existing) {
      setForms((prev) => ({
        ...prev,
        [pumpId]: {
          opening: String(existing.opening),
          closing: String(existing.closing),
          rtt: String(existing.rtt ?? 0),
          discrepancyComment: existing.discrepancyComment || '',
        },
      }));
    }
    setEditing((prev) => ({ ...prev, [pumpId]: true }));
    setMessages((prev) => ({ ...prev, [pumpId]: '' }));
  };

  const cancelEditing = (pumpId) => {
    setEditing((prev) => ({ ...prev, [pumpId]: false }));
    setMessages((prev) => ({ ...prev, [pumpId]: '' }));
  };

  const submitReading = async (pump) => {
    const f = forms[pump._id];
    if (!f) return;

    setSubmitting((prev) => ({ ...prev, [pump._id]: true }));
    setMessages((prev) => ({ ...prev, [pump._id]: '' }));

    try {
      const res = await fetch('/api/meter-readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          pumpId: pump._id,
          date,
          opening: parseFloat(f.opening) || 0,
          closing: parseFloat(f.closing) || 0,
          rtt: parseFloat(f.rtt) || 0,
          discrepancyComment: f.discrepancyComment || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => ({ ...prev, [pump._id]: data.error || 'Failed to save' }));
      } else {
        await fetchData(date);
        fetchMonthMarks(date.slice(0, 7));
      }
    } catch {
      setMessages((prev) => ({ ...prev, [pump._id]: 'An error occurred.' }));
    } finally {
      setSubmitting((prev) => ({ ...prev, [pump._id]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Meter Readings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Enter opening, closing, and return-to-tank (RTT) readings for each pump.
        </p>
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
          <p className="text-xs text-gray-500 mt-2 text-center">Amber = discrepancy found · Green = all clear</p>
        </div>

        {/* Right: Pump cards */}
        <div className="flex-1 min-w-0 space-y-4">
          {loading ? (
            <div className="flex justify-center py-16"><div className="spinner" /></div>
          ) : openPumps.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
              No pumps are open for this date. The manager must open pumps before readings can be entered.
            </div>
          ) : (
            openPumps.map((pump) => {
              const f = forms[pump._id] || {};
              const existing = existingReadings[pump._id];
              const prevClosing = previousClosings[pump._id];
              const isEditing = editing[pump._id];

              const openingVal = parseFloat(f.opening);
              const hasDiscrepancy = prevClosing != null && !isNaN(openingVal) && openingVal !== prevClosing;

              const netLiters = existing
                ? (existing.closing || 0) - (existing.opening || 0) - (existing.rtt || 0)
                : null;

              const savedAt = existing
                ? new Date(existing.updatedAt || existing.createdAt).toLocaleTimeString('en-NG', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : null;

              return (
                <Card
                  key={pump._id}
                  title={pump.pumpLabel || pump._id}
                  subtitle={existing ? `Last saved: ${savedAt}` : 'Not yet submitted'}
                >
                  {prevClosing != null && (
                    <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
                      <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                      Previous day closing:{' '}
                      <span className="font-semibold text-slate-700">{prevClosing}</span>
                      {existing && existing.opening !== prevClosing && (
                        <span className="ml-2 text-amber-700 font-medium">
                          ⚠ Opening differs from previous closing
                        </span>
                      )}
                    </div>
                  )}

                  {existing && !isEditing ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'Opening', value: existing.opening },
                          { label: 'Closing', value: existing.closing },
                          { label: 'RTT', value: existing.rtt ?? 0 },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-slate-50 rounded-xl p-3">
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                              {label}
                            </p>
                            <p className="text-xl font-bold text-slate-900">
                              {Number(value).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>

                      {netLiters !== null && (
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">
                            Net Liters Sold
                          </p>
                          <p className="text-xl font-bold text-emerald-700">
                            {netLiters.toFixed(2)} L
                          </p>
                        </div>
                      )}

                      {existing.discrepancyComment && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                          <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">
                            Discrepancy Comment
                          </p>
                          <p className="text-sm text-amber-800">{existing.discrepancyComment}</p>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <Button variant="secondary" size="sm" onClick={() => startEditing(pump._id)}>
                          Edit
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Input
                          label="Opening Reading"
                          type="number"
                          name={`opening-${pump._id}`}
                          value={f.opening || ''}
                          onChange={(e) => updateForm(pump._id, 'opening', e.target.value)}
                          min="0"
                          step="0.01"
                        />
                        <Input
                          label="Closing Reading"
                          type="number"
                          name={`closing-${pump._id}`}
                          value={f.closing || ''}
                          onChange={(e) => updateForm(pump._id, 'closing', e.target.value)}
                          min="0"
                          step="0.01"
                        />
                        <Input
                          label="RTT (Return to Tank)"
                          type="number"
                          name={`rtt-${pump._id}`}
                          value={f.rtt || ''}
                          onChange={(e) => updateForm(pump._id, 'rtt', e.target.value)}
                          min="0"
                          step="0.01"
                        />
                      </div>

                      {f.closing && !isNaN(parseFloat(f.closing)) && (
                        <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                          Net liters sold:{' '}
                          <span className="font-bold text-slate-900">
                            {(
                              (parseFloat(f.closing) || 0) -
                              (parseFloat(f.opening) || 0) -
                              (parseFloat(f.rtt) || 0)
                            ).toFixed(2)}
                            L
                          </span>
                        </div>
                      )}

                      {hasDiscrepancy && (
                        <div className="mt-3">
                          <label className="block text-sm font-medium text-amber-700 mb-1.5">
                            Discrepancy Comment <span className="text-red-500">*</span>
                            <span className="ml-1 font-normal text-amber-600">
                              (required — opening differs from previous closing)
                            </span>
                          </label>
                          <textarea
                            value={f.discrepancyComment || ''}
                            onChange={(e) => updateForm(pump._id, 'discrepancyComment', e.target.value)}
                            rows="2"
                            className="w-full px-4 py-3 text-sm border-2 border-amber-300 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 resize-none"
                            placeholder="Explain why the opening reading differs from the previous closing..."
                          />
                        </div>
                      )}

                      {messages[pump._id] && (
                        <p className={`mt-2 text-sm ${messages[pump._id].startsWith('Saved') ? 'text-green-600' : 'text-red-600'}`}>
                          {messages[pump._id]}
                        </p>
                      )}

                      <div className="mt-4 flex gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => submitReading(pump)}
                          disabled={submitting[pump._id] || !f.closing}
                        >
                          {submitting[pump._id] ? 'Saving...' : existing ? 'Update Reading' : 'Save Reading'}
                        </Button>
                        {existing && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => cancelEditing(pump._id)}
                            disabled={submitting[pump._id]}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
