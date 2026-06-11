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

// Lifecycle: not-started → opening auto-set → (optional flag) → closing entered → done
function PumpCard({ pump, existing, prevClosing, canEdit, stationId, date, onSaved }) {
  const [stage, setStage] = useState('idle'); // 'idle' | 'flag_form' | 'closing_form'
  const [flagComment, setFlagComment] = useState('');
  const [closingVal, setClosingVal] = useState('');
  const [rttVal, setRttVal] = useState('0');
  const [manualOpeningVal, setManualOpeningVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const opening = existing?.opening;
  const closing = existing?.closing;
  const openingDone = opening != null;
  const closingDone = closing != null;
  const isFlagged = existing?.discrepancyFlag;

  const net = closingDone
    ? (closing - opening - (existing?.rtt ?? 0)).toFixed(2)
    : null;

  async function autoSetOpening(manualVal) {
    setSaving(true); setError('');
    const body = { action: 'opening', stationId, pumpId: pump.id, pumpLabel: pump.name, date };
    if (manualVal !== undefined) body.manualOpening = manualVal;
    const res = await fetch('/api/meter-readings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Failed to set opening.'); return; }
    onSaved();
  }

  function submitManualOpening() {
    const val = parseFloat(manualOpeningVal);
    if (isNaN(val) || val < 0) { setError('Enter a valid meter reading (the number shown on the physical pump display).'); return; }
    autoSetOpening(val);
  }

  async function submitFlag() {
    if (!flagComment.trim()) { setError('Please describe why the opening reading is incorrect.'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/meter-readings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'flag-opening', stationId, pumpId: pump.id, pumpLabel: pump.name, date, flagComment: flagComment.trim() }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Failed to submit flag.'); return; }
    setStage('idle'); setFlagComment('');
    onSaved();
  }

  async function saveClosing() {
    const val = parseFloat(closingVal);
    if (isNaN(val) || val < 0) { setError('Enter a valid closing reading.'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/meter-readings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'closing', stationId, pumpId: pump.id, pumpLabel: pump.name, date, closing: val, rtt: parseFloat(rttVal) || 0 }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Failed to save closing.'); return; }
    setStage('idle'); setClosingVal(''); setRttVal('0');
    onSaved(); // collapses back to the pump list summary
  }

  let statusColor = 'bg-gray-200 text-gray-500';
  let statusLabel = 'Not started';
  if (closingDone) { statusColor = 'bg-emerald-100 text-emerald-700'; statusLabel = 'Closed'; }
  else if (openingDone) { statusColor = 'bg-blue-100 text-blue-700'; statusLabel = 'Open'; }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div>
          <p className="font-semibold text-slate-900">{pump.name}</p>
          {pump.fuelType && <p className="text-xs text-slate-500">{pump.fuelType}</p>}
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor}`}>{statusLabel}</span>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* ── NOT OPENED ── */}
        {!openingDone && stage === 'idle' && canEdit && (
          prevClosing != null ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5 text-sm">
                <span className="text-xs text-slate-400 uppercase tracking-wide shrink-0">Auto Opening</span>
                <span className="font-bold text-slate-900 text-lg">{Number(prevClosing).toLocaleString()}</span>
                <span className="text-xs text-slate-400">(from previous day&apos;s closing)</span>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button onClick={() => autoSetOpening()} disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-ecana-maroon/40 text-ecana-maroon font-medium text-sm hover:bg-ecana-maroon/5 transition-colors disabled:opacity-50">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {saving ? 'Setting opening…' : 'Confirm & Open Pump'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                No previous reading found. Enter the current meter reading shown on the physical pump display.
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={manualOpeningVal}
                onChange={e => { setManualOpeningVal(e.target.value); setError(''); }}
                placeholder="e.g. 45250"
                className="w-full px-4 py-3 text-sm border-2 border-amber-300 rounded-xl focus:outline-none focus:border-amber-500"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button onClick={submitManualOpening} disabled={saving || !manualOpeningVal.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-ecana-maroon/40 text-ecana-maroon font-medium text-sm hover:bg-ecana-maroon/5 transition-colors disabled:opacity-50">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {saving ? 'Setting opening…' : 'Set Opening & Open Pump'}
              </button>
            </div>
          )
        )}

        {/* ── OPENING DONE: read-only display ── */}
        {openingDone && stage === 'idle' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
              <div>
                <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Opening (Auto-set)</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">{Number(opening).toLocaleString()}</p>
                {existing?.openingSubmittedAt && (
                  <p className="text-xs text-slate-400 mt-0.5">Confirmed at {fmtTime(existing.openingSubmittedAt)}</p>
                )}
              </div>
              {canEdit && !closingDone && !isFlagged && (
                <button onClick={() => { setStage('flag_form'); setError(''); }}
                  className="text-xs font-medium text-amber-600 border border-amber-300 rounded-lg px-2.5 py-1 hover:bg-amber-50">
                  Flag as Wrong
                </button>
              )}
            </div>

            {isFlagged && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div>
                  <p className="font-medium">Opening flagged as incorrect — awaiting admin correction</p>
                  {existing?.discrepancyComment && <p className="mt-0.5 text-amber-700">{existing.discrepancyComment}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── FLAG FORM ── */}
        {stage === 'flag_form' && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-amber-700">Describe why the opening reading is incorrect:</p>
            <textarea
              value={flagComment}
              onChange={e => { setFlagComment(e.target.value); setError(''); }}
              rows={3}
              autoFocus
              className="w-full px-4 py-3 text-sm border-2 border-amber-400 rounded-xl focus:outline-none focus:border-amber-600 resize-none"
              placeholder="e.g. Physical meter shows a different reading..."
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button onClick={submitFlag} disabled={saving}
                className="flex-1 py-2 text-sm rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50">
                {saving ? 'Submitting…' : 'Submit Flag'}
              </button>
              <button onClick={() => { setStage('idle'); setFlagComment(''); setError(''); }} disabled={saving}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── ENTER CLOSING button ── */}
        {openingDone && !closingDone && stage === 'idle' && canEdit && (
          <button onClick={() => { setClosingVal(''); setRttVal('0'); setError(''); setStage('closing_form'); }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-emerald-300 text-emerald-700 font-medium text-sm hover:bg-emerald-50 transition-colors">
            Enter Closing Reading &amp; RTT
          </button>
        )}

        {/* ── CLOSING FORM ── */}
        {stage === 'closing_form' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Closing Reading" type="text" inputMode="decimal" value={closingVal}
                onChange={e => { setClosingVal(e.target.value); setError(''); }} placeholder="Enter closing reading" autoFocus />
              <Input label="RTT (Return to Tank)" type="text" inputMode="decimal" value={rttVal}
                onChange={e => setRttVal(e.target.value)} placeholder="0" />
            </div>

            {closingVal && !isNaN(parseFloat(closingVal)) && (
              <div className="p-3 bg-emerald-50 rounded-xl text-sm">
                Net sold: <span className="font-bold text-emerald-700">
                  {((parseFloat(closingVal) || 0) - (opening || 0) - (parseFloat(rttVal) || 0)).toFixed(2)}
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

        {/* ── FULLY CLOSED: summary ── */}
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
                <p className="text-xs text-slate-500 uppercase tracking-wide">Net Sold</p>
                <p className="text-2xl font-bold text-emerald-700 mt-0.5">{net}</p>
              </div>
              {canEdit && (
                <button onClick={() => { setClosingVal(String(closing)); setRttVal(String(existing?.rtt ?? 0)); setStage('closing_form'); }}
                  className="text-xs text-emerald-600 hover:underline font-medium">Edit Closing</button>
              )}
            </div>
            {existing?.closingSubmittedAt && (
              <p className="text-xs text-slate-400">Closing entered at {fmtTime(existing.closingSubmittedAt)}</p>
            )}
          </div>
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

  const [openingAll, setOpeningAll] = useState(false);

  const canEdit = !!activeDayShift;
  const isToday = date === today();

  const openedCount = pumps.filter(p => existingReadings[p.id]?.opening != null).length;
  const closedCount = pumps.filter(p => existingReadings[p.id]?.closing != null).length;
  const unopenedPumps = pumps.filter(p => existingReadings[p.id]?.opening == null);
  // Only auto-open pumps that have a previous closing — ones with no history need manual entry
  const autoOpenablePumps = unopenedPumps.filter(p => previousClosings[p.id] != null);

  async function openAll() {
    if (!autoOpenablePumps.length) return;
    setOpeningAll(true);
    await Promise.all(
      autoOpenablePumps.map(pump =>
        fetch('/api/meter-readings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'opening', stationId, pumpId: pump.id, pumpLabel: pump.name, date }),
        })
      )
    );
    setOpeningAll(false);
    fetchData(date);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Meter Readings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Opening readings are set automatically from the previous day&apos;s closing. Confirm each pump, then enter the closing reading at end of shift.
        </p>
      </div>

      {/* Active shift status banner */}
      {isToday && (
        activeDayShift ? (
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              Day is open · {openedCount}/{pumps.length} pumps opened · {closedCount}/{pumps.length} closed
            </div>
            {autoOpenablePumps.length > 0 && (
              <button
                onClick={openAll}
                disabled={openingAll}
                className="shrink-0 px-3 py-1 text-xs font-semibold bg-ecana-maroon text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {openingAll ? 'Opening…' : `Open All (${autoOpenablePumps.length})`}
              </button>
            )}
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
