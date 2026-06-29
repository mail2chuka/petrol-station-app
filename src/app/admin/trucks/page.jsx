'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/Card';
import Table from '@/components/Table';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Loading from '@/components/Loading';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TrucksPage() {
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [form, setForm] = useState({ plateNumber: '', driverName: '', driverPhone: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [detail, setDetail] = useState(null);       // { truck, totals, byStation, deliveries }
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/trucks${includeInactive ? '?includeInactive=true' : ''}`);
      const data = await res.json();
      setTrucks(data.trucks || []);
    } catch {
      setError('Failed to load trucks.');
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (truck) => {
    setDetail({ truck, totals: null, byStation: [], deliveries: [] });
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/trucks/${truck._id}`);
      const data = await res.json();
      if (res.ok) setDetail(data);
    } finally {
      setDetailLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!form.plateNumber.trim()) { setError('Plate number is required.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/trucks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to register truck'); return; }
      setSuccess(`Truck ${data.truck.plateNumber} registered.`);
      setForm({ plateNumber: '', driverName: '', driverPhone: '', notes: '' });
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editing?._id) return;
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/trucks/${editing._id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plateNumber: editing.plateNumber, driverName: editing.driverName,
          driverPhone: editing.driverPhone, notes: editing.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to update truck'); return; }
      setSuccess('Truck updated.');
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (truck) => {
    const next = !(truck.isActive !== false);
    if (!window.confirm(`${next ? 'Activate' : 'Deactivate'} truck ${truck.plateNumber}?`)) return;
    const res = await fetch(`/api/trucks/${truck._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || 'Failed to update'); return; }
    setSuccess(`Truck ${next ? 'activated' : 'deactivated'}.`);
    load();
  };

  const columns = [
    { header: 'Plate', render: (r) => (
      <button className="font-semibold text-gray-900 hover:text-ecana-maroon" onClick={() => openDetail(r)}>{r.plateNumber}</button>
    )},
    { header: 'Driver', render: (r) => r.driverName || '—' },
    { header: 'Phone', render: (r) => r.driverPhone || '—' },
    { header: 'Status', render: (r) => (
      <span className={`px-2 py-0.5 rounded text-xs ${r.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {r.isActive !== false ? 'Active' : 'Inactive'}
      </span>
    )},
    { header: 'Actions', render: (r) => (
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => openDetail(r)}>History</Button>
        <Button size="sm" variant="secondary" onClick={() => setEditing({ ...r })}>Edit</Button>
        <Button size="sm" variant={r.isActive !== false ? 'danger' : 'success'} onClick={() => toggleActive(r)}>
          {r.isActive !== false ? 'Deactivate' : 'Activate'}
        </Button>
      </div>
    )},
  ];

  if (loading) return <Loading />;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Trucks</h1>
          <p className="text-sm text-gray-600 mt-1">Register delivery trucks and review their offload history.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setIncludeInactive((v) => !v)}>
            {includeInactive ? 'Hide inactive' : 'Show inactive'}
          </Button>
          <Button variant={showForm ? 'secondary' : 'primary'} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Close' : 'Register Truck'}
          </Button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl mb-4 text-sm">{success}</div>}

      {showForm && (
        <Card title="Register New Truck" className="mb-6">
          <form onSubmit={submit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Plate Number" value={form.plateNumber} onChange={(e) => setForm((p) => ({ ...p, plateNumber: e.target.value }))} placeholder="e.g. ABC-123-XY" required />
              <Input label="Driver Name" value={form.driverName} onChange={(e) => setForm((p) => ({ ...p, driverName: e.target.value }))} placeholder="Default driver" />
              <Input label="Driver Phone" value={form.driverPhone} onChange={(e) => setForm((p) => ({ ...p, driverPhone: e.target.value }))} placeholder="080..." />
              <Input label="Notes (optional)" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <Button type="submit" variant="primary" fullWidth size="lg" disabled={saving}>{saving ? 'Saving...' : 'Register Truck'}</Button>
          </form>
        </Card>
      )}

      <Card title="All Trucks">
        <Table columns={columns} data={trucks} emptyMessage="No trucks registered yet." />
      </Card>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => setEditing(null)} />
          <div className="absolute left-0 right-0 bottom-0 sm:bottom-auto sm:top-24 sm:left-1/2 sm:-translate-x-1/2 sm:w-[480px] rounded-t-2xl sm:rounded-2xl bg-white shadow-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-lg font-bold text-gray-900">Edit Truck</p>
              <Button variant="secondary" onClick={() => setEditing(null)}>Close</Button>
            </div>
            <Input label="Plate Number" value={editing.plateNumber} onChange={(e) => setEditing((p) => ({ ...p, plateNumber: e.target.value }))} />
            <Input label="Driver Name" value={editing.driverName || ''} onChange={(e) => setEditing((p) => ({ ...p, driverName: e.target.value }))} />
            <Input label="Driver Phone" value={editing.driverPhone || ''} onChange={(e) => setEditing((p) => ({ ...p, driverPhone: e.target.value }))} />
            <Input label="Notes" value={editing.notes || ''} onChange={(e) => setEditing((p) => ({ ...p, notes: e.target.value }))} />
            <Button variant="primary" fullWidth size="lg" disabled={saving} onClick={saveEdit}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        </div>
      )}

      {/* History drawer */}
      {detail && (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => setDetail(null)} />
          <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[620px] bg-white shadow-xl overflow-y-auto">
            <div className="p-4 sm:p-6">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs text-gray-500">Truck</p>
                  <p className="text-lg font-bold text-gray-900">{detail.truck.plateNumber}</p>
                  <p className="text-xs text-gray-500">{detail.truck.driverName || '—'}{detail.truck.driverPhone ? ` · ${detail.truck.driverPhone}` : ''}</p>
                </div>
                <Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>
              </div>

              {detailLoading || !detail.totals ? (
                <p className="text-sm text-gray-400 py-6">Loading history…</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                    <div className="card-modern p-3"><p className="text-xs text-gray-500 uppercase">Deliveries</p><p className="text-xl font-bold">{detail.totals.deliveries}</p></div>
                    <div className="card-modern p-3"><p className="text-xs text-gray-500 uppercase">Total Offloaded</p><p className="text-xl font-bold">{fmt(detail.totals.totalOffloaded)} L</p></div>
                    <div className="card-modern p-3"><p className="text-xs text-gray-500 uppercase">Declared</p><p className="text-xl font-bold">{fmt(detail.totals.totalDeclared)} L</p></div>
                    <div className="card-modern p-3"><p className="text-xs text-gray-500 uppercase">Total Shortage</p><p className="text-xl font-bold text-amber-700">{fmt(detail.totals.totalShortage)} L</p></div>
                    <div className="card-modern p-3"><p className="text-xs text-gray-500 uppercase">Total Excess</p><p className="text-xl font-bold text-blue-700">{fmt(detail.totals.totalExcess)} L</p></div>
                  </div>

                  {detail.byStation.length > 0 && (
                    <div className="mb-5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By Station</p>
                      <div className="space-y-1">
                        {detail.byStation.map((s, i) => (
                          <div key={i} className="flex justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
                            <span className="text-gray-700">{s.stationName}</span>
                            <span className="text-gray-500">{s.deliveries} trip(s) · {fmt(s.offloaded)} L · short {fmt(s.shortage)} · excess {fmt(s.excess)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Delivery History</p>
                  {detail.deliveries.length === 0 ? (
                    <p className="text-sm text-gray-400">No deliveries recorded for this truck yet.</p>
                  ) : (
                    <div className="overflow-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="text-left text-gray-400 text-xs uppercase tracking-wide">
                          <th className="pb-2 pr-3">Date</th><th className="pb-2 pr-3">Station</th><th className="pb-2 pr-3">Fuel</th>
                          <th className="pb-2 pr-3">Declared</th><th className="pb-2 pr-3">Offloaded</th><th className="pb-2">Variance</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-100">
                          {detail.deliveries.map((d) => {
                            const v = d.offloadVariance ?? 0;
                            return (
                              <tr key={d._id}>
                                <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(d.date)}</td>
                                <td className="py-2 pr-3">{d.stationName}</td>
                                <td className="py-2 pr-3">{d.fuelType}</td>
                                <td className="py-2 pr-3">{fmt(d.declaredLoad)}</td>
                                <td className="py-2 pr-3">{fmt(d.actualOffloaded)}</td>
                                <td className={`py-2 font-medium ${v < 0 ? 'text-amber-700' : v > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                                  {v === 0 ? '—' : `${v < 0 ? '−' : '+'}${fmt(Math.abs(v))} L`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
