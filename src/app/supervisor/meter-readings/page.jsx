'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Button from '@/components/Button';
import DateCalendar from '@/components/DateCalendar';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}

function fmtTime(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

// One pump card covers the full lifecycle: not-opened → opened (opening saved) → closed (closing saved)
function PumpCard({ pump, existing, prevClosing, canEdit, stationId, date, onSaved }) {
  const [stage, setStage] = useState('idle'); // 'idle' | 'opening_form' | 'closing_form'
  const [openingVal, setOpeningVal] = useState('');
  const [comment, setComment] = useState('');
  const [closingVal, setClosingVal] = useState('');
  const [rttVal, setRttVal] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const opening = existing?.opening;
  const closing = existing?.closing;
  const openingDone = opening != null;
  const closingDone = closing != null;

  // Use same 0.01 tolerance as the API to avoid false discrepancy flags from float precision
  const discrepancy = prevClosing != null && openingDone && Math.abs(opening - prevClosing) > 0.01;
  const liveDiscrepancy = prevClosing != null &&
    openingVal !== '' &&
    !isNaN(parseFloat(openingVal)) &&
    Math.abs(parseFloat(openingVal) - prevClosing) > 0.01;

  const net = closingDone
    ? (closing - opening - (existing?.rtt ?? 0)).toFixed(2)
    : null;

  async function saveOpening() {
    const val = parseFloat(openingVal);
    if (isNaN(val) || val < 0) { setError('Enter a valid opening reading.'); return; }
    if (liveDiscrepancy && !comment.trim()) {
      setError('Please state why the opening reading differs from the previous day\'s closing stock.');
      return;
    }
    setSaving(true); setError('');
    const res = await fetch('/api/meter-readings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'opening',
        stationId,
        pumpId: pump.id,
        pumpLabel: pump.name,
        date,
        opening: val,
        discrepancyComment: comment.trim() || undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Failed to save opening.'); return; }
    setStage('idle');
    setOpeningVal(''); setComment('');
    onSaved();
  }

  async function saveClosing() {
    const val = parseFloat(closingVal);
    if (isNaN(val) || val < 0) { setError('Enter a valid closing reading.'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/meter-readings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'closing',
        stationId,
        pumpId: pump.id,
        pumpLabel: pump.name,
        date,
        closing: val,
        rtt: parseFloat(rttVal) || 0,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Failed to save closing.'); return; }
    setStage('idle');
    setClosingVal(''); setRttVal('0');
    onSaved();
  }

  function startOpeningEdit() {
    setOpeningVal(existing ? String(existing.opening) : (prevClosing != null ? String(prevClosing) : ''));
    setComment(existing?.discrepancyComment || '');
    setError('');
    setStage('opening_form');
  }

  function startClosingEdit() {
    setClosingVal(existing?.closing != null ? String(existing.closing) : '');
    setRttVal(existing?.rtt != null ? String(existing.rtt) : '0');
    setError('');
    setStage('closing_form');
  }

  // Status indicator
  let statusColor = 'bg-gray-200 text-gray-500';
  let statusLabel = 'Not opened';
  if (closingDone) { statusColor = 'bg-emerald-100 text-emerald-700'; statusLabel = 'Closed'; }
  else if (openingDone) { statusColor = 'bg-blue-100 text-blue-700'; statusLabel = 'Open'; }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div>
          <p className="font-semibold text-slate-900">{pump.name}</p>
          {pump.fuelType && <p className="text-xs text-slate-500">{pump.fuelType}</p>}
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Last known closing hint — shown to supervisor so they know what to expect */}
        {prevClosing != null && (
          <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
            Last closing reading: <span className="font-semibold text-slate-800 ml-1">{prevClosing}</span>
            <span className="text-xs text-slate-400 ml-1">(opening must match unless explained)</span>
          </div>
        )}

        {/* ── NOT OPENED: show open-pump button ── */}
        {!openingDone && stage === 'idle' && canEdit && (
          <button
            onClick={startOpeningEdit}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-ecana-maroon/40 text-ecana-maroon font-medium text-sm hover:bg-ecana-maroon/5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Open Pump &amp; Enter Opening Reading
          </button>
        )}

        {/* ── OPENING FORM ── */}
        {stage === 'opening_form' && (
          <div className="space-y-3">
            <Input
              label={prevClosing != null ? `Opening Reading (last closing was ${prevClosing})` : 'Opening Reading'}
              type="text"
              inputMode="decimal"
              value={openingVal}
              onChange={e => { setOpeningVal(e.target.value); setError(''); }}
              placeholder="Enter meter reading"
              autoFocus
            />

            {liveDiscrepancy && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <span>
                  It was observed that opening reading differs from previous day&apos;s closing stock, state why below.
                </span>
              </div>
            )}

            {liveDiscrepancy && (
              <div>
                <label className="block text-sm font-medium text-amber-700 mb-1.5">
                  Reason for discrepancy <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={comment}
                  onChange={e => { setComment(e.target.value); setError(''); }}
                  rows={3}
                  autoFocus={false}
                  className="w-full px-4 py-3 text-sm border-2 border-amber-400 rounded-xl focus:outline-none focus:border-amber-600 focus:ring-4 focus:ring-amber-100 resize-none bg-white"
                  placeholder="e.g. Pump was reset overnight, reading carries over from previous day..."
                />
              </div>
            )}

            {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={saveOpening} disabled={saving}>
                {saving ? 'Saving...' : 'Save Opening Reading'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => { setStage('idle'); setError(''); }} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* ── OPENED: show opening reading summary ── */}
        {openingDone && stage !== 'opening_form' && (
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
              <div>
                <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Opening Reading</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">{Number(opening).toLocaleString()}</p>
                {existing?.openingSubmittedAt && (
                  <p className="text-xs text-slate-400 mt-0.5">Entered at {fmtTime(existing.openingSubmittedAt)}</p>
                )}
              </div>
              {canEdit && stage === 'idle' && (
                <button onClick={startOpeningEdit} className="text-xs text-blue-600 hover:underline font-medium">
                  Edit
                </button>
              )}
            </div>

            {discrepancy && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div>
                  <p className="font-medium">Discrepancy flagged</p>
                  {existing?.discrepancyComment && (
                    <p className="mt-0.5 text-amber-700">{existing.discrepancyComment}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CLOSING FORM ── */}
        {stage === 'closing_form' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Closing Reading"
                type="text"
                inputMode="decimal"
                value={closingVal}
                onChange={e => { setClosingVal(e.target.value); setError(''); }}
                placeholder="Enter closing reading"
                autoFocus
              />
              <Input
                label="RTT (Return to Tank)"
                type="text"
                inputMode="decimal"
                value={rttVal}
                onChange={e => setRttVal(e.target.value)}
                placeholder="0"
              />
            </div>

            {closingVal && !isNaN(parseFloat(closingVal)) && (
              <div className="p-3 bg-emerald-50 rounded-xl text-sm">
                Net liters:{' '}
                <span className="font-bold text-emerald-700">
                  {((parseFloat(closingVal) || 0) - (opening || 0) - (parseFloat(rttVal) || 0)).toFixed(2)} L
                </span>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={saveClosing} disabled={saving}>
                {saving ? 'Saving...' : 'Save Closing Reading'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => { setStage('idle'); setError(''); }} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* ── FULLY CLOSED: full summary ── */}
        {closingDone && stage === 'idle' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Opening', value: opening },
                { label: 'Closing', value: closing },
                { label: 'RTT', value: existing?.rtt ?? 0 },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{label}</p>
                  <p className="text-lg font-bold text-slate-900">{Number(value).toLocaleString()}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Net Liters Sold</p>
                <p className="text-2xl font-bold text-emerald-700 mt-0.5">{net} L</p>
              </div>
              {canEdit && (
                <button onClick={startClosingEdit} className="text-xs text-emerald-600 hover:underline font-medium">
                  Edit Closing
                </button>
              )}
            </div>

            {existing?.closingSubmittedAt && (
              <p className="text-xs text-slate-400">Closing entered at {fmtTime(existing.closingSubmittedAt)}</p>
            )}
          </div>
        )}

        {/* ── OPEN but no closing yet: show "Enter Closing" button ── */}
        {openingDone && !closingDone && stage === 'idle' && canEdit && (
          <button
            onClick={startClosingEdit}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-emerald-300 text-emerald-700 font-medium text-sm hover:bg-emerald-50 transition-colors"
          >
            Enter Closing Reading &amp; RTT
          </button>
        )}
      </div>
    </div>
  );
}

export default function MeterReadingsPage() {
  const { data: session } = useSession();
  const stationId = session?.user?.stationId;

  const [activeDayShift, setActiveDayShift] = useState(null);
  const [pumps, setPumps] = useState([]);
  const [existingReadings, setExistingReadings] = useState({});
  const [previousClosings, setPreviousClosings] = useState({});
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(today());
  const [markedDates, setMarkedDates] = useState({});

  const fetchMonthMarks = useCallback(async (monthStr) => {
    if (!stationId) return;
    try {
      const res = await fetch(`/api/meter-readings?stationId=${stationId}&month=${monthStr}`);
      const data = await res.json();
      const grouped = {};
      for (const r of (data.readings || [])) {
        const d = (r.date || '').slice(0, 10);
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
      const [shiftsRes, readingsRes] = await Promise.all([
        fetch(`/api/day-shifts?stationId=${stationId}&status=in_progress`),
        fetch(`/api/meter-readings?stationId=${stationId}&date=${dateStr}`),
      ]);
      const shiftsData = await shiftsRes.json();
      const readingsData = await readingsRes.json();

      const activeShift = (shiftsData.dayShifts || [])[0] || null;
      setActiveDayShift(activeShift);

      const readingsMap = {};
      for (const r of (readingsData.readings || [])) readingsMap[r.pumpId] = r;
      setExistingReadings(readingsMap);

      // Fetch the MOST RECENT closing for each pump before today — regardless of which date.
      // This is what the API also compares against, so both always agree.
      const prevRes = await fetch(
        `/api/meter-readings?stationId=${stationId}&lastClosingBefore=${dateStr}`
      );
      const prevData = await prevRes.json();
      const prevMap = {};
      for (const r of (prevData.lastClosings || [])) {
        prevMap[r._id] = r.closing; // _id is pumpId from the aggregate $group
      }
      setPreviousClosings(prevMap);

      // Build pump list from active shift OR from readings (for past dates)
      const shiftDispensers = activeShift?.dispenserAssignments || [];
      const readingEntries = Object.values(readingsMap);

      if (shiftDispensers.length > 0) {
        setPumps(shiftDispensers.map(d => ({ id: d.dispenserId, name: d.dispenserName, fuelType: d.fuelType })));
      } else if (readingEntries.length > 0) {
        setPumps(readingEntries.map(r => ({ id: r.pumpId, name: r.pumpLabel || r.pumpId, fuelType: '' })));
      } else {
        setPumps([]);
      }
    } catch (err) {
      console.error('Error loading meter readings:', err);
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
    if (newDate.slice(0, 7) !== date.slice(0, 7)) fetchMonthMarks(newDate.slice(0, 7));
  };

  const canEdit = !!activeDayShift;
  const isToday = date === today();

  const openedCount = pumps.filter(p => existingReadings[p.id]?.opening != null).length;
  const closedCount = pumps.filter(p => existingReadings[p.id]?.closing != null).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Meter Readings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Open each pump at the start of your shift and record the closing reading at end of shift.
        </p>
      </div>

      {/* Active shift status banner */}
      {isToday && (
        activeDayShift ? (
          <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            Day is open · {openedCount}/{pumps.length} pumps opened · {closedCount}/{pumps.length} closed
          </div>
        ) : (
          <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            No active day shift — wait for the manager to begin the day before opening pumps.
          </div>
        )
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Calendar */}
        <div className="w-full lg:w-72 shrink-0">
          <DateCalendar
            value={date}
            onChange={handleDateChange}
            markedDates={markedDates}
            onMonthChange={fetchMonthMarks}
            maxDate={today()}
          />
          <p className="text-xs text-gray-500 mt-2 text-center">Amber = discrepancy · Green = readings submitted</p>
        </div>

        {/* Pump cards */}
        <div className="flex-1 min-w-0 space-y-4">
          {loading ? (
            <div className="flex justify-center py-16"><div className="spinner" /></div>
          ) : pumps.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 text-slate-600 px-4 py-6 rounded-xl text-sm text-center">
              {activeDayShift
                ? 'No pumps found in today\'s shift. Ask the manager to begin day with active pumps selected.'
                : 'No active shift and no readings for this date.'}
            </div>
          ) : (
            pumps.map(pump => (
              <PumpCard
                key={pump.id}
                pump={pump}
                existing={existingReadings[pump.id] || null}
                prevClosing={previousClosings[pump.id] ?? null}
                canEdit={canEdit}
                stationId={stationId}
                date={date}
                onSaved={() => fetchData(date)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
