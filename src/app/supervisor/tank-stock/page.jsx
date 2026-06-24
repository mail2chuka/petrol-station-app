'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import DateCalendar from '@/components/DateCalendar';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}

function fmtTime(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

// Single card showing both opening and closing dipstick for a tank
function TankCard({ tank, openingEntry, closingEntry, prevDayClosing, canEdit, stationId, date, onSaved }) {
  const [stage, setStage] = useState('idle'); // 'idle' | 'opening_form' | 'closing_form'
  const [openingVal, setOpeningVal] = useState('');
  const [closingVal, setClosingVal] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openingDipstick = openingEntry?.closingStockMeasured;
  const closingDipstick = closingEntry?.closingStockMeasured;
  const volumeUsed = openingDipstick != null && closingDipstick != null
    ? openingDipstick - closingDipstick : null;

  async function saveEntry(period, value, noteVal) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/tank-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          tankId: tank._id,
          date,
          period,
          stockValue: parseFloat(value),
          notes: noteVal || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save'); return false; }
      return true;
    } catch {
      setError('Network error. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitOpening() {
    const val = parseFloat(openingVal);
    if (isNaN(val) || val < 0) { setError('Enter a valid dipstick reading (litres).'); return; }
    const ok = await saveEntry('opening', val, notes);
    if (ok) { setStage('idle'); setOpeningVal(''); setNotes(''); onSaved(); }
  }

  async function submitClosing() {
    const val = parseFloat(closingVal);
    if (isNaN(val) || val < 0) { setError('Enter a valid dipstick reading (litres).'); return; }
    const ok = await saveEntry('closing', val, notes);
    if (ok) { setStage('idle'); setClosingVal(''); setNotes(''); onSaved(); }
  }

  let statusLabel = 'Not started';
  let statusColor = 'bg-gray-200 text-gray-500';
  if (closingDipstick != null) { statusLabel = 'Complete'; statusColor = 'bg-emerald-100 text-emerald-700'; }
  else if (openingDipstick != null) { statusLabel = 'Opening recorded'; statusColor = 'bg-blue-100 text-blue-700'; }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div>
          <p className="font-semibold text-slate-900">{tank.label || tank._id}</p>
          {tank.product && <p className="text-xs text-slate-500">{tank.product}</p>}
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor}`}>{statusLabel}</span>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Previous day reference */}
        {prevDayClosing != null && (
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            <span className="uppercase tracking-wide">Yesterday&apos;s closing:</span>
            <span className="font-bold text-slate-800">{Number(prevDayClosing).toLocaleString()} L</span>
          </div>
        )}

        {/* Opening dipstick row */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Opening Dipstick</p>
          {openingDipstick != null && stage !== 'opening_form' ? (
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
              <div>
                <p className="text-2xl font-bold text-slate-900">{Number(openingDipstick).toLocaleString()}<span className="text-base font-normal text-slate-400 ml-1">L</span></p>
                {openingEntry?.updatedAt && (
                  <p className="text-xs text-slate-400 mt-0.5">Recorded at {fmtTime(openingEntry.updatedAt)}</p>
                )}
              </div>
              {canEdit && closingDipstick == null && (
                <button onClick={() => { setOpeningVal(String(openingDipstick)); setStage('opening_form'); setError(''); }}
                  className="text-xs text-blue-600 hover:underline font-medium">Edit</button>
              )}
            </div>
          ) : stage === 'opening_form' ? (
            <div className="space-y-3">
              <input type="text" inputMode="decimal" value={openingVal}
                onChange={e => { setOpeningVal(e.target.value); setError(''); }}
                placeholder="e.g. 15000" autoFocus
                className="w-full px-4 py-3 text-sm border-2 border-blue-300 rounded-xl focus:outline-none focus:border-blue-500" />
              {error && <p className="text-sm text-amber-700">{error}</p>}
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={submitOpening} disabled={saving || !openingVal.trim()}>
                  {saving ? 'Saving…' : 'Save Opening'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => { setStage('idle'); setError(''); }} disabled={saving}>Cancel</Button>
              </div>
            </div>
          ) : canEdit ? (
            <button onClick={() => { setOpeningVal(''); setStage('opening_form'); setError(''); }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-ecana-maroon/40 text-ecana-maroon font-medium text-sm hover:bg-ecana-maroon/5 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Record Opening Dipstick
            </button>
          ) : (
            <p className="text-sm text-gray-400">Not recorded</p>
          )}
        </div>

        {/* Closing dipstick row */}
        {openingDipstick != null && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Closing Dipstick</p>
            {closingDipstick != null && stage !== 'closing_form' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl">
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{Number(closingDipstick).toLocaleString()}<span className="text-base font-normal text-slate-400 ml-1">L</span></p>
                    {closingEntry?.updatedAt && (
                      <p className="text-xs text-slate-400 mt-0.5">Recorded at {fmtTime(closingEntry.updatedAt)}</p>
                    )}
                  </div>
                  {canEdit && (
                    <button onClick={() => { setClosingVal(String(closingDipstick)); setStage('closing_form'); setError(''); }}
                      className="text-xs text-emerald-600 hover:underline font-medium">Edit</button>
                  )}
                </div>
                {volumeUsed != null && (
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-sm">
                    <span className="text-slate-500 text-xs uppercase tracking-wide">Volume Used</span>
                    <span className="font-bold text-slate-900">{Number(volumeUsed).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L</span>
                  </div>
                )}
              </div>
            ) : stage === 'closing_form' ? (
              <div className="space-y-3">
                <input type="text" inputMode="decimal" value={closingVal}
                  onChange={e => { setClosingVal(e.target.value); setError(''); }}
                  placeholder="e.g. 12000" autoFocus
                  className="w-full px-4 py-3 text-sm border-2 border-emerald-300 rounded-xl focus:outline-none focus:border-emerald-500" />
                {closingVal && !isNaN(parseFloat(closingVal)) && openingDipstick != null && (
                  <div className="p-3 bg-emerald-50 rounded-xl text-sm">
                    Volume used: <span className="font-bold text-emerald-700">
                      {(openingDipstick - parseFloat(closingVal)).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L
                    </span>
                  </div>
                )}
                {error && <p className="text-sm text-amber-700">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={submitClosing} disabled={saving || !closingVal.trim()}>
                    {saving ? 'Saving…' : 'Save Closing'}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => { setStage('idle'); setError(''); }} disabled={saving}>Cancel</Button>
                </div>
              </div>
            ) : canEdit ? (
              <button onClick={() => { setClosingVal(''); setStage('closing_form'); setError(''); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-emerald-300 text-emerald-700 font-medium text-sm hover:bg-emerald-50 transition-colors">
                Record Closing Dipstick
              </button>
            ) : (
              <p className="text-sm text-gray-400">Not recorded</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TankStockPage() {
  const { data: session } = useSession();
  const [tanks, setTanks] = useState([]);
  const [existingEntries, setExistingEntries] = useState({});
  const [prevClosings, setPrevClosings] = useState({});
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(false);
  const [markedDates, setMarkedDates] = useState({});

  const stationId = session?.user?.stationId;

  const fetchMonthMarks = useCallback(async (monthStr) => {
    if (!stationId) return;
    try {
      const res = await fetch(`/api/tank-stock?stationId=${stationId}&month=${monthStr}`);
      const data = await res.json();
      const grouped = {};
      for (const e of (data.entries || [])) {
        const d = (e.date || e.createdAt || '').slice(0, 10);
        if (!d) continue;
        if (!grouped[d]) grouped[d] = { hasClosing: false, hasOpening: false };
        if (e.period === 'closing') grouped[d].hasClosing = true;
        if (e.period === 'opening') grouped[d].hasOpening = true;
      }
      const marks = {};
      for (const [d, v] of Object.entries(grouped)) {
        marks[d] = { total: 1, pending: v.hasClosing ? 0 : 1 };
      }
      setMarkedDates(prev => ({ ...prev, ...marks }));
    } catch {}
  }, [stationId]);

  const fetchData = useCallback(async (dateStr) => {
    if (!stationId) return;
    setLoading(true);
    try {
      // Previous day for reference
      const prevDate = new Date(dateStr);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];

      const [stationRes, stockRes, prevRes] = await Promise.all([
        fetch(`/api/stations/${stationId}`),
        fetch(`/api/tank-stock?stationId=${stationId}&date=${dateStr}`),
        fetch(`/api/tank-stock?stationId=${stationId}&date=${prevDateStr}`),
      ]);
      const stationData = await stationRes.json();
      const stockData = await stockRes.json();
      const prevData = await prevRes.json();

      const activeTanks = (stationData.station?.tanks || []).filter(t => t.isActive !== false);
      setTanks(activeTanks);

      const map = {};
      for (const entry of (stockData.entries || [])) {
        map[`${entry.tankId}-${entry.period}`] = entry;
      }
      setExistingEntries(map);

      const prevMap = {};
      for (const entry of (prevData.entries || [])) {
        if (entry.period === 'closing') prevMap[entry.tankId] = entry.closingStockMeasured;
      }
      setPrevClosings(prevMap);
    } catch (err) {
      console.error('Error loading tank stock data:', err);
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

  const isToday = date === today();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tank Dipstick Readings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Record the opening dipstick at start of day and the closing dipstick at end of day for each tank.
        </p>
      </div>

      {isToday && (
        <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
          Enter the physical dipstick reading (in litres) for each tank — opening at start of shift, closing at end of shift.
        </div>
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
          <p className="text-xs text-gray-500 mt-2 text-center">Amber = no closing · Green = closing done</p>
        </div>

        {/* Tank cards */}
        <div className="flex-1 min-w-0 space-y-4">
          {loading ? (
            <div className="flex justify-center py-16"><div className="spinner" /></div>
          ) : tanks.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
              No active tanks configured for this station. Ask the manager or admin to add tanks in Station Config.
            </div>
          ) : (
            tanks.map(tank => (
              <TankCard
                key={tank._id}
                tank={tank}
                openingEntry={existingEntries[`${tank._id}-opening`] || null}
                closingEntry={existingEntries[`${tank._id}-closing`] || null}
                prevDayClosing={prevClosings[tank._id] ?? null}
                canEdit={isToday}
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
