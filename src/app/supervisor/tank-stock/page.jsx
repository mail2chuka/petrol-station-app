'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

function today() {
  return new Date().toISOString().split('T')[0];
}

export default function TankStockPage() {
  const { data: session } = useSession();
  const [tanks, setTanks] = useState([]);
  const [existingEntries, setExistingEntries] = useState({});
  const [forms, setForms] = useState({});
  const [period, setPeriod] = useState('opening');
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState({});
  const [messages, setMessages] = useState({});

  useEffect(() => {
    if (session?.user?.stationId) fetchData();
  }, [session, date, period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [stationRes, stockRes] = await Promise.all([
        fetch(`/api/stations/${session.user.stationId}`),
        fetch(`/api/tank-stock?stationId=${session.user.stationId}&date=${date}`),
      ]);
      const stationData = await stationRes.json();
      const stockData = await stockRes.json();

      const activeTanks = (stationData.station?.tanks || []).filter((t) => t.isActive !== false);
      setTanks(activeTanks);

      // Index by "tankId-period"
      const map = {};
      for (const entry of (stockData.entries || [])) {
        map[`${entry.tankId}-${entry.period}`] = entry;
      }
      setExistingEntries(map);

      // Init form values
      const initialForms = {};
      for (const tank of activeTanks) {
        const key = `${tank._id}-${period}`;
        const existing = map[key];
        initialForms[tank._id] = {
          stockValue: existing ? String(existing.closingStockMeasured) : '',
          notes: existing?.notes || '',
        };
      }
      setForms(initialForms);
    } catch (err) {
      console.error('Error loading tank stock data:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateForm = (tankId, field, value) => {
    setForms((prev) => ({ ...prev, [tankId]: { ...prev[tankId], [field]: value } }));
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
          stationId: session.user.stationId,
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
        setMessages((prev) => ({ ...prev, [tank._id]: 'Saved successfully.' }));
        await fetchData();
      }
    } catch (err) {
      setMessages((prev) => ({ ...prev, [tank._id]: 'An error occurred.' }));
    } finally {
      setSubmitting((prev) => ({ ...prev, [tank._id]: false }));
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tank Stock</h1>
        <p className="text-sm text-slate-500 mt-1">
          Enter the measured stock level for each tank. Submit opening at the start of the day and closing at the end.
        </p>
      </div>

      <Card title="Entry Settings">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Date"
            type="date"
            name="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Select
            label="Period"
            name="period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            options={[
              { value: 'opening', label: 'Opening (Start of Day)' },
              { value: 'closing', label: 'Closing (End of Day)' },
            ]}
          />
        </div>
      </Card>

      {tanks.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
          No active tanks configured for this station. Ask the manager or admin to add tanks in Station Config.
        </div>
      )}

      {tanks.map((tank) => {
        const f = forms[tank._id] || {};
        const existingKey = `${tank._id}-${period}`;
        const existing = existingEntries[existingKey];
        const oppositeKey = `${tank._id}-${period === 'opening' ? 'closing' : 'opening'}`;
        const oppositeEntry = existingEntries[oppositeKey];

        return (
          <Card
            key={tank._id}
            title={`${tank.label || tank._id} — ${tank.product}`}
            subtitle={existing ? `${period === 'opening' ? 'Opening' : 'Closing'} already submitted` : `${period === 'opening' ? 'Opening' : 'Closing'} not yet submitted`}
          >
            {oppositeEntry && (
              <div className="mb-4 text-sm text-slate-500">
                {period === 'closing'
                  ? `Opening stock: ${Number(oppositeEntry.closingStockMeasured).toLocaleString()}L`
                  : `Closing stock: ${Number(oppositeEntry.closingStockMeasured).toLocaleString()}L`}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={`${period === 'opening' ? 'Opening' : 'Closing'} Stock (Litres)`}
                type="number"
                name={`stock-${tank._id}`}
                value={f.stockValue || ''}
                onChange={(e) => updateForm(tank._id, 'stockValue', e.target.value)}
                min="0"
                step="0.01"
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

            {existing && (
              <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                Last submitted: <span className="font-semibold">{Number(existing.closingStockMeasured).toLocaleString()}L</span>
                {existing.variance !== 0 && (
                  <span className={`ml-2 ${existing.variance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    (variance: {existing.variance > 0 ? '+' : ''}{existing.variance.toFixed(2)}L, {existing.variancePercent.toFixed(1)}%)
                  </span>
                )}
              </div>
            )}

            {messages[tank._id] && (
              <p className={`mt-2 text-sm ${messages[tank._id].startsWith('Saved') ? 'text-green-600' : 'text-red-600'}`}>
                {messages[tank._id]}
              </p>
            )}

            <div className="mt-4">
              <Button
                variant="primary"
                size="sm"
                onClick={() => submitEntry(tank)}
                disabled={submitting[tank._id] || !f.stockValue}
              >
                {submitting[tank._id] ? 'Saving...' : existing ? `Update ${period === 'opening' ? 'Opening' : 'Closing'}` : `Save ${period === 'opening' ? 'Opening' : 'Closing'}`}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
