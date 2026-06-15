'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Card from '@/components/Card';

function fmtN(n) {
  return `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusBadge(occurrences) {
  if (occurrences === 0) return 'bg-green-100 text-green-700';
  if (occurrences <= 2) return 'bg-amber-100 text-amber-700';
  return 'bg-orange-100 text-orange-700';
}

function statusLabel(occurrences) {
  if (occurrences === 0) return 'Clean';
  if (occurrences <= 2) return 'Watch';
  return 'At Risk';
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function AttendantsPageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const stationId =
    session?.user?.role === 'admin'
      ? searchParams.get('stationId')
      : session?.user?.stationId;

  // Registration form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Attendant list
  const [attendants, setAttendants] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  // Edit attendant modal
  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Performance
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(todayStr());
  const [perfRows, setPerfRows] = useState([]);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfError, setPerfError] = useState('');

  const fetchAttendants = useCallback(async () => {
    if (!stationId) return;
    setListLoading(true);
    try {
      const res = await fetch(`/api/attendants?stationId=${stationId}&includeInactive=${includeInactive}`);
      const data = await res.json();
      setAttendants(data.attendants || []);
    } catch {}
    finally { setListLoading(false); }
  }, [stationId, includeInactive]);

  const fetchPerf = useCallback(async () => {
    if (!stationId) return;
    setPerfLoading(true);
    setPerfError('');
    try {
      const res = await fetch(`/api/attendant-performance?stationId=${stationId}&from=${from}&to=${to}`);
      const data = await res.json();
      if (!res.ok) { setPerfError(data.error || 'Failed to load'); return; }
      setPerfRows(data.rows || []);
    } catch { setPerfError('Network error.'); }
    finally { setPerfLoading(false); }
  }, [stationId, from, to]);

  useEffect(() => { fetchAttendants(); }, [fetchAttendants]);
  useEffect(() => { fetchPerf(); }, [stationId]);

  async function handleRegister(e) {
    e.preventDefault();
    if (!name.trim()) { setFormError('Full name is required.'); return; }
    setSaving(true);
    setFormError('');
    setFormSuccess('');
    try {
      const res = await fetch('/api/attendants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), stationId }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Failed to register'); return; }
      setFormSuccess(`${data.attendant.name} registered as ${data.attendant.staffNumber}.`);
      setName('');
      setPhone('');
      fetchAttendants();
    } catch { setFormError('Network error.'); }
    finally { setSaving(false); }
  }

  function openEdit(a) {
    setEditTarget(a);
    setEditName(a.name);
    setEditPhone(a.phone || '');
    setEditError('');
  }

  async function handleEditSave() {
    if (!editName.trim()) { setEditError('Name is required.'); return; }
    setEditSaving(true);
    setEditError('');
    try {
      const res = await fetch(`/api/attendants/${editTarget._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), phone: editPhone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error || 'Failed to update'); return; }
      setEditTarget(null);
      fetchAttendants();
    } catch { setEditError('Network error.'); }
    finally { setEditSaving(false); }
  }

  async function toggleActive(a) {
    try {
      await fetch(`/api/attendants/${a._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !a.isActive }),
      });
      fetchAttendants();
    } catch {}
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-800">Pump Attendants</h1>

      {/* Registration form */}
      <Card title="Register New Attendant">
        <form onSubmit={handleRegister} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-amber-500">*</span></label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Chukwuemeka Obi"
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:border-ecana-maroon"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 08012345678"
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:border-ecana-maroon"
            />
          </div>
          {formError && <p className="text-sm text-amber-700">{formError}</p>}
          {formSuccess && <p className="text-sm text-green-700">{formSuccess}</p>}
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-ecana-maroon text-white text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Registering…' : 'Register Attendant'}
          </button>
        </form>
      </Card>

      {/* Attendant list */}
      <Card title="Registered Attendants">
        <div className="flex items-center gap-3 mb-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={e => setIncludeInactive(e.target.checked)}
              className="w-4 h-4 accent-ecana-maroon"
            />
            Show inactive
          </label>
          <button onClick={fetchAttendants} className="text-sm text-ecana-maroon hover:underline">Refresh</button>
        </div>

        {listLoading ? (
          <div className="flex justify-center py-8"><div className="spinner" /></div>
        ) : attendants.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No attendants registered yet.</p>
        ) : (
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">STF#</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Name</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Phone</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Registered</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {attendants.map(a => (
                  <tr key={a._id} className={a.isActive ? '' : 'opacity-50'}>
                    <td className="px-4 py-3 font-mono font-semibold text-ecana-maroon">{a.staffNumber}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <button
                        onClick={() => router.push(`/manager/attendants/${a._id}`)}
                        className="hover:text-ecana-maroon hover:underline text-left"
                      >
                        {a.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{a.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${a.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {a.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(a.dateRegistered).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button onClick={() => openEdit(a)} className="text-xs text-blue-600 hover:underline font-medium">Edit</button>
                        <button onClick={() => toggleActive(a)} className="text-xs text-amber-600 hover:underline font-medium">
                          {a.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => router.push(`/manager/attendants/${a._id}`)}
                          className="text-xs text-ecana-maroon hover:underline font-medium"
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Performance table */}
      <Card title="Attendant Performance">
        <div className="flex flex-wrap items-end gap-3 mb-4">
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

        {perfError && <p className="text-sm text-amber-700 mb-3">{perfError}</p>}

        {perfLoading ? (
          <div className="flex justify-center py-8"><div className="spinner" /></div>
        ) : perfRows.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No performance data for selected period.</p>
        ) : (
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">STF#</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Name</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Pumps</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Days</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Meter Sales</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Cash Coll.</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Shortage</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Overage</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Occ.</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {perfRows.map(row => (
                  <tr key={row.attendantId}
                    onClick={() => router.push(`/manager/attendants/${row.attendantId}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-ecana-maroon">{row.attendantStaffNumber}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.attendantName}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{row.pumps.join(', ') || '—'}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{row.daysWorked}</td>
                    <td className="px-4 py-3 text-gray-700">{fmtN(row.totalMeterSales)}</td>
                    <td className="px-4 py-3 text-gray-700">{fmtN(row.totalCashCollected)}</td>
                    <td className="px-4 py-3 font-medium text-amber-700">{row.totalShortage > 0 ? fmtN(row.totalShortage) : '—'}</td>
                    <td className="px-4 py-3 font-medium text-green-700">{row.totalOverage > 0 ? fmtN(row.totalOverage) : '—'}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{row.shortageOccurrences}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(row.shortageOccurrences)}`}>
                        {statusLabel(row.shortageOccurrences)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Edit modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setEditTarget(null)} />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Edit Attendant</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:border-ecana-maroon" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:border-ecana-maroon" />
              </div>
              {editError && <p className="text-sm text-amber-700">{editError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={handleEditSave} disabled={editSaving}
                  className="flex-1 py-2.5 bg-ecana-maroon text-white text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-50">
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
                <button onClick={() => setEditTarget(null)}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AttendantsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><div className="spinner" /></div>}>
      <AttendantsPageContent />
    </Suspense>
  );
}
