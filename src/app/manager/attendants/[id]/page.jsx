'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';

function fmtN(n) {
  return `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function ratingBadge(rate) {
  if (rate === 0) return { label: 'Excellent', cls: 'bg-green-100 text-green-800' };
  if (rate < 0.2) return { label: 'Good', cls: 'bg-blue-100 text-blue-800' };
  if (rate < 0.5) return { label: 'Needs Improvement', cls: 'bg-amber-100 text-amber-800' };
  return { label: 'At Risk', cls: 'bg-orange-100 text-orange-800' };
}

export default function AttendantDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const stationId = session?.user?.stationId;

  const [attendant, setAttendant] = useState(null);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayStr());
  const [perfRows, setPerfRows] = useState([]);
  const [byDay, setByDay] = useState([]);
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [loading, setLoading] = useState(true);
  const [perfLoading, setPerfLoading] = useState(false);

  const fetchAttendant = useCallback(async () => {
    if (!id) return;
    try {
      // List all and find by id (no single GET route; use list with includeInactive)
      const res = await fetch(`/api/attendants?stationId=${stationId}&includeInactive=true`);
      const data = await res.json();
      const found = (data.attendants || []).find(a => a._id === id);
      setAttendant(found || null);
    } catch {}
    finally { setLoading(false); }
  }, [id, stationId]);

  const fetchPerf = useCallback(async () => {
    if (!id || !stationId) return;
    setPerfLoading(true);
    try {
      const res = await fetch(`/api/attendant-performance?stationId=${stationId}&from=${from}&to=${to}&attendantId=${id}`);
      const data = await res.json();
      setPerfRows(data.rows || []);
      setByDay((data.byDay || []).filter(r => r.attendantId === id));
    } catch {}
    finally { setPerfLoading(false); }
  }, [id, stationId, from, to]);

  const fetchNotes = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/attendant-notes?attendantId=${id}`);
      const data = await res.json();
      setNotes(data.notes || []);
    } catch {}
  }, [id]);

  useEffect(() => {
    if (stationId) { fetchAttendant(); fetchNotes(); }
  }, [fetchAttendant, fetchNotes]);

  useEffect(() => {
    if (stationId) fetchPerf();
  }, [stationId]);

  async function addNote() {
    if (!noteText.trim()) { setNoteError('Note cannot be empty.'); return; }
    setAddingNote(true);
    setNoteError('');
    try {
      const res = await fetch('/api/attendant-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendantId: id, note: noteText.trim(), stationId }),
      });
      const data = await res.json();
      if (!res.ok) { setNoteError(data.error || 'Failed'); return; }
      setNoteText('');
      fetchNotes();
    } catch { setNoteError('Network error.'); }
    finally { setAddingNote(false); }
  }

  if (loading) return <div className="flex justify-center py-16"><div className="spinner" /></div>;
  if (!attendant) return <p className="text-gray-500 py-8 text-center">Attendant not found.</p>;

  const agg = perfRows[0] || {};
  const shortageRate = agg.daysWorked > 0 ? (agg.shortageOccurrences || 0) / agg.daysWorked : 0;
  const rating = ratingBadge(shortageRate);

  // Longest clean streak (no shortage)
  const sortedDays = [...byDay].sort((a, b) => a.date.localeCompare(b.date));
  let longestStreak = 0, currentStreak = 0;
  for (const d of sortedDays) {
    if (d.shortage === 0) { currentStreak++; longestStreak = Math.max(longestStreak, currentStreak); }
    else currentStreak = 0;
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <button onClick={() => router.push('/manager/attendants')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-ecana-maroon font-medium">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Attendants
      </button>

      {/* Profile header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-wrap items-center gap-6">
        <div className="w-16 h-16 rounded-full bg-ecana-maroon/10 flex items-center justify-center text-2xl font-bold text-ecana-maroon">
          {attendant.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{attendant.name}</h1>
            <span className="font-mono text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{attendant.staffNumber}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${attendant.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {attendant.isActive ? 'Active' : 'Inactive'}
            </span>
            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${rating.cls}`}>{rating.label}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
            {attendant.phone && <span>📞 {attendant.phone}</span>}
            <span>Registered {new Date(attendant.dateRegistered).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">From</label>
          <input type="date" value={from} max={to}
            onChange={e => setFrom(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-ecana-maroon" />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">To</label>
          <input type="date" value={to} min={from} max={todayStr()}
            onChange={e => setTo(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-ecana-maroon" />
        </div>
        <button onClick={fetchPerf} disabled={perfLoading}
          className="px-4 py-1.5 text-sm bg-ecana-maroon text-white rounded-lg hover:opacity-90 disabled:opacity-50">
          {perfLoading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {/* Scorecard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Days Worked', value: agg.daysWorked ?? '—' },
          { label: 'Total Meter Sales', value: agg.daysWorked ? fmtN(agg.totalMeterSales) : '—' },
          { label: 'Total Cash Collected', value: agg.daysWorked ? fmtN(agg.totalCashCollected) : '—' },
          { label: 'Total Shortage', value: agg.daysWorked ? fmtN(agg.totalShortage) : '—', amber: true },
          { label: 'Total Overage', value: agg.daysWorked ? fmtN(agg.totalOverage) : '—', green: true },
          { label: 'Shortage Occurrences', value: agg.shortageOccurrences ?? '—', amber: (agg.shortageOccurrences || 0) > 0 },
          { label: 'Shortage Rate', value: agg.daysWorked ? `${(shortageRate * 100).toFixed(1)}%` : '—' },
          { label: 'Longest Clean Streak', value: longestStreak > 0 ? `${longestStreak} days` : '—' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.amber ? 'text-amber-700' : s.green ? 'text-green-700' : 'text-gray-900'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Day-by-day history */}
      <Card title="Day-by-Day History">
        {perfLoading ? (
          <div className="flex justify-center py-8"><div className="spinner" /></div>
        ) : byDay.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No records for selected period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Pump(s)</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Meter Sales</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Cash Collected</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Shortage</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Overage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {byDay.map((day, i) => (
                  <tr key={i} className={day.shortage > 0 ? 'bg-amber-50' : ''}>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{fmtDate(day.date)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{day.pumps.join(', ') || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{fmtN(day.meterSales)}</td>
                    <td className="px-4 py-3 text-gray-700">{fmtN(day.cashCollected)}</td>
                    <td className={`px-4 py-3 font-medium ${day.shortage > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                      {day.shortage > 0 ? fmtN(day.shortage) : '—'}
                    </td>
                    <td className={`px-4 py-3 font-medium ${day.overage > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                      {day.overage > 0 ? fmtN(day.overage) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Manager notes */}
      <Card title="Manager Notes">
        <div className="space-y-4">
          <div className="space-y-2">
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Add a note about this attendant…"
              rows={3}
              className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:border-ecana-maroon resize-none"
            />
            {noteError && <p className="text-sm text-amber-700">{noteError}</p>}
            <button
              onClick={addNote}
              disabled={addingNote}
              className="px-5 py-2 text-sm font-medium bg-ecana-maroon text-white rounded-xl hover:opacity-90 disabled:opacity-50"
            >
              {addingNote ? 'Adding…' : 'Add Note'}
            </button>
          </div>

          {notes.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">No notes yet.</p>
          ) : (
            <div className="space-y-3">
              {notes.map((n, i) => (
                <div key={n._id || i} className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-800">{n.note}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {n.addedByName} · {new Date(n.addedAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
