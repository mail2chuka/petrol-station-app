'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Loading from '@/components/Loading';
import PasswordResetModal from '@/components/PasswordResetModal';

// ── Constants ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'staff', label: 'Staff & HR' },
  { id: 'config', label: 'Configuration' },
  { id: 'operations', label: 'Operations' },
];

const STAFF_ROLE_OPTIONS = [
  { value: 'manager', label: 'Manager' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'daily_auditor', label: 'Daily Auditor' },
  { value: 'external_auditor', label: 'External Auditor' },
];

const ROLE_GROUPS = [
  { key: 'manager', label: 'Managers' },
  { key: 'supervisor', label: 'Supervisors' },
  { key: 'cashier', label: 'Cashiers' },
  { key: 'daily_auditor', label: 'Daily Auditors' },
  { key: 'external_auditor', label: 'External Auditors' },
];

const GENDER_OPTIONS = [
  { value: '', label: '—' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const EMP_TYPE_OPTIONS = [
  { value: '', label: '—' },
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
];

const ALL_FUEL_TYPES = ['PMS', 'AGO', 'DPK', 'LPG'];

function fmt(n) {
  return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}
function dateInput(d) {
  if (!d) return '';
  return new Date(d).toISOString().split('T')[0];
}
function empTypeLabel(v) {
  return EMP_TYPE_OPTIONS.find((o) => o.value === v)?.label || '—';
}

// ── Small UI helpers ─────────────────────────────────────────────────────────
function Stat({ label, value, sub }) {
  return (
    <div className="card-modern p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Banner({ error, success }) {
  if (!error && !success) return null;
  return (
    <>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl text-sm">{success}</div>}
    </>
  );
}

// ── Drawer shell ─────────────────────────────────────────────────────────────
function Drawer({ title, subtitle, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[520px] bg-white shadow-xl overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
              <p className="text-lg font-bold text-gray-900">{title}</p>
            </div>
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
          {children}
          {footer && <div className="mt-5">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export default function StationConsolePage() {
  const { id } = useParams();
  const router = useRouter();

  const [station, setStation] = useState(null);
  const [users, setUsers] = useState([]);
  const [attendants, setAttendants] = useState([]);
  const [stations, setStations] = useState([]); // for reassign targets
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    try {
      const [stRes, staffRes, allRes] = await Promise.all([
        fetch(`/api/stations/${id}`),
        fetch(`/api/stations/${id}/staff`),
        fetch('/api/stations?includeInactive=true'),
      ]);
      const stData = await stRes.json();
      const staffData = await staffRes.json();
      const allData = await allRes.json();
      if (!stRes.ok) { setError(stData.error || 'Failed to load station'); return; }
      setStation(stData.station);
      setUsers(staffData.users || []);
      setAttendants(staffData.attendants || []);
      setStations(allData.stations || []);
    } catch {
      setError('Failed to load station data.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const flash = (msg) => { setSuccess(msg); setError(''); setTimeout(() => setSuccess(''), 4000); };

  if (loading) return <Loading />;
  if (!station) return (
    <div className="space-y-4">
      <Banner error={error} />
      <Link href="/admin/stations" className="text-sm text-ecana-maroon hover:underline">← Back to stations</Link>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Link href="/admin/stations" className="text-xs text-gray-500 hover:text-ecana-maroon">← All stations</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">
            {station.name}
            <span className="ml-2 text-sm font-normal text-gray-500">{station.code}</span>
            {station.isActive === false && <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full align-middle">Inactive</span>}
          </h1>
          <p className="text-sm text-gray-500">{station.location}</p>
        </div>
        <div className="flex gap-2 self-start">
          <Link
            href="/admin"
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:border-ecana-maroon hover:text-ecana-maroon transition-colors"
          >
            ← Admin Dashboard
          </Link>
          <Link
            href={`/manager?stationId=${station._id}`}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:border-ecana-maroon hover:text-ecana-maroon transition-colors"
          >
            Open operational view →
          </Link>
          <Link
            href={`/admin/reports?stationId=${station._id}`}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:border-ecana-maroon hover:text-ecana-maroon transition-colors"
          >
            View Report →
          </Link>
        </div>
      </div>

      <Banner error={error} success={success} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t.id ? 'border-ecana-maroon text-ecana-maroon' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.id === 'staff' && <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 rounded-full px-1.5">{users.length + attendants.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab station={station} users={users} attendants={attendants} />}
      {tab === 'staff' && (
        <StaffTab
          station={station}
          users={users}
          attendants={attendants}
          stations={stations}
          onChanged={(msg) => { load(); if (msg) flash(msg); }}
          onError={setError}
        />
      )}
      {tab === 'config' && (
        <ConfigTab station={station} onChanged={(msg) => { load(); if (msg) flash(msg); }} onError={setError} />
      )}
      {tab === 'operations' && <OperationsTab station={station} />}
    </div>
  );
}

// ── OVERVIEW ─────────────────────────────────────────────────────────────────
function OverviewTab({ station, users, attendants }) {
  const products = station.availableProducts || [];
  const activeUsers = users.filter((u) => u.isActive !== false).length;
  const activeAttendants = attendants.filter((a) => a.isActive !== false).length;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Login Staff" value={users.length} sub={`${activeUsers} active`} />
        <Stat label="Attendants" value={attendants.length} sub={`${activeAttendants} active`} />
        <Stat label="Tanks" value={Number.isFinite(station.numberOfTanks) ? station.numberOfTanks : (station.tanks?.length || 0)} />
        <Stat label="Pumps" value={Number.isFinite(station.numberOfPumps) ? station.numberOfPumps : (station.dispensers?.length || 0)} />
      </div>

      <Card title="Station Details">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Row k="Name" v={station.name} />
          <Row k="Code" v={station.code} />
          <Row k="Location" v={station.location} />
          <Row k="Status" v={station.isActive === false ? 'Inactive' : 'Active'} />
          <Row k="Products" v={products.join(', ') || '—'} />
          <Row k="Tolerance" v={`${station.tolerancePercent ?? 0}% of sales`} />
        </dl>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Current Prices (₦/L)">
          <div className="space-y-2 text-sm">
            {products.length === 0 ? <p className="text-gray-400">No products configured.</p> :
              products.map((p) => (
                <div key={p} className="flex justify-between"><span className="text-gray-600">{p}</span><span className="font-semibold">₦{fmt(station.currentPrices?.[p])}</span></div>
              ))}
          </div>
        </Card>
        <Card title="Current Stock (L)">
          <div className="space-y-2 text-sm">
            {products.length === 0 ? <p className="text-gray-400">No products configured.</p> :
              products.map((p) => (
                <div key={p} className="flex justify-between"><span className="text-gray-600">{p}</span><span className="font-semibold">{fmt(station.currentStock?.[p])} L</span></div>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
function Row({ k, v }) {
  return (
    <div className="flex justify-between border-b border-gray-50 py-1">
      <dt className="text-gray-500">{k}</dt>
      <dd className="font-medium text-gray-900 text-right">{v || '—'}</dd>
    </div>
  );
}

// ── STAFF & HR ───────────────────────────────────────────────────────────────
function StaffTab({ station, users, attendants, stations, onChanged, onError }) {
  const [editingUser, setEditingUser] = useState(null);   // user object or { _new: true }
  const [editingAttendant, setEditingAttendant] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetting, setResetting] = useState(false);

  const usersByRole = (role) => users.filter((u) => u.role === role);

  const toggleUserActive = async (u) => {
    const next = !(u.isActive !== false);
    if (!window.confirm(`${next ? 'Activate' : 'Deactivate'} ${u.name}?`)) return;
    const res = await fetch(`/api/users/${u._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { onError(data.error || 'Failed to update user'); return; }
    onChanged(`${u.name} ${next ? 'activated' : 'deactivated'}.`);
  };

  const toggleAttendantActive = async (a) => {
    const next = !(a.isActive !== false);
    if (!window.confirm(`${next ? 'Activate' : 'Deactivate'} ${a.name}?`)) return;
    const res = await fetch(`/api/attendants/${a._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { onError(data.error || 'Failed to update attendant'); return; }
    onChanged(`${a.name} ${next ? 'activated' : 'deactivated'}.`);
  };

  const resetPassword = async (newPassword) => {
    if (!resetTarget?._id) return;
    setResetting(true);
    try {
      const res = await fetch(`/api/users/${resetTarget._id}/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { onError(data.error || 'Failed to reset password'); return; }
      onChanged(`Password reset for ${resetTarget.name}.`);
      setResetTarget(null);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setEditingUser({ _new: true })}>+ Add Login Staff</Button>
        <Button variant="secondary" onClick={() => setEditingAttendant({ _new: true })}>+ Add Attendant</Button>
      </div>

      {ROLE_GROUPS.map((g) => {
        const list = usersByRole(g.key);
        if (list.length === 0) return null;
        return (
          <Card key={g.key} title={`${g.label} (${list.length})`}>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-400 text-xs uppercase tracking-wide">
                  <th className="pb-2 pr-4">Name</th><th className="pb-2 pr-4">Contact</th><th className="pb-2 pr-4">Position</th>
                  <th className="pb-2 pr-4">Days on shift</th><th className="pb-2 pr-4">Status</th><th className="pb-2">Actions</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {list.map((u) => (
                    <tr key={u._id}>
                      <td className="py-2.5 pr-4">
                        <button className="font-semibold text-gray-900 hover:text-ecana-maroon" onClick={() => setEditingUser(u)}>{u.name}</button>
                        <p className="text-xs text-gray-400">{u.email}{u.loginId ? ` · ${u.loginId}` : ''}</p>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-600">{u.phone || '—'}</td>
                      <td className="py-2.5 pr-4 text-gray-600">{u.position || '—'}</td>
                      <td className="py-2.5 pr-4 font-medium text-gray-800">{u.daysOnShift ?? 0}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs ${u.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {u.isActive !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => setEditingUser(u)}>Edit</Button>
                          <Button size="sm" variant="secondary" onClick={() => setResetTarget(u)}>Reset PW</Button>
                          <Button size="sm" variant={u.isActive !== false ? 'danger' : 'success'} onClick={() => toggleUserActive(u)}>
                            {u.isActive !== false ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}

      {users.length === 0 && (
        <Card><p className="text-sm text-gray-400 text-center py-4">No login staff assigned to this station yet.</p></Card>
      )}

      <Card title={`Attendants (${attendants.length})`}>
        {attendants.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No attendants registered.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 text-xs uppercase tracking-wide">
                <th className="pb-2 pr-4">Staff No.</th><th className="pb-2 pr-4">Name</th><th className="pb-2 pr-4">Phone</th>
                <th className="pb-2 pr-4">Position</th><th className="pb-2 pr-4">Days on shift</th><th className="pb-2 pr-4">Status</th><th className="pb-2">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {attendants.map((a) => (
                  <tr key={a._id}>
                    <td className="py-2.5 pr-4 font-mono text-xs text-gray-500">{a.staffNumber}</td>
                    <td className="py-2.5 pr-4">
                      <button className="font-semibold text-gray-900 hover:text-ecana-maroon" onClick={() => setEditingAttendant(a)}>{a.name}</button>
                    </td>
                    <td className="py-2.5 pr-4 text-gray-600">{a.phone || '—'}</td>
                    <td className="py-2.5 pr-4 text-gray-600">{a.position || '—'}</td>
                    <td className="py-2.5 pr-4 font-medium text-gray-800">{a.daysOnShift ?? 0}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${a.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {a.isActive !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setEditingAttendant(a)}>Edit</Button>
                        <Button size="sm" variant={a.isActive !== false ? 'danger' : 'success'} onClick={() => toggleAttendantActive(a)}>
                          {a.isActive !== false ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editingUser && (
        <UserDrawer
          user={editingUser._new ? null : editingUser}
          station={station}
          stations={stations}
          onClose={() => setEditingUser(null)}
          onSaved={(msg) => { setEditingUser(null); onChanged(msg); }}
          onError={onError}
        />
      )}
      {editingAttendant && (
        <AttendantDrawer
          attendant={editingAttendant._new ? null : editingAttendant}
          station={station}
          onClose={() => setEditingAttendant(null)}
          onSaved={(msg) => { setEditingAttendant(null); onChanged(msg); }}
          onError={onError}
        />
      )}
      <PasswordResetModal
        isOpen={Boolean(resetTarget)}
        targetName={resetTarget?.name}
        onClose={() => setResetTarget(null)}
        onSubmit={resetPassword}
        isLoading={resetting}
      />
    </div>
  );
}

// HR field group reused by both drawers
function HrFields({ form, set }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="080..." />
        <Input label="Position / Title" value={form.position} onChange={(e) => set('position', e.target.value)} placeholder="e.g. Senior Supervisor" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Employment Date" type="date" value={form.employmentDate} onChange={(e) => set('employmentDate', e.target.value)} />
        <Select label="Employment Type" value={form.employmentType} onChange={(e) => set('employmentType', e.target.value)} options={EMP_TYPE_OPTIONS} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Date of Birth" type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
        <Select label="Gender" value={form.gender} onChange={(e) => set('gender', e.target.value)} options={GENDER_OPTIONS} />
      </div>
      <Input label="Address" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Residential address" />
      <Input label="Photo URL (optional)" value={form.photoUrl} onChange={(e) => set('photoUrl', e.target.value)} placeholder="https://..." />
    </>
  );
}

function UserDrawer({ user, station, stations, onClose, onSaved, onError }) {
  const isNew = !user;
  const [form, setForm] = useState({
    name: user?.name || '', email: user?.email || '', role: user?.role || 'supervisor',
    loginId: '', password: '', isActive: user?.isActive !== false,
    stationId: user?.stationId || station._id,
    phone: user?.phone || '', position: user?.position || '', employeeId: user?.employeeId || '',
    employmentDate: dateInput(user?.employmentDate), employmentType: user?.employmentType || '',
    dateOfBirth: dateInput(user?.dateOfBirth), gender: user?.gender || '', address: user?.address || '',
    photoUrl: user?.photoUrl || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const hr = {
        phone: form.phone, position: form.position, employeeId: form.employeeId,
        employmentDate: form.employmentDate, employmentType: form.employmentType,
        dateOfBirth: form.dateOfBirth, gender: form.gender, address: form.address, photoUrl: form.photoUrl,
      };
      let res;
      if (isNew) {
        res = await fetch('/api/users', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name, email: form.email, role: form.role,
            loginId: form.loginId || undefined, password: form.password,
            stationId: form.role === 'admin' ? undefined : form.stationId, ...hr,
          }),
        });
      } else {
        res = await fetch(`/api/users/${user._id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name, email: form.email, role: form.role,
            stationId: form.role === 'admin' ? null : form.stationId, isActive: form.isActive, ...hr,
          }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { onError(data.error || 'Failed to save staff member'); return; }
      onSaved(isNew ? 'Staff member created.' : 'Staff member updated.');
    } finally {
      setSaving(false);
    }
  };

  const stationOptions = stations.map((s) => ({ value: s._id, label: `${s.name} (${s.code})` }));

  return (
    <Drawer
      title={isNew ? 'Add Login Staff' : form.name}
      subtitle={isNew ? `Station: ${station.name}` : 'Edit staff profile'}
      onClose={onClose}
      footer={<Button variant="primary" size="lg" fullWidth disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</Button>}
    >
      <div className="space-y-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Account</p>
        <Input label="Full Name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        <Input label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
        <Select label="Role" value={form.role} onChange={(e) => set('role', e.target.value)} options={STAFF_ROLE_OPTIONS} required />
        {isNew && <Input label="Login ID (optional)" value={form.loginId} onChange={(e) => set('loginId', e.target.value)} helpText="≥3 chars, letters/numbers/._- , no spaces. Blank = auto." />}
        {isNew && <Input label="Password" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} helpText="Min 6 characters." required />}
        {!isNew && (
          <Select label="Assigned Station (reassign)" value={form.stationId} onChange={(e) => set('stationId', e.target.value)} options={stationOptions} />
        )}
        {!isNew && (
          <Select label="Account Status" value={form.isActive ? 'active' : 'inactive'} onChange={(e) => set('isActive', e.target.value === 'active')}
            options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        )}

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 mt-4">HR Profile</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="080..." />
          <Input label="Employee ID" value={form.employeeId} onChange={(e) => set('employeeId', e.target.value)} placeholder="EMP-001" />
        </div>
        <HrFields form={form} set={set} />
        {!isNew && (
          <p className="text-xs text-gray-400 mt-2">Days on shift: <span className="font-semibold text-gray-600">{user.daysOnShift ?? 0}</span></p>
        )}
      </div>
    </Drawer>
  );
}

function AttendantDrawer({ attendant, station, onClose, onSaved, onError }) {
  const isNew = !attendant;
  const [form, setForm] = useState({
    name: attendant?.name || '', isActive: attendant?.isActive !== false,
    phone: attendant?.phone || '', position: attendant?.position || '',
    employmentDate: dateInput(attendant?.employmentDate), employmentType: attendant?.employmentType || '',
    dateOfBirth: dateInput(attendant?.dateOfBirth), gender: attendant?.gender || '', address: attendant?.address || '',
    photoUrl: attendant?.photoUrl || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { onError('Attendant name is required.'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name, phone: form.phone, position: form.position,
        employmentDate: form.employmentDate, employmentType: form.employmentType,
        dateOfBirth: form.dateOfBirth, gender: form.gender, address: form.address, photoUrl: form.photoUrl,
      };
      let res;
      if (isNew) {
        res = await fetch('/api/attendants', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, stationId: station._id }),
        });
      } else {
        res = await fetch(`/api/attendants/${attendant._id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, isActive: form.isActive }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { onError(data.error || 'Failed to save attendant'); return; }
      onSaved(isNew ? 'Attendant created.' : 'Attendant updated.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title={isNew ? 'Add Attendant' : form.name}
      subtitle={isNew ? `Station: ${station.name}` : `${attendant.staffNumber} · edit profile`}
      onClose={onClose}
      footer={<Button variant="primary" size="lg" fullWidth disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</Button>}
    >
      <div className="space-y-1">
        <Input label="Full Name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        {!isNew && (
          <Select label="Status" value={form.isActive ? 'active' : 'inactive'} onChange={(e) => set('isActive', e.target.value === 'active')}
            options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        )}
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 mt-4">HR Profile</p>
        <HrFields form={form} set={set} />
        {!isNew && (
          <p className="text-xs text-gray-400 mt-2">Days on shift: <span className="font-semibold text-gray-600">{attendant.daysOnShift ?? 0}</span></p>
        )}
      </div>
    </Drawer>
  );
}

// ── CONFIGURATION ────────────────────────────────────────────────────────────
function ConfigTab({ station, onChanged, onError }) {
  return (
    <div className="space-y-6">
      <PricesSection station={station} onChanged={onChanged} onError={onError} />
      <ProductsSection station={station} onChanged={onChanged} onError={onError} />
      <DetailsSection station={station} onChanged={onChanged} onError={onError} />
      <MappingSection station={station} onChanged={onChanged} onError={onError} />
      <SeedSection station={station} onChanged={onChanged} onError={onError} />
      <DangerSection station={station} onChanged={onChanged} onError={onError} />
    </div>
  );
}

function DangerSection({ station, onChanged, onError }) {
  const router = useRouter();
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const isActive = station.isActive !== false;

  const toggleActive = async () => {
    const endpoint = isActive ? 'deactivate' : 'reactivate';
    if (!window.confirm(`${isActive ? 'Deactivate' : 'Reactivate'} station "${station.name}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/stations/${station._id}/${endpoint}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { onError(d.error || 'Failed to update station status'); return; }
      onChanged(`Station ${isActive ? 'deactivated' : 'reactivated'}.`);
    } finally { setBusy(false); }
  };

  const hardDelete = async () => {
    if (!pwd) { onError('Admin password required to delete.'); return; }
    if (!window.confirm(`Permanently delete "${station.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/stations/${station._id}/hard-delete`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminPassword: pwd }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { onError(d.error || 'Failed to delete station'); return; }
      router.push('/admin/stations');
    } finally { setBusy(false); }
  };

  return (
    <Card title="Danger Zone">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-800">{isActive ? 'Deactivate station' : 'Reactivate station'}</p>
            <p className="text-xs text-gray-500">{isActive ? 'Hides it from normal operational views.' : 'Restores it to active use.'}</p>
          </div>
          <Button variant={isActive ? 'danger' : 'success'} disabled={busy} onClick={toggleActive}>{isActive ? 'Deactivate' : 'Reactivate'}</Button>
        </div>
        <div className="border-t border-red-100 pt-4">
          <p className="text-sm font-medium text-red-700">Permanently delete station</p>
          <p className="text-xs text-gray-500 mb-2">Irreversible. Requires your admin password.</p>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <Input label="Admin password" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className="flex-1" />
            <Button variant="danger" disabled={busy} onClick={hardDelete}>Delete permanently</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function PricesSection({ station, onChanged, onError }) {
  const products = station.availableProducts || ['PMS', 'AGO'];
  const [prices, setPrices] = useState(() => {
    const p = {}; for (const f of products) p[f] = station.currentPrices?.[f] ?? ''; return p;
  });
  const [tolerance, setTolerance] = useState(station.tolerancePercent ?? 2.5);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    for (const p of products) {
      const v = Number(prices[p]);
      if (!Number.isFinite(v) || v <= 0) { onError(`Enter a valid price for ${p}.`); return; }
    }
    const tol = Number(tolerance);
    if (!Number.isFinite(tol) || tol < 0) { onError('Enter a valid tolerance %.'); return; }
    setSaving(true);
    try {
      const updates = products
        .filter((p) => Number(prices[p]) !== (station.currentPrices?.[p] || 0))
        .map((p) => fetch(`/api/stations/${station._id}/prices`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stationId: station._id, fuelType: p, price: Number(prices[p]), reason: reason || 'Price update' }),
        }));
      await fetch(`/api/stations/${station._id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tolerancePercent: tol }),
      });
      const results = await Promise.all(updates);
      const failed = results.find((r) => !r.ok);
      if (failed) { const d = await failed.json().catch(() => ({})); onError(d.error || 'Failed to update prices'); return; }
      onChanged('Prices and tolerance saved.');
    } finally { setSaving(false); }
  };

  return (
    <Card title="Prices & Tolerance">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {products.map((p) => (
          <Input key={p} label={`${p} (₦/L)`} type="number" value={prices[p]} onChange={(e) => setPrices((s) => ({ ...s, [p]: e.target.value }))} />
        ))}
        <Input label="Tolerance (% of sales)" type="number" value={tolerance} onChange={(e) => setTolerance(e.target.value)} />
      </div>
      <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why prices changed" />
      <Button variant="primary" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save Prices & Tolerance'}</Button>
    </Card>
  );
}

function ProductsSection({ station, onChanged, onError }) {
  const [selected, setSelected] = useState(station.availableProducts ? [...station.availableProducts] : ['PMS', 'AGO']);
  const [saving, setSaving] = useState(false);
  const toggle = (f) => setSelected((s) => s.includes(f) ? s.filter((x) => x !== f) : [...s, f]);
  const save = async () => {
    if (selected.length === 0) { onError('Select at least one product.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/stations/${station._id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availableProducts: selected }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { onError(d.error || 'Failed to update products'); return; }
      onChanged('Available products saved.');
    } finally { setSaving(false); }
  };
  return (
    <Card title="Available Products">
      <div className="flex flex-wrap gap-2 mb-3">
        {ALL_FUEL_TYPES.map((f) => (
          <button key={f} onClick={() => toggle(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors ${selected.includes(f) ? 'border-ecana-maroon bg-ecana-maroon/10 text-ecana-maroon' : 'border-gray-200 text-gray-500'}`}>
            {f}
          </button>
        ))}
      </div>
      <Button variant="primary" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save Products'}</Button>
    </Card>
  );
}

function DetailsSection({ station, onChanged, onError }) {
  const [form, setForm] = useState({
    name: station.name || '', code: station.code || '', location: station.location || '',
    numberOfTanks: station.numberOfTanks ?? 0, numberOfPumps: station.numberOfPumps ?? 0,
    editReason: '', confirmCode: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (String(form.confirmCode).trim().toUpperCase() !== String(station.code).toUpperCase()) {
      onError('Confirmation code must match the current station code.'); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/stations/${station._id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(), code: form.code.trim(), location: form.location.trim(),
          numberOfTanks: Number(form.numberOfTanks), numberOfPumps: Number(form.numberOfPumps),
          editReason: form.editReason.trim(),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { onError(d.error || 'Failed to update station details'); return; }
      onChanged('Station details saved.');
    } finally { setSaving(false); }
  };
  return (
    <Card title="Station Details">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} />
        <Input label="Code" value={form.code} onChange={(e) => set('code', e.target.value)} />
        <Input label="Location" value={form.location} onChange={(e) => set('location', e.target.value)} />
        <Input label="Number of Tanks" type="number" value={form.numberOfTanks} onChange={(e) => set('numberOfTanks', e.target.value)} />
        <Input label="Number of Pumps" type="number" value={form.numberOfPumps} onChange={(e) => set('numberOfPumps', e.target.value)} />
      </div>
      <Input label="Edit Reason (required for tank/pump count changes)" value={form.editReason} onChange={(e) => set('editReason', e.target.value)} />
      <Input label={`Type station code "${station.code}" to confirm`} value={form.confirmCode} onChange={(e) => set('confirmCode', e.target.value)} />
      <Button variant="primary" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save Details'}</Button>
    </Card>
  );
}

function MappingSection({ station, onChanged, onError }) {
  const [tanks, setTanks] = useState(() => (station.tanks || []).map((t) => ({ ...t, isActive: t.isActive !== false })));
  const [dispensers, setDispensers] = useState(() => (station.dispensers || []).map((d) => ({ ...d, tankId: d.tankId || '', isActive: d.isActive !== false })));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const products = station.availableProducts || ['PMS', 'AGO'];

  const updTank = (i, k, v) => setTanks((s) => s.map((t, j) => j === i ? { ...t, [k]: v } : t));
  const updDisp = (i, k, v) => setDispensers((s) => s.map((d, j) => j === i ? { ...d, [k]: v } : d));

  const save = async () => {
    const isInitial = (station.dispensers || []).every((d) => !d.tankId);
    if (!isInitial && reason.trim().length < 5) { onError('Provide a reason (≥5 chars) for mapping changes.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/stations/${station._id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tanks: tanks.map((t) => ({ _id: t._id, label: t.label, product: t.product, capacity: Number(t.capacity), isActive: t.isActive !== false })),
          dispensers: dispensers.map((d) => ({ dispenserId: d.dispenserId, name: d.name, tankId: d.tankId || null, fuelType: d.fuelType, isActive: d.isActive !== false })),
          editReason: reason,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { onError(d.error || 'Failed to save mapping'); return; }
      onChanged('Tank & pump mapping saved.');
    } finally { setSaving(false); }
  };

  const tankOptions = [{ value: '', label: 'Unassigned' }, ...tanks.map((t) => ({ value: t._id, label: `${t.label} (${t.product})` }))];

  return (
    <Card title="Tanks & Pumps Mapping">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tanks</p>
      <div className="space-y-2 mb-4">
        {tanks.map((t, i) => (
          <div key={t._id || i} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
            <Input label={i === 0 ? 'Label' : undefined} value={t.label} onChange={(e) => updTank(i, 'label', e.target.value)} />
            <Select label={i === 0 ? 'Product' : undefined} value={t.product} onChange={(e) => updTank(i, 'product', e.target.value)} options={products.map((p) => ({ value: p, label: p }))} />
            <Input label={i === 0 ? 'Capacity (L)' : undefined} type="number" value={t.capacity} onChange={(e) => updTank(i, 'capacity', e.target.value)} />
            <Button size="sm" variant="danger" onClick={() => setTanks((s) => s.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => setTanks((s) => [...s, { _id: `TANK-${Date.now()}`, label: '', product: products[0] || 'PMS', capacity: '', isActive: true }])}>+ Add Tank</Button>
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pumps → Tank</p>
      <div className="space-y-2 mb-4">
        {dispensers.map((d, i) => (
          <div key={d.dispenserId || i} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
            <Input label={i === 0 ? 'Pump Name' : undefined} value={d.name} onChange={(e) => updDisp(i, 'name', e.target.value)} />
            <Select label={i === 0 ? 'Fuel' : undefined} value={d.fuelType} onChange={(e) => updDisp(i, 'fuelType', e.target.value)} options={products.map((p) => ({ value: p, label: p }))} />
            <Select label={i === 0 ? 'Tank' : undefined} value={d.tankId} onChange={(e) => updDisp(i, 'tankId', e.target.value)} options={tankOptions} placeholder="Unassigned" />
            <Button size="sm" variant="danger" onClick={() => setDispensers((s) => s.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => setDispensers((s) => [...s, { dispenserId: `PUMP-${Date.now()}`, name: '', fuelType: products[0] || 'PMS', tankId: '', isActive: true }])}>+ Add Pump</Button>
      </div>

      <Input label="Reason for mapping change" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button variant="primary" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save Mapping'}</Button>
    </Card>
  );
}

function SeedSection({ station, onChanged, onError }) {
  const [pumpVals, setPumpVals] = useState({});
  const [tankVals, setTankVals] = useState({});
  const [saving, setSaving] = useState(false);
  const dispensers = station.dispensers || [];
  const tanks = station.tanks || [];

  const save = async () => {
    const pumps = dispensers.filter((d) => pumpVals[d.dispenserId] !== undefined && pumpVals[d.dispenserId] !== '');
    const tnks = tanks.filter((t) => tankVals[t._id] !== undefined && tankVals[t._id] !== '');
    if (pumps.length === 0 && tnks.length === 0) { onError('Enter at least one reading to seed.'); return; }
    setSaving(true);
    try {
      const reqs = [
        ...pumps.map((d) => fetch('/api/meter-readings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'admin-seed', stationId: station._id, pumpId: d.dispenserId, pumpLabel: d.name, seedValue: Number(pumpVals[d.dispenserId]) }),
        })),
        ...tnks.map((t) => fetch('/api/tank-stock', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'admin-seed', stationId: station._id, tankId: t._id, seedValue: Number(tankVals[t._id]) }),
        })),
      ];
      const results = await Promise.all(reqs);
      const failed = results.find((r) => !r.ok);
      if (failed) { const d = await failed.json().catch(() => ({})); onError(d.error || 'Failed to seed readings'); return; }
      onChanged('Seed readings saved.');
      setPumpVals({}); setTankVals({});
    } finally { setSaving(false); }
  };

  return (
    <Card title="Seed Opening Readings">
      <p className="text-sm text-gray-500 mb-3">Set initial meter/dipstick values so supervisors can open pumps (first-time setup or after a reset).</p>
      {dispensers.length > 0 && (
        <>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pump Meters</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {dispensers.map((d) => (
              <Input key={d.dispenserId} label={d.name} type="number" value={pumpVals[d.dispenserId] ?? ''} onChange={(e) => setPumpVals((s) => ({ ...s, [d.dispenserId]: e.target.value }))} placeholder="Meter reading" />
            ))}
          </div>
        </>
      )}
      {tanks.length > 0 && (
        <>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tank Dipsticks</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {tanks.map((t) => (
              <Input key={t._id} label={`${t.label} (${t.product})`} type="number" value={tankVals[t._id] ?? ''} onChange={(e) => setTankVals((s) => ({ ...s, [t._id]: e.target.value }))} placeholder="Dipstick litres" />
            ))}
          </div>
        </>
      )}
      <Button variant="primary" disabled={saving} onClick={save}>{saving ? 'Seeding...' : 'Save Seed Readings'}</Button>
    </Card>
  );
}

// ── OPERATIONS ───────────────────────────────────────────────────────────────
function OperationsTab({ station }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/day-shifts?stationId=${station._id}`);
        const data = await res.json();
        setShifts(data.dayShifts || []);
      } catch { /* ignore */ } finally { setLoading(false); }
    })();
  }, [station._id]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Link href={`/admin/reports?stationId=${station._id}`} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:border-ecana-maroon hover:text-ecana-maroon">Open Reports →</Link>
        <Link href={`/manager?stationId=${station._id}`} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:border-ecana-maroon hover:text-ecana-maroon">Operational view →</Link>
      </div>
      <Card title="Recent Day Shifts">
        {loading ? <p className="text-sm text-gray-400 py-3">Loading…</p> : shifts.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No day shifts recorded.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 text-xs uppercase tracking-wide">
                <th className="pb-2 pr-4">Date</th><th className="pb-2 pr-4">Status</th><th className="pb-2 pr-4">Started By</th><th className="pb-2">Pumps</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {shifts.slice(0, 30).map((s) => (
                  <tr key={s._id}>
                    <td className="py-2.5 pr-4">{fmtDate(s.date)}</td>
                    <td className="py-2.5 pr-4"><span className="capitalize">{String(s.status || '').replace('_', ' ')}</span></td>
                    <td className="py-2.5 pr-4 text-gray-600">{s.startedByName || '—'}</td>
                    <td className="py-2.5 text-gray-600">{s.dispenserAssignments?.length ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
