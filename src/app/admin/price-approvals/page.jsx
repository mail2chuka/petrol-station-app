"use client";

import { useEffect, useState } from 'react';
import Card from '@/components/Card';
import Loading from '@/components/Loading';

function fmtN(n) {
  return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  return new Date(d).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

// ── Change Price Modal ─────────────────────────────────────────────────────────
function ChangePriceModal({ station, fuelType, currentPrice, onClose, onSaved }) {
  const [newPrice, setNewPrice] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    const val = parseFloat(newPrice);
    if (isNaN(val) || val < 0) { setError('Enter a valid price (0 or greater).'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/stations/${station._id}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId: station._id, fuelType, price: val, reason: reason.trim() || 'Admin price adjustment' }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to update price'); return; }
      onSaved();
      onClose();
    } catch {
      setError('Network error.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Change Price</h2>
            <p className="text-sm text-gray-500 mt-0.5">{station.name} — {fuelType}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm">
            <span className="text-gray-500">Current Price (₦/L)</span>
            <span className="font-bold text-gray-900">{fmtN(currentPrice)}</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">New Price (₦/L)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={newPrice}
              onChange={e => { setNewPrice(e.target.value); setError(''); }}
              placeholder="Enter new price"
              autoFocus
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:outline-none focus:border-ecana-maroon"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. DPR directive, market adjustment..."
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:outline-none focus:border-ecana-maroon resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-ecana-maroon text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Price'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function PriceChangesPage() {
  const [stations, setStations] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modal, setModal] = useState(null); // { station, fuelType, currentPrice }

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/stations');
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load stations'); return; }

      const active = (data.stations || []).filter(s => s.isActive !== false);
      setStations(active);

      // Load recent price history across all stations
      const histResults = await Promise.all(
        active.map(async s => {
          const r = await fetch(`/api/stations/${s._id}/prices?limit=20`);
          const d = await r.json().catch(() => ({}));
          return r.ok ? (d.priceRequests || []) : [];
        })
      );
      const merged = histResults.flat().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50);
      setHistory(merged);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  function openModal(station, fuelType, currentPrice) {
    setSuccess('');
    setModal({ station, fuelType, currentPrice });
  }

  async function handleSaved() {
    setSuccess('Price updated successfully.');
    await fetchAll();
  }

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Price Changes</h1>
        <p className="text-sm text-gray-500 mt-1">Set fuel prices per station. Only admins can change prices.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div>}

      {/* Station price cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {stations.map(station => {
          const prices = station.currentPrices || {};
          const fuelTypes = Object.keys(prices).length > 0 ? Object.keys(prices) : ['PMS', 'AGO'];
          return (
            <Card key={station._id} title={station.name}>
              <p className="text-xs text-gray-400 mb-3">{station.code} · {station.location}</p>
              <div className="space-y-2">
                {fuelTypes.map(fuel => (
                  <div key={fuel} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">{fuel}</p>
                      <p className="text-lg font-bold text-gray-900">₦{fmtN(prices[fuel])}<span className="text-xs font-normal text-gray-400">/L</span></p>
                    </div>
                    <button
                      onClick={() => openModal(station, fuel, prices[fuel] ?? 0)}
                      className="px-3 py-1.5 text-xs font-semibold bg-ecana-maroon text-white rounded-lg hover:opacity-90">
                      Change
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Recent history */}
      {history.length > 0 && (
        <Card title="Recent Price Changes">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="pb-2 pr-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="pb-2 pr-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Station</th>
                  <th className="pb-2 pr-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Fuel</th>
                  <th className="pb-2 pr-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Previous (₦/L)</th>
                  <th className="pb-2 pr-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">New (₦/L)</th>
                  <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Changed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((h, i) => (
                  <tr key={h._id || i} className="hover:bg-gray-50">
                    <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">{fmtDate(h.createdAt)}</td>
                    <td className="py-2.5 pr-4 font-medium text-gray-900">{h.stationName}</td>
                    <td className="py-2.5 pr-4 text-gray-700">{h.fuelType}</td>
                    <td className="py-2.5 pr-4 text-right text-gray-600">{fmtN(h.previousPrice)}</td>
                    <td className={`py-2.5 pr-4 text-right font-semibold ${h.newPrice > h.previousPrice ? 'text-red-600' : h.newPrice < h.previousPrice ? 'text-green-600' : 'text-gray-700'}`}>
                      {fmtN(h.newPrice)}
                    </td>
                    <td className="py-2.5 text-gray-600">{h.changedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modal && (
        <ChangePriceModal
          station={modal.station}
          fuelType={modal.fuelType}
          currentPrice={modal.currentPrice}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
