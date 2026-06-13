'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function fmtTime(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

// Single pump card showing current assignment + assign/reassign controls
function PumpCard({ pump, assignment, attendants, stationId, date, isToday, onSaved }) {
  const [mode, setMode] = useState('view'); // 'view' | 'assign' | 'reassign'
  const [selectedId, setSelectedId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const hasAssignment = !!assignment;

  async function handleAssign() {
    if (!selectedId) { setError('Select an attendant.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/attendant-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          date,
          dispenserId: pump.dispenserId,
          dispenserName: pump.dispenserName,
          fuelType: pump.fuelType,
          attendantId: selectedId,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed'); return; }
      setMode('view');
      setSelectedId('');
      onSaved();
    } catch { setError('Network error.'); }
    finally { setSaving(false); }
  }

  async function handleReassign() {
    if (!selectedId) { setError('Select the new attendant.'); return; }
    if (!reason.trim()) { setError('Reason is required for mid-day reassignment.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/pump-reassignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          date,
          dispenserId: pump.dispenserId,
          dispenserName: pump.dispenserName,
          fuelType: pump.fuelType,
          toAttendantId: selectedId,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed'); return; }
      setMode('view');
      setSelectedId('');
      setReason('');
      onSaved();
    } catch { setError('Network error.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div>
          <p className="font-semibold text-gray-900">{pump.dispenserName}</p>
          <p className="text-xs text-gray-500">{pump.fuelType}</p>
        </div>
        {hasAssignment && (
          <span className="text-xs text-green-600 font-medium bg-green-50 border border-green-200 px-2 py-1 rounded-lg">Assigned</span>
        )}
      </div>

      <div className="px-4 py-4 space-y-3">
        {hasAssignment && mode === 'view' && (
          <div className="bg-blue-50 rounded-xl p-3">
            <p className="text-xs text-blue-500 uppercase tracking-wide font-medium mb-1">Current Attendant</p>
            <p className="font-semibold text-gray-900">{assignment.attendantName}</p>
            <p className="text-xs text-gray-500 font-mono">{assignment.attendantStaffNumber}</p>
            <p className="text-xs text-gray-400 mt-1">Assigned at {fmtTime(assignment.assignedAt)} by {assignment.assignedByManagerName}</p>
          </div>
        )}

        {!hasAssignment && mode === 'view' && (
          <p className="text-sm text-gray-400">No attendant assigned.</p>
        )}

        {mode === 'assign' && (
          <div className="space-y-3">
            <select
              value={selectedId}
              onChange={e => { setSelectedId(e.target.value); setError(''); }}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:border-ecana-maroon"
            >
              <option value="">— Select attendant —</option>
              {attendants.map(a => (
                <option key={a._id} value={a._id}>{a.staffNumber} — {a.name}</option>
              ))}
            </select>
            {error && <p className="text-sm text-amber-700">{error}</p>}
            <div className="flex gap-2">
              <button onClick={handleAssign} disabled={saving}
                className="flex-1 py-2 text-sm font-medium bg-ecana-maroon text-white rounded-xl hover:opacity-90 disabled:opacity-50">
                {saving ? 'Saving…' : 'Assign'}
              </button>
              <button onClick={() => { setMode('view'); setError(''); }}
                className="flex-1 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </div>
        )}

        {mode === 'reassign' && (
          <div className="space-y-3">
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Mid-day reassignment — a reason is mandatory and will be logged permanently.
            </div>
            <select
              value={selectedId}
              onChange={e => { setSelectedId(e.target.value); setError(''); }}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:border-ecana-maroon"
            >
              <option value="">— Select new attendant —</option>
              {attendants.filter(a => a._id !== assignment?.attendantId?.toString()).map(a => (
                <option key={a._id} value={a._id}>{a.staffNumber} — {a.name}</option>
              ))}
            </select>
            <textarea
              value={reason}
              onChange={e => { setReason(e.target.value); setError(''); }}
              placeholder="Reason for reassignment (required)"
              rows={2}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:border-ecana-maroon resize-none"
            />
            {error && <p className="text-sm text-amber-700">{error}</p>}
            <div className="flex gap-2">
              <button onClick={handleReassign} disabled={saving}
                className="flex-1 py-2 text-sm font-medium bg-ecana-maroon text-white rounded-xl hover:opacity-90 disabled:opacity-50">
                {saving ? 'Saving…' : 'Confirm Reassign'}
              </button>
              <button onClick={() => { setMode('view'); setError(''); setReason(''); }}
                className="flex-1 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </div>
        )}

        {mode === 'view' && isToday && (
          <div className="flex gap-2 pt-1">
            {!hasAssignment && (
              <button onClick={() => { setMode('assign'); setError(''); }}
                className="flex-1 py-2 text-sm font-medium border-2 border-dashed border-ecana-maroon/40 text-ecana-maroon rounded-xl hover:bg-ecana-maroon/5 transition-colors">
                + Assign Attendant
              </button>
            )}
            {hasAssignment && (
              <button onClick={() => { setMode('reassign'); setError(''); }}
                className="flex-1 py-2 text-sm font-medium border border-amber-300 text-amber-700 rounded-xl hover:bg-amber-50 transition-colors">
                Mid-Day Reassign
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PumpAssignmentsPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const stationId =
    session?.user?.role === 'admin'
      ? searchParams.get('stationId')
      : session?.user?.stationId;

  const [date, setDate] = useState(todayStr());
  const [pumps, setPumps] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [attendants, setAttendants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reassignment log tab
  const [showLog, setShowLog] = useState(false);
  const [logEntries, setLogEntries] = useState([]);
  const [logLoading, setLogLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    setError('');
    try {
      const [stationRes, assignRes, attendantRes] = await Promise.all([
        fetch(`/api/stations/${stationId}`),
        fetch(`/api/attendant-assignments?stationId=${stationId}&date=${date}`),
        fetch(`/api/attendants?stationId=${stationId}`),
      ]);
      const [stData, asgData, attData] = await Promise.all([
        stationRes.json(), assignRes.json(), attendantRes.json(),
      ]);
      if (stationRes.ok) {
        const dispensers = stData.station?.dispensers || [];
        const activeDisp = dispensers.filter(d => d.isActive !== false);
        setPumps(activeDisp.map(d => ({
          dispenserId: d.dispenserId,
          dispenserName: d.dispenserName || d.dispenserId,
          fuelType: d.fuelType,
        })));
      }
      setAssignments(asgData.assignments || []);
      setAttendants(attData.attendants || []);
    } catch (err) {
      setError(err.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [stationId, date]);

  const fetchLog = useCallback(async () => {
    if (!stationId) return;
    setLogLoading(true);
    try {
      const res = await fetch(`/api/pump-reassignments?stationId=${stationId}&from=${date}&to=${date}`);
      const data = await res.json();
      setLogEntries(data.log || []);
    } catch {}
    finally { setLogLoading(false); }
  }, [stationId, date]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const isToday = date === todayStr();
  const assignmentByPump = {};
  for (const a of assignments) assignmentByPump[a.dispenserId] = a;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Pump Assignments</h1>
        <p className="text-gray-500 mt-1">Assign attendants to pumps at the start of each day.</p>
      </div>

      {/* Date selector + tabs */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Date</label>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={e => setDate(e.target.value)}
            className="text-sm border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:border-ecana-maroon"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setShowLog(false)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${!showLog ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Assignments
          </button>
          <button
            onClick={() => { setShowLog(true); fetchLog(); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${showLog ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Reassignment Log
          </button>
        </div>
      </div>

      {error && <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">{error}</div>}

      {!showLog && (
        <>
          {!isToday && (
            <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-xl text-sm">
              Viewing past date — assignments are read-only.
            </div>
          )}
          {loading ? (
            <div className="flex justify-center py-12"><div className="spinner" /></div>
          ) : pumps.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
              No active pumps configured. Ask admin to configure dispensers in Station Config.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pumps.map(pump => (
                <PumpCard
                  key={pump.dispenserId}
                  pump={pump}
                  assignment={assignmentByPump[pump.dispenserId] || null}
                  attendants={attendants}
                  stationId={stationId}
                  date={date}
                  isToday={isToday}
                  onSaved={fetchAll}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showLog && (
        <Card title="Reassignment Log">
          {logLoading ? (
            <div className="flex justify-center py-8"><div className="spinner" /></div>
          ) : logEntries.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No reassignments recorded for this date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Time</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Pump</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">From</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">To</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Reason</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logEntries.map((e, i) => (
                    <tr key={e._id || i}>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtTime(e.reassignedAt)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{e.dispenserName}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <span className="font-mono text-xs text-gray-400">{e.fromAttendantStaffNumber}</span> {e.fromAttendantName || '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <span className="font-mono text-xs text-gray-400">{e.toAttendantStaffNumber}</span> {e.toAttendantName}
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs">{e.reason}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{e.reassignedByManagerName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export default function PumpAssignmentsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><div className="spinner" /></div>}>
      <PumpAssignmentsPageContent />
    </Suspense>
  );
}
