'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/Button';
import DateCalendar from '@/components/DateCalendar';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}

export default function TankStockPage() {
  const { data: session } = useSession();
  const [tanks, setTanks] = useState([]);
  const [existingEntries, setExistingEntries] = useState({});
  const [forms, setForms] = useState({});
  const [editing, setEditing] = useState({});
  const [period, setPeriod] = useState('opening');
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState({});
  const [messages, setMessages] = useState({});
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

  const fetchData = useCallback(async (dateStr, periodVal) => {
    if (!stationId) return;
    setLoading(true);
    try {
      const [stationRes, stockRes] = await Promise.all([
        fetch(`/api/stations/${stationId}`),
        fetch(`/api/tank-stock?stationId=${stationId}&date=${dateStr}`),
      ]);
      const stationData = await stationRes.json();
      const stockData = await stockRes.json();

      const activeTanks = (stationData.station?.tanks || []).filter((t) => t.isActive !== false);
      setTanks(activeTanks);

      const map = {};
      for (const entry of (stockData.entries || [])) {
        map[`${entry.tankId}-${entry.period}`] = entry;
      }
      setExistingEntries(map);

      const initialForms = {};
      const initialEditing = {};
      for (const tank of activeTanks) {
        const key = `${tank._id}-${periodVal}`;
        const existing = map[key];
        initialForms[tank._id] = {
          stockValue: existing ? String(existing.closingStockMeasured) : '',
          notes: existing?.notes || '',
        };
        initialEditing[tank._id] = !existing;
      }
      setForms(initialForms);
      setEditing(initialEditing);
      setMessages({});
    } catch (err) {
      console.error('Error loading tank stock data:', err);
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    if (!stationId) return;
    fetchMonthMarks(date.slice(0, 7));
    fetchData(date, period);
  }, [session]);

  const handleDateChange = (newDate) => {
    setDate(newDate);
    fetchData(newDate, period);
    if (newDate.slice(0, 7) !== date.slice(0, 7)) {
      fetchMonthMarks(newDate.slice(0, 7));
    }
  };

  const handlePeriodChange = (e) => {
    const newPeriod = e.target.value;
    setPeriod(newPeriod);
    fetchData(date, newPeriod);
  };

  const updateForm = (tankId, field, value) => {
    setForms((prev) => ({ ...prev, [tankId]: { ...prev[tankId], [field]: value } }));
  };

  const startEditing = (tankId) => {
    const existingKey = `${tankId}-${period}`;
    const existing = existingEntries[existingKey];
    if (existing) {
      setForms((prev) => ({
        ...prev,
        [tankId]: {
          stockValue: String(existing.closingStockMeasured),
          notes: existing.notes || '',
        },
      }));
    }
    setEditing((prev) => ({ ...prev, [tankId]: true }));
    setMessages((prev) => ({ ...prev, [tankId]: '' }));
  };

  const cancelEditing = (tankId) => {
    setEditing((prev) => ({ ...prev, [tankId]: false }));
    setMessages((prev) => ({ ...prev, [tankId]: '' }));
  };

  const submitEntry = async (tank) => {
    const f = forms[tank._id];
    if (!f?.stockValue) return;

    setSubmitting((prev) => ({ ...prev, [tank._id]: true }));
    setMessages((prev) => ({ ...prev, [tank._id]: '' }));

    try {
      const res = await fetch('/api/tank-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          tankId: tank._id,
          date,
          period,
          stockValue: parseFloat(f.stockValue),
          notes: f.notes || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => ({ ...prev, [tank._id]: data.error || 'Failed to save' }));
      } else {
        await fetchData(date, period);
        fetchMonthMarks(date.slice(0, 7));
      }
    } catch {
      setMessages((prev) => ({ ...prev, [tank._id]: 'An error occurred.' }));
    } finally {
      setSubmitting((prev) => ({ ...prev, [tank._id]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tank Stock</h1>
        <p className="text-sm text-slate-500 mt-1">
          Record the measured stock level for each tank at opening and closing.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left: Calendar + period */}
        <div className="w-full lg:w-80 shrink-0 space-y-3">
          <DateCalendar
            value={date}
            onChange={handleDateChange}
            markedDates={markedDates}
            onMonthChange={fetchMonthMarks}
            maxDate={today()}
          />
          <p className="text-xs text-gray-500 text-center">Amber = no closing · Green = closing done</p>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <Select
              label="Period"
              name="period"
              value={period}
              onChange={handlePeriodChange}
              options={[
                { value: 'opening', label: 'Opening (Start of Day)' },
                { value: 'closing', label: 'Closing (End of Day)' },
              ]}
            />
          </div>
        </div>

        {/* Right: Tank cards */}
        <div className="flex-1 min-w-0 space-y-4">
          {loading ? (
            <div className="flex justify-center py-16"><div className="spinner" /></div>
          ) : tanks.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
              No active tanks configured for this station. Ask the manager or admin to add tanks in Station Config.
            </div>
          ) : (
            tanks.map((tank) => {
              const f = forms[tank._id] || {};
              const existingKey = `${tank._id}-${period}`;
              const existing = existingEntries[existingKey];
              const oppositeKey = `${tank._id}-${period === 'opening' ? 'closing' : 'opening'}`;
              const oppositeEntry = existingEntries[oppositeKey];
              const isEditing = editing[tank._id];
              const periodLabel = period === 'opening' ? 'Opening' : 'Closing';
              const savedAt = existing
                ? new Date(existing.updatedAt || existing.createdAt).toLocaleString('en-NG', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : null;

              return (
                <Card
                  key={tank._id}
                  title={`${tank.label || tank._id} — ${tank.product}`}
                  subtitle={
                    existing
                      ? `${periodLabel} submitted · ${savedAt}`
                      : `${periodLabel} not yet submitted`
                  }
                >
                  {oppositeEntry && (
                    <div className="mb-4 text-sm text-slate-500">
                      {period === 'closing'
                        ? `Opening stock: ${Number(oppositeEntry.closingStockMeasured).toLocaleString()} L`
                        : `Closing stock: ${Number(oppositeEntry.closingStockMeasured).toLocaleString()} L`}
                    </div>
                  )}

                  {existing && !isEditing ? (
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1.5">
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                          {periodLabel} Stock
                        </p>
                        <p className="text-3xl font-bold text-slate-900 leading-none">
                          {Number(existing.closingStockMeasured).toLocaleString()}
                          <span className="text-xl font-normal text-slate-400 ml-1.5">L</span>
                        </p>
                        {existing.notes ? (
                          <p className="text-sm text-slate-500 pt-1">Note: {existing.notes}</p>
                        ) : null}
                        {existing.variance !== undefined && existing.variance !== 0 ? (
                          <p className={`text-sm font-medium ${existing.variance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            Variance: {existing.variance > 0 ? '+' : ''}
                            {existing.variance.toFixed(2)} L
                            {existing.variancePercent != null
                              ? ` (${existing.variance > 0 ? '+' : ''}${existing.variancePercent.toFixed(1)}%)`
                              : ''}
                          </p>
                        ) : null}
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => startEditing(tank._id)}>
                        Edit
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input
                          label={`${periodLabel} Stock (Litres)`}
                          type="text"
                          inputMode="decimal"
                          name={`stock-${tank._id}`}
                          value={f.stockValue || ''}
                          onChange={(e) => updateForm(tank._id, 'stockValue', e.target.value)}
                          placeholder="e.g. 15000"
                        />
                        <Input
                          label="Notes (Optional)"
                          name={`notes-${tank._id}`}
                          value={f.notes || ''}
                          onChange={(e) => updateForm(tank._id, 'notes', e.target.value)}
                          placeholder="Any observation..."
                        />
                      </div>

                      {messages[tank._id] && (
                        <p className={`mt-2 text-sm ${messages[tank._id].startsWith('Saved') ? 'text-green-600' : 'text-red-600'}`}>
                          {messages[tank._id]}
                        </p>
                      )}

                      <div className="mt-4 flex gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => submitEntry(tank)}
                          disabled={submitting[tank._id] || !f.stockValue}
                        >
                          {submitting[tank._id] ? 'Saving...' : existing ? `Update ${periodLabel}` : `Save ${periodLabel}`}
                        </Button>
                        {existing && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => cancelEditing(tank._id)}
                            disabled={submitting[tank._id]}
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
