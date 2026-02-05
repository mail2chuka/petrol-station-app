'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Card from '@/components/Card';
import Table from '@/components/Table';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Loading from '@/components/Loading';

export default function StationsPage() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedStation, setSelectedStation] = useState(null);
  const [priceForm, setPriceForm] = useState({ pms: '', ago: '', reason: '', tolerancePercent: '' });
  const [savingPrices, setSavingPrices] = useState(false);
  const [deactivating, setDeactivating] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    location: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchStations();
  }, [includeInactive]);

  const fetchStations = async () => {
    try {
      const res = await fetch(`/api/stations${includeInactive ? '?includeInactive=true' : ''}`);
      const data = await res.json();
      setStations(data.stations || []);
    } catch (error) {
      console.error('Error fetching stations:', error);
    } finally {
      setLoading(false);
    }
  };

  const openPriceEditor = (station) => {
    setError('');
    setSuccess('');
    setSelectedStation(station);
    setPriceForm({
      pms: station?.currentPrices?.PMS ?? '',
      ago: station?.currentPrices?.AGO ?? '',
      reason: '',
      tolerancePercent: station?.tolerancePercent ?? 2.5,
    });
  };

  const savePrices = async () => {
    if (!selectedStation?._id) return;

    const pmsPrice = Number(priceForm.pms);
    const agoPrice = Number(priceForm.ago);
    const tolerancePercent = Number(priceForm.tolerancePercent);

    if (!Number.isFinite(pmsPrice) || pmsPrice <= 0 || !Number.isFinite(agoPrice) || agoPrice <= 0) {
      setError('Please enter valid positive prices for both PMS and AGO.');
      return;
    }

    if (!Number.isFinite(tolerancePercent) || tolerancePercent < 0) {
      setError('Please enter a valid tolerance percentage (0 or higher).');
      return;
    }

    setSavingPrices(true);
    setError('');
    setSuccess('');

    try {
      const updates = [];

      // Only call the API for values that changed
      if (pmsPrice !== (selectedStation.currentPrices?.PMS || 0)) {
        updates.push(
          fetch(`/api/stations/${selectedStation._id}/prices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stationId: selectedStation._id,
              fuelType: 'PMS',
              price: pmsPrice,
              reason: priceForm.reason || 'Price update',
            }),
          })
        );
      }

      if (agoPrice !== (selectedStation.currentPrices?.AGO || 0)) {
        updates.push(
          fetch(`/api/stations/${selectedStation._id}/prices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stationId: selectedStation._id,
              fuelType: 'AGO',
              price: agoPrice,
              reason: priceForm.reason || 'Price update',
            }),
          })
        );
      }

      if (updates.length === 0) {
        setSuccess('No changes to save.');
        return;
      }

      await fetch(`/api/stations/${selectedStation._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tolerancePercent }),
      });

      const results = await Promise.all(updates);
      const failed = results.find((r) => !r.ok);
      if (failed) {
        const data = await failed.json().catch(() => ({}));
        setError(data.error || 'Failed to update prices');
        return;
      }

      setSuccess('Prices updated successfully.');
      setSelectedStation(null);
      await fetchStations();
    } catch (e) {
      setError('An error occurred while updating prices.');
    } finally {
      setSavingPrices(false);
    }
  };

  const deactivateStation = async (station) => {
    if (!station?._id) return;
    const ok = window.confirm(`Deactivate station "${station.name}"? This will hide it from normal views.`);
    if (!ok) return;

    setDeactivating(station._id);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/stations/${station._id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to deactivate station');
        return;
      }
      setSuccess('Station deactivated.');
      await fetchStations();
    } catch (e) {
      setError('An error occurred while deactivating the station.');
    } finally {
      setDeactivating(null);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess('Station created successfully!');
        setFormData({ name: '', code: '', location: '' });
        setShowForm(false);
        fetchStations();
      } else {
        setError(data.error || 'Failed to create station');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    }
  };

  const columns = [
    { header: 'Station', render: (row) => (
      <div>
        <p className="font-semibold text-gray-900">{row.name}</p>
        <p className="text-xs text-gray-500">{row.code} • {row.location}</p>
      </div>
    )},
    { 
      header: 'PMS Price', 
      render: (row) => `₦${row.currentPrices?.PMS?.toFixed(2) || '0.00'}`
    },
    { 
      header: 'AGO Price', 
      render: (row) => `₦${row.currentPrices?.AGO?.toFixed(2) || '0.00'}`
    },
    { 
      header: 'PMS Stock', 
      render: (row) => `${row.currentStock?.PMS?.toFixed(2) || '0.00'}L`
    },
    { 
      header: 'AGO Stock', 
      render: (row) => `${row.currentStock?.AGO?.toFixed(2) || '0.00'}L`
    },
    {
      header: 'Actions',
      render: (row) => (
        <div className="flex gap-2">
          <Link
            href={`/manager?stationId=${row._id}`}
            className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold border border-ecana-blue/30 text-ecana-blue hover:bg-ecana-blue/10 transition-colors"
          >
            Manage
          </Link>
          <Button size="sm" variant="outline" onClick={() => openPriceEditor(row)}>
            Set Prices
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={!row.isActive || deactivating === row._id}
            onClick={() => deactivateStation(row)}
          >
            {row.isActive ? (deactivating === row._id ? 'Deactivating...' : 'Deactivate') : 'Inactive'}
          </Button>
        </div>
      )
    },
  ];

  if (loading) return <Loading />;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Stations</h1>
          <p className="text-sm text-gray-600 mt-1">Create stations, set prices, and manage status.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={showForm ? 'secondary' : 'primary'} onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Close' : 'Create Station'}
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="Search"
            name="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, code, or location"
          />
          <Select
            label="Show"
            name="includeInactive"
            value={includeInactive ? 'all' : 'active'}
            onChange={(e) => setIncludeInactive(e.target.value === 'all')}
            options={[
              { value: 'active', label: 'Active only' },
              { value: 'all', label: 'Active + Inactive' },
            ]}
          />
          <div className="hidden sm:block" />
        </div>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl mb-4">
          {success}
        </div>
      )}

      {selectedStation && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close price editor"
            onClick={() => setSelectedStation(null)}
          />
          <div className="absolute left-0 right-0 bottom-0 sm:bottom-auto sm:top-24 sm:left-1/2 sm:-translate-x-1/2 sm:w-[520px] rounded-t-2xl sm:rounded-2xl bg-white shadow-xl">
            <div className="p-4 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-600">Set prices for</p>
                  <p className="text-lg font-bold text-gray-900">{selectedStation.name}</p>
                </div>
                <Button variant="secondary" onClick={() => setSelectedStation(null)}>
                  Close
                </Button>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="PMS Price (₦/L)"
                  type="number"
                  name="pms"
                  value={priceForm.pms}
                  onChange={(e) => setPriceForm((p) => ({ ...p, pms: e.target.value }))}
                  step="0.01"
                  min="0"
                  required
                />
                <Input
                  label="AGO Price (₦/L)"
                  type="number"
                  name="ago"
                  value={priceForm.ago}
                  onChange={(e) => setPriceForm((p) => ({ ...p, ago: e.target.value }))}
                  step="0.01"
                  min="0"
                  required
                />
                <Input
                  label="Tolerance (%)"
                  type="number"
                  name="tolerancePercent"
                  value={priceForm.tolerancePercent}
                  onChange={(e) => setPriceForm((p) => ({ ...p, tolerancePercent: e.target.value }))}
                  step="0.1"
                  min="0"
                />
              </div>

              <Input
                label="Reason (optional)"
                name="reason"
                value={priceForm.reason}
                onChange={(e) => setPriceForm((p) => ({ ...p, reason: e.target.value }))}
                placeholder="e.g., NNPCL price update"
              />

              <div className="mt-2 flex gap-2">
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={savingPrices}
                  onClick={savePrices}
                >
                  {savingPrices ? 'Saving...' : 'Save Prices'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <Card title="Create New Station" className="mb-6">
          <form onSubmit={handleSubmit}>
            <Input
              label="Station Name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., Main Street Station"
              required
            />
            <Input
              label="Station Code"
              name="code"
              value={formData.code}
              onChange={handleChange}
              placeholder="e.g., MSS01"
              required
            />
            <Input
              label="Location"
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder="e.g., 123 Main Street, Lagos"
              required
            />
            <Button type="submit" variant="primary" fullWidth size="lg">
              Create Station
            </Button>
          </form>
        </Card>
      )}

      <Card title="All Stations">
        <Table
          columns={columns}
          data={stations.filter((s) => {
            if (!query.trim()) return true;
            const q = query.toLowerCase();
            return (
              String(s.name || '').toLowerCase().includes(q) ||
              String(s.code || '').toLowerCase().includes(q) ||
              String(s.location || '').toLowerCase().includes(q)
            );
          })}
        />
      </Card>
    </div>
  );
}
