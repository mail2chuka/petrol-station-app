"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

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
  const [form, setForm] = useState({
    numberOfTanks: '0',
    numberOfPumps: '0',
    tanks: [],
    dispensers: [],
    editReason: '',
  });

  useEffect(() => {
    fetchStation();
  }, [activeStationId]);

  const fetchStation = async () => {
    if (!activeStationId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/stations/${activeStationId}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to load station configuration');
        return;
      }

      setStation(data.station);
      setForm({
        numberOfTanks: String(data.station.numberOfTanks ?? data.station.tanks?.length ?? 0),
        numberOfPumps: String(data.station.numberOfPumps ?? data.station.dispensers?.length ?? 0),
        tanks: (data.station.tanks || []).map((tank) => ({
          _id: tank._id,
          label: tank.label,
          product: tank.product,
          capacity: String(tank.capacity ?? ''),
          isActive: tank.isActive !== false,
        })),
        dispensers: (data.station.dispensers || []).map((dispenser) => ({
          dispenserId: dispenser.dispenserId,
          name: dispenser.name,
          fuelType: dispenser.fuelType,
          tankId: dispenser.tankId || '',
          isActive: dispenser.isActive !== false,
        })),
        editReason: '',
      });
      setError('');
    } catch (fetchError) {
      setError('Failed to load station configuration');
    } finally {
      setLoading(false);
    }
  };

  const updateTank = (index, field, value) => {
    setForm((current) => {
      const tanks = [...current.tanks];
      tanks[index] = { ...tanks[index], [field]: value };
      return { ...current, tanks };
    });
  };

  const updateDispenser = (index, field, value) => {
    setForm((current) => {
      const dispensers = [...current.dispensers];
      dispensers[index] = { ...dispensers[index], [field]: value };
      return { ...current, dispensers };
    });
  };

  const addTank = () => {
    setForm((current) => ({
      ...current,
      tanks: [...current.tanks, { _id: '', label: '', product: 'PMS', capacity: '', isActive: true }],
    }));
  };

  const addDispenser = () => {
    setForm((current) => ({
      ...current,
      dispensers: [...current.dispensers, { dispenserId: '', name: '', fuelType: 'PMS', tankId: '', isActive: true }],
    }));
  };

  const removeTank = (index) => {
    setForm((current) => ({
      ...current,
      tanks: current.tanks.filter((_, tankIndex) => tankIndex !== index),
      dispensers: current.dispensers.map((dispenser) => (
        dispenser.tankId === current.tanks[index]?._id
          ? { ...dispenser, tankId: '' }
          : dispenser
      )),
    }));
  };

  const removeDispenser = (index) => {
    setForm((current) => ({
      ...current,
      dispensers: current.dispensers.filter((_, dispenserIndex) => dispenserIndex !== index),
    }));
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');

    if (!form.editReason || form.editReason.trim().length < 5) {
      setError('Please provide a reason for the configuration change.');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        numberOfTanks: Number(form.numberOfTanks || 0),
        numberOfPumps: Number(form.numberOfPumps || 0),
        tanks: form.tanks.map((tank) => ({
          ...tank,
          capacity: Number(tank.capacity),
        })),
        dispensers: form.dispensers.map((dispenser) => ({
          ...dispenser,
          tankId: dispenser.tankId || null,
        })),
        editReason: form.editReason.trim(),
      };

      const res = await fetch(`/api/stations/${activeStationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save station configuration');
        return;
      }

      setSuccess('Station tank and pump configuration updated successfully.');
      await fetchStation();
    } catch (saveError) {
      setError('Failed to save station configuration');
    } finally {
      setSaving(false);
    }
  };

  if (!activeStationId) {
    return (
      <Card title="Select Station">
        <p className="text-sm text-gray-600">Choose a station from the Admin Stations page to manage.</p>
      </Card>
    );
  }

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Station Config</h1>
        <p className="mt-2 text-sm text-gray-600">
          Admin sets the initial station structure. Managers can maintain tank and pump configuration for day-to-day operations.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-800">
          {success}
        </div>
      )}

      <Card title="Station Overview">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Station</p>
            <p className="mt-1 text-base font-bold text-slate-900">{station?.name}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Code</p>
            <p className="mt-1 text-base font-bold text-slate-900">{station?.code}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</p>
            <p className="mt-1 text-base font-bold text-slate-900">{station?.location}</p>
          </div>
        </div>
      </Card>

      <Card title="Counts">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Number of Tanks"
            name="numberOfTanks"
            type="number"
            min="0"
            step="1"
            value={form.numberOfTanks}
            onChange={(e) => setForm((current) => ({ ...current, numberOfTanks: e.target.value }))}
          />
          <Input
            label="Number of Pumps"
            name="numberOfPumps"
            type="number"
            min="0"
            step="1"
            value={form.numberOfPumps}
            onChange={(e) => setForm((current) => ({ ...current, numberOfPumps: e.target.value }))}
          />
        </div>
      </Card>

      <Card
        title="Tanks"
        action={<Button variant="secondary" size="sm" onClick={addTank}>Add Tank</Button>}
      >
        <div className="space-y-4">
          {form.tanks.length === 0 && (
            <p className="text-sm text-slate-500">No tanks configured yet.</p>
          )}
          {form.tanks.map((tank, index) => (
            <div key={`tank-row-${index}`} className="rounded-2xl border border-slate-200 p-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Input
                  label="Tank ID"
                  name={`tank-id-${index}`}
                  value={tank._id}
                  onChange={(e) => updateTank(index, '_id', e.target.value)}
                  placeholder="e.g. PMS-1"
                  className="min-w-0"
                />
                <Input
                  label="Label"
                  name={`tank-label-${index}`}
                  value={tank.label}
                  onChange={(e) => updateTank(index, 'label', e.target.value)}
                  placeholder="Front PMS Tank"
                />
                <Select
                  label="Product"
                  name={`tank-product-${index}`}
                  value={tank.product}
                  onChange={(e) => updateTank(index, 'product', e.target.value)}
                  options={[
                    { value: 'PMS', label: 'PMS' },
                    { value: 'AGO', label: 'AGO' },
                  ]}
                />
                <Input
                  label="Capacity"
                  name={`tank-capacity-${index}`}
                  type="number"
                  min="1"
                  step="0.01"
                  value={tank.capacity}
                  onChange={(e) => updateTank(index, 'capacity', e.target.value)}
                  placeholder="e.g. 33000"
                />
                <div className="space-y-4">
                  <Select
                    label="Status"
                    name={`tank-status-${index}`}
                    value={tank.isActive ? 'true' : 'false'}
                    onChange={(e) => updateTank(index, 'isActive', e.target.value === 'true')}
                    options={[
                      { value: 'true', label: 'Active' },
                      { value: 'false', label: 'Inactive' },
                    ]}
                  />
                  <Button variant="danger" size="sm" onClick={() => removeTank(index)}>
                    Remove Tank
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Pumps / Dispensers"
        action={<Button variant="secondary" size="sm" onClick={addDispenser}>Add Pump</Button>}
      >
        <div className="space-y-4">
          {form.dispensers.length === 0 && (
            <p className="text-sm text-slate-500">No pumps configured yet.</p>
          )}
          {form.dispensers.map((dispenser, index) => (
            <div key={`dispenser-row-${index}`} className="rounded-2xl border border-slate-200 p-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Input
                  label="Pump ID"
                  name={`dispenser-id-${index}`}
                  value={dispenser.dispenserId}
                  onChange={(e) => updateDispenser(index, 'dispenserId', e.target.value)}
                  placeholder="e.g. PUMP-1"
                  className="min-w-0"
                />
                <Input
                  label="Pump Name"
                  name={`dispenser-name-${index}`}
                  value={dispenser.name}
                  onChange={(e) => updateDispenser(index, 'name', e.target.value)}
                  placeholder="Nozzle 1"
                />
                <Select
                  label="Fuel Type"
                  name={`dispenser-fuel-${index}`}
                  value={dispenser.fuelType}
                  onChange={(e) => updateDispenser(index, 'fuelType', e.target.value)}
                  options={[
                    { value: 'PMS', label: 'PMS' },
                    { value: 'AGO', label: 'AGO' },
                  ]}
                />
                <Select
                  label="Mapped Tank"
                  name={`dispenser-tank-${index}`}
                  value={dispenser.tankId || '__unmapped__'}
                  onChange={(e) => updateDispenser(index, 'tankId', e.target.value === '__unmapped__' ? '' : e.target.value)}
                  options={[
                    { value: '__unmapped__', label: 'Unmapped' },
                    ...form.tanks.map((tank) => ({
                      value: tank._id,
                      label: `${tank.label || tank._id} (${tank.product})`,
                    })),
                  ]}
                  className="min-w-0"
                />
                <div className="space-y-4 md:col-span-2 xl:col-span-4 flex flex-col sm:flex-row sm:items-end gap-3">
                  <Select
                    label="Status"
                    name={`dispenser-status-${index}`}
                    value={dispenser.isActive ? 'true' : 'false'}
                    onChange={(e) => updateDispenser(index, 'isActive', e.target.value === 'true')}
                    options={[
                      { value: 'true', label: 'Active' },
                      { value: 'false', label: 'Inactive' },
                    ]}
                  />
                  <Button variant="danger" size="sm" onClick={() => removeDispenser(index)}>
                    Remove Pump
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Save Changes">
        <Input
          label="Reason for change"
          name="editReason"
          value={form.editReason}
          onChange={(e) => setForm((current) => ({ ...current, editReason: e.target.value }))}
          placeholder="Explain why this station configuration is being changed"
          helpText="This is required and will be written to the audit log."
        />
        <div className="mt-4 flex justify-end">
          <Button variant="primary" size="lg" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Station Configuration'}
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