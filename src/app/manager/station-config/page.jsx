"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

function stationToForm(s) {
  return {
    tanks: (s.tanks || []).map(t => ({
      _id: t._id,
      label: t.label,
      product: t.product,
      capacity: String(t.capacity ?? ''),
      isActive: t.isActive !== false,
    })),
    dispensers: (s.dispensers || []).map(d => ({
      dispenserId: d.dispenserId,
      name: d.name,
      fuelType: d.fuelType,
      tankId: d.tankId || '',
      isActive: d.isActive !== false,
    })),
    editReason: '',
  };
}

function StationConfigPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const activeStationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [station, setStation] = useState(null);
  const [form, setForm] = useState({ tanks: [], dispensers: [], editReason: '' });
  const [savedForm, setSavedForm] = useState(null);
  const [tankEditing, setTankEditing] = useState({});
  const [dispenserEditing, setDispenserEditing] = useState({});

  useEffect(() => {
    fetchStation();
  }, [activeStationId]);

  const fetchStation = async () => {
    if (!activeStationId) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await fetch(`/api/stations/${activeStationId}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load station configuration'); return; }
      setStation(data.station);
      const f = stationToForm(data.station);
      setForm(f);
      setSavedForm(f);
      setTankEditing({});
      setDispenserEditing({});
      setError('');
    } catch {
      setError('Failed to load station configuration');
    } finally {
      setLoading(false);
    }
  };

  const updateTank = (i, field, value) =>
    setForm(prev => {
      const tanks = [...prev.tanks];
      tanks[i] = { ...tanks[i], [field]: value };
      return { ...prev, tanks };
    });

  const updateDispenser = (i, field, value) =>
    setForm(prev => {
      const dispensers = [...prev.dispensers];
      dispensers[i] = { ...dispensers[i], [field]: value };
      return { ...prev, dispensers };
    });

  const addTank = () => {
    const idx = form.tanks.length;
    setForm(prev => ({
      ...prev,
      tanks: [...prev.tanks, { _id: '', label: '', product: 'PMS', capacity: '', isActive: true }],
    }));
    setTankEditing(prev => ({ ...prev, [idx]: true }));
  };

  const addDispenser = () => {
    const idx = form.dispensers.length;
    setForm(prev => ({
      ...prev,
      dispensers: [...prev.dispensers, { dispenserId: '', name: '', fuelType: 'PMS', tankId: '', isActive: true }],
    }));
    setDispenserEditing(prev => ({ ...prev, [idx]: true }));
  };

  const cancelTankEdit = (i) => {
    if (savedForm && i < savedForm.tanks.length) {
      setForm(prev => {
        const tanks = [...prev.tanks];
        tanks[i] = { ...savedForm.tanks[i] };
        return { ...prev, tanks };
      });
      setTankEditing(prev => ({ ...prev, [i]: false }));
    } else {
      setForm(prev => ({ ...prev, tanks: prev.tanks.filter((_, idx) => idx !== i) }));
      setTankEditing(prev => {
        const next = {};
        Object.entries(prev).forEach(([k, v]) => {
          const ki = Number(k);
          if (ki < i) next[ki] = v;
          else if (ki > i) next[ki - 1] = v;
        });
        return next;
      });
    }
  };

  const cancelDispenserEdit = (i) => {
    if (savedForm && i < savedForm.dispensers.length) {
      setForm(prev => {
        const dispensers = [...prev.dispensers];
        dispensers[i] = { ...savedForm.dispensers[i] };
        return { ...prev, dispensers };
      });
      setDispenserEditing(prev => ({ ...prev, [i]: false }));
    } else {
      setForm(prev => ({ ...prev, dispensers: prev.dispensers.filter((_, idx) => idx !== i) }));
      setDispenserEditing(prev => {
        const next = {};
        Object.entries(prev).forEach(([k, v]) => {
          const ki = Number(k);
          if (ki < i) next[ki] = v;
          else if (ki > i) next[ki - 1] = v;
        });
        return next;
      });
    }
  };

  const removeTank = (i) => {
    const tankId = form.tanks[i]?._id;
    setForm(prev => ({
      ...prev,
      tanks: prev.tanks.filter((_, idx) => idx !== i),
      dispensers: prev.dispensers.map(d => d.tankId === tankId ? { ...d, tankId: '' } : d),
    }));
    setTankEditing(prev => {
      const next = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki < i) next[ki] = v;
        else if (ki > i) next[ki - 1] = v;
      });
      return next;
    });
  };

  const removeDispenser = (i) => {
    setForm(prev => ({ ...prev, dispensers: prev.dispensers.filter((_, idx) => idx !== i) }));
    setDispenserEditing(prev => {
      const next = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki < i) next[ki] = v;
        else if (ki > i) next[ki - 1] = v;
      });
      return next;
    });
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    if (!form.editReason || form.editReason.trim().length < 5) {
      setError('Please provide a reason for the change (min 5 characters).');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        numberOfTanks: form.tanks.length,
        numberOfPumps: form.dispensers.length,
        tanks: form.tanks.map(t => ({ ...t, capacity: Number(t.capacity) })),
        dispensers: form.dispensers.map(d => ({ ...d, tankId: d.tankId || null })),
        editReason: form.editReason.trim(),
      };
      const res = await fetch(`/api/stations/${activeStationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save station configuration'); return; }
      setSuccess('Station configuration updated successfully.');
      await fetchStation();
    } catch {
      setError('Failed to save station configuration');
    } finally {
      setSaving(false);
    }
  };

  const anyEditing = Object.values(tankEditing).some(Boolean) || Object.values(dispenserEditing).some(Boolean);

  if (!activeStationId) {
    return (
      <Card title="Select Station">
        <p className="text-sm text-gray-600">Choose a station from the Admin Stations page to manage.</p>
      </Card>
    );
  }

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Station Config</h1>
        <p className="mt-2 text-sm text-gray-600">
          Admin sets the initial station structure. Managers can maintain tank and pump configuration for day-to-day operations.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">{error}</div>
      )}
      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-800 text-sm">{success}</div>
      )}

      {/* Station overview */}
      <Card title="Station Overview">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { label: 'Station', value: station?.name },
            { label: 'Code', value: station?.code },
            { label: 'Location', value: station?.location },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-1 text-base font-bold text-slate-900">{value || '—'}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Tanks */}
      <Card title={`Tanks (${form.tanks.length})`}>
        <div className="space-y-3">
          {form.tanks.length === 0 && (
            <p className="text-sm text-slate-500">No tanks configured yet. Add one below.</p>
          )}
          {form.tanks.map((tank, i) => {
            const isEditing = !!tankEditing[i];
            return (
              <div key={`tank-${i}`} className="rounded-xl border border-slate-200 bg-white">
                {isEditing ? (
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <Input
                        label="Tank ID"
                        value={tank._id}
                        onChange={e => updateTank(i, '_id', e.target.value)}
                        placeholder="e.g. PMS-1"
                        autoFocus
                      />
                      <Input
                        label="Label"
                        value={tank.label}
                        onChange={e => updateTank(i, 'label', e.target.value)}
                        placeholder="Front PMS Tank"
                      />
                      <Select
                        label="Product"
                        value={tank.product}
                        onChange={e => updateTank(i, 'product', e.target.value)}
                        options={[{ value: 'PMS', label: 'PMS' }, { value: 'AGO', label: 'AGO' }]}
                      />
                      <Input
                        label="Capacity (L)"
                        type="number"
                        min="1"
                        step="0.01"
                        value={tank.capacity}
                        onChange={e => updateTank(i, 'capacity', e.target.value)}
                        placeholder="e.g. 33000"
                      />
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-36">
                        <Select
                          label="Status"
                          value={tank.isActive ? 'true' : 'false'}
                          onChange={e => updateTank(i, 'isActive', e.target.value === 'true')}
                          options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]}
                        />
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => setTankEditing(prev => ({ ...prev, [i]: false }))}>
                        Done
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => cancelTankEdit(i)}>
                        Cancel
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => removeTank(i)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-2 flex-1 min-w-0">
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">ID</p>
                        <p className="font-mono text-sm font-medium text-slate-800">{tank._id || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Label</p>
                        <p className="text-sm font-medium text-slate-800">{tank.label || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Product</p>
                        <span className={`badge ${tank.product === 'PMS' ? 'badge-success' : 'badge-info'}`}>{tank.product}</span>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Capacity</p>
                        <p className="text-sm font-medium text-slate-800">
                          {tank.capacity ? `${Number(tank.capacity).toLocaleString()} L` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Status</p>
                        <span className={`badge ${tank.isActive ? 'badge-success' : 'badge-warning'}`}>
                          {tank.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setTankEditing(prev => ({ ...prev, [i]: true }))}
                      className="ml-4 shrink-0 text-sm text-ecana-maroon hover:underline font-medium"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <div className="pt-1">
            <Button variant="secondary" size="sm" onClick={addTank}>+ Add Tank</Button>
          </div>
        </div>
      </Card>

      {/* Pumps / Dispensers */}
      <Card title={`Pumps / Dispensers (${form.dispensers.length})`}>
        <div className="space-y-3">
          {form.dispensers.length === 0 && (
            <p className="text-sm text-slate-500">No pumps configured yet. Add one below.</p>
          )}
          {form.dispensers.map((dispenser, i) => {
            const isEditing = !!dispenserEditing[i];
            const mappedTank = form.tanks.find(t => t._id === dispenser.tankId);
            return (
              <div key={`dispenser-${i}`} className="rounded-xl border border-slate-200 bg-white">
                {isEditing ? (
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <Input
                        label="Pump ID"
                        value={dispenser.dispenserId}
                        onChange={e => updateDispenser(i, 'dispenserId', e.target.value)}
                        placeholder="e.g. PUMP-1"
                        autoFocus
                      />
                      <Input
                        label="Pump Name"
                        value={dispenser.name}
                        onChange={e => updateDispenser(i, 'name', e.target.value)}
                        placeholder="Nozzle 1"
                      />
                      <Select
                        label="Fuel Type"
                        value={dispenser.fuelType}
                        onChange={e => updateDispenser(i, 'fuelType', e.target.value)}
                        options={[{ value: 'PMS', label: 'PMS' }, { value: 'AGO', label: 'AGO' }]}
                      />
                      <Select
                        label="Mapped Tank"
                        value={dispenser.tankId || '__unmapped__'}
                        onChange={e => updateDispenser(i, 'tankId', e.target.value === '__unmapped__' ? '' : e.target.value)}
                        options={[
                          { value: '__unmapped__', label: 'Unmapped' },
                          ...form.tanks.map(t => ({ value: t._id, label: `${t.label || t._id} (${t.product})` })),
                        ]}
                      />
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-36">
                        <Select
                          label="Status"
                          value={dispenser.isActive ? 'true' : 'false'}
                          onChange={e => updateDispenser(i, 'isActive', e.target.value === 'true')}
                          options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]}
                        />
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => setDispenserEditing(prev => ({ ...prev, [i]: false }))}>
                        Done
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => cancelDispenserEdit(i)}>
                        Cancel
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => removeDispenser(i)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-2 flex-1 min-w-0">
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Pump ID</p>
                        <p className="font-mono text-sm font-medium text-slate-800">{dispenser.dispenserId || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Name</p>
                        <p className="text-sm font-medium text-slate-800">{dispenser.name || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Fuel</p>
                        <span className={`badge ${dispenser.fuelType === 'PMS' ? 'badge-success' : 'badge-info'}`}>{dispenser.fuelType}</span>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Mapped Tank</p>
                        <p className="text-sm font-medium text-slate-800">
                          {mappedTank ? (mappedTank.label || mappedTank._id) : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Status</p>
                        <span className={`badge ${dispenser.isActive ? 'badge-success' : 'badge-warning'}`}>
                          {dispenser.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setDispenserEditing(prev => ({ ...prev, [i]: true }))}
                      className="ml-4 shrink-0 text-sm text-ecana-maroon hover:underline font-medium"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <div className="pt-1">
            <Button variant="secondary" size="sm" onClick={addDispenser}>+ Add Pump</Button>
          </div>
        </div>
      </Card>

      {/* Save */}
      <Card title="Save Changes">
        {anyEditing && (
          <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800 text-sm">
            Some rows are still open for editing. Click <strong>Done</strong> on each row first, or Save will include those changes as-is.
          </div>
        )}
        <Input
          label="Reason for change"
          name="editReason"
          value={form.editReason}
          onChange={e => setForm(prev => ({ ...prev, editReason: e.target.value }))}
          placeholder="Explain why this configuration is being changed"
          helpText="Required — recorded in the audit log."
        />
        <div className="mt-4 flex justify-end">
          <Button variant="primary" size="lg" onClick={handleSave} isLoading={saving}>
            Save Station Configuration
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function StationConfigPage() {
  return (
    <Suspense fallback={<Loading />}>
      <StationConfigPageContent />
    </Suspense>
  );
}
