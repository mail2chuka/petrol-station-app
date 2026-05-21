'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

function today() {
  return new Date().toISOString().split('T')[0];
}

export default function MeterReadingsPage() {
  const { data: session } = useSession();
  const [openPumps, setOpenPumps] = useState([]);
  const [existingReadings, setExistingReadings] = useState({});
  const [previousClosings, setPreviousClosings] = useState({});
  const [forms, setForms] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState({});
  const [messages, setMessages] = useState({});
  const [date, setDate] = useState(today());

  useEffect(() => {
    if (session?.user?.stationId) fetchData();
  }, [session, date]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [openingsRes, readingsRes] = await Promise.all([
        fetch(`/api/pump-openings?stationId=${session.user.stationId}&date=${date}`),
        fetch(`/api/meter-readings?stationId=${session.user.stationId}&date=${date}`),
      ]);
      const openingsData = await openingsRes.json();
      const readingsData = await readingsRes.json();

      const pumps = (openingsData.openings || [])[0]?.pumps || [];
      setOpenPumps(pumps);

      // Index existing readings by pumpId
      const readingsMap = {};
      for (const r of (readingsData.readings || [])) {
        readingsMap[r.pumpId] = r;
      }
      setExistingReadings(readingsMap);

      // Fetch previous day's closing for each pump to pre-fill opening
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];
      const prevRes = await fetch(
        `/api/meter-readings?stationId=${session.user.stationId}&date=${prevDateStr}`
      );
      const prevData = await prevRes.json();
      const prevMap = {};
      for (const r of (prevData.readings || [])) {
        prevMap[r.pumpId] = r.closing;
      }
      setPreviousClosings(prevMap);

      // Initialise form state for each pump
      const initialForms = {};
      for (const pump of pumps) {
        const existing = readingsMap[pump._id];
        const prevClosing = prevMap[pump._id];
        initialForms[pump._id] = {
          opening: existing ? String(existing.opening) : (prevClosing != null ? String(prevClosing) : ''),
          closing: existing ? String(existing.closing) : '',
          rtt: existing ? String(existing.rtt) : '0',
          discrepancyComment: existing?.discrepancyComment || '',
        };
      }
      setForms(initialForms);
    } catch (err) {
      console.error('Error loading meter readings data:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateForm = (pumpId, field, value) => {
    setForms((prev) => ({ ...prev, [pumpId]: { ...prev[pumpId], [field]: value } }));
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
          stationId: session.user.stationId,
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
        setMessages((prev) => ({ ...prev, [pump._id]: 'Saved successfully.' }));
        // Refresh to pick up server-computed discrepancy flag
        await fetchData();
      }
    } catch (err) {
      setMessages((prev) => ({ ...prev, [pump._id]: 'An error occurred.' }));
    } finally {
      setSubmitting((prev) => ({ ...prev, [pump._id]: false }));
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Meter Readings</h1>
        <p className="text-sm text-slate-500 mt-1">Enter opening, closing, and return-to-tank (RTT) readings for each pump.</p>
      </div>

      <Card title="Select Date">
        <Input
          label="Date"
          type="date"
          name="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Card>

      {openPumps.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
          No pumps are open for this date. The manager must open pumps before readings can be entered.
        </div>
      )}

      {openPumps.map((pump) => {
        const f = forms[pump._id] || {};
        const existing = existingReadings[pump._id];
        const prevClosing = previousClosings[pump._id];
        const openingVal = parseFloat(f.opening);
        const hasDiscrepancy = prevClosing != null && !isNaN(openingVal) && openingVal !== prevClosing;
        const liters = (parseFloat(f.closing) || 0) - (parseFloat(f.opening) || 0) - (parseFloat(f.rtt) || 0);

        return (
          <Card
            key={pump._id}
            title={pump.pumpLabel || pump._id}
            subtitle={existing ? `Last saved: ${new Date(existing.updatedAt || existing.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}` : 'Not yet submitted'}
          >
            {prevClosing != null && (
              <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
                <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                Previous day closing: <span className="font-semibold text-slate-700">{prevClosing}</span>
                {hasDiscrepancy && (
                  <span className="ml-2 text-amber-700 font-medium">⚠ Opening differs from previous closing</span>
                )}
              </div>
            )}

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

            {!isNaN(liters) && f.closing && (
              <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                Net liters sold: <span className="font-bold text-slate-900">{liters.toFixed(2)}L</span>
              </div>
            )}

            {hasDiscrepancy && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-amber-700 mb-1.5">
                  Discrepancy Comment <span className="text-red-500">*</span>
                  <span className="ml-1 font-normal text-amber-600">(required — opening differs from previous closing)</span>
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
              <p className={`mt-2 text-sm ${messages[pump._id].includes('success') || messages[pump._id].startsWith('Saved') ? 'text-green-600' : 'text-red-600'}`}>
                {messages[pump._id]}
              </p>
            )}

            <div className="mt-4">
              <Button
                variant="primary"
                size="sm"
                onClick={() => submitReading(pump)}
                disabled={submitting[pump._id] || !f.closing}
              >
                {submitting[pump._id] ? 'Saving...' : existing ? 'Update Reading' : 'Save Reading'}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
