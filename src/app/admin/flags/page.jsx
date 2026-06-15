'use client';

import { useEffect, useState } from 'react';
import Card from '@/components/Card';
import Select from '@/components/Select';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

const SEVERITY_COLORS = {
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-100 text-red-700',
};

const STATUS_COLORS = {
  open: 'bg-slate-100 text-slate-700',
  acknowledged: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
};

export default function AdminFlagsPage() {
  const [stations, setStations] = useState([]);
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStation, setFilterStation] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');

  const [fetchError, setFetchError] = useState('');

  // Per-flag action state: { [flagId]: { resolveOpen, resolutionNote, submitting, error } }
  const [actionState, setActionState] = useState({});

  useEffect(() => {
    fetchStations();
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [filterStation, filterStatus, filterSeverity]);

  const fetchStations = async () => {
    const res = await fetch('/api/stations');
    const data = await res.json();
    setStations(data.stations || []);
  };

  const fetchFlags = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const params = new URLSearchParams();
      if (filterStation) params.set('stationId', filterStation);
      if (filterStatus) params.set('status', filterStatus);
      if (filterSeverity) params.set('severity', filterSeverity);
      const res = await fetch(`/api/flags?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setFetchError(data.error || `Error ${res.status}`);
        setFlags([]);
      } else {
        setFlags(data.flags || []);
      }
    } catch (err) {
      setFetchError('Network error — could not reach server.');
      console.error('Error fetching flags:', err);
    } finally {
      setLoading(false);
    }
  };

  const setFlagAction = (flagId, updates) => {
    setActionState((prev) => ({
      ...prev,
      [flagId]: { ...(prev[flagId] || {}), ...updates },
    }));
  };

  const acknowledge = async (flagId) => {
    setFlagAction(flagId, { submitting: true, error: '' });
    try {
      const res = await fetch(`/api/flags/${flagId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'acknowledged' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFlagAction(flagId, { error: data.error || 'Failed to acknowledge', submitting: false });
        return;
      }
      setFlagAction(flagId, { submitting: false });
      fetchFlags();
    } catch {
      setFlagAction(flagId, { error: 'An error occurred', submitting: false });
    }
  };

  const resolve = async (flagId) => {
    const note = actionState[flagId]?.resolutionNote?.trim() || '';
    if (note.length < 3) {
      setFlagAction(flagId, { error: 'Resolution note must be at least 3 characters.' });
      return;
    }
    setFlagAction(flagId, { submitting: true, error: '' });
    try {
      const res = await fetch(`/api/flags/${flagId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved', resolutionNote: note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFlagAction(flagId, { error: data.error || 'Failed to resolve', submitting: false });
        return;
      }
      setFlagAction(flagId, { submitting: false, resolveOpen: false, resolutionNote: '' });
      fetchFlags();
    } catch {
      setFlagAction(flagId, { error: 'An error occurred', submitting: false });
    }
  };

  const openCount = flags.filter((f) => f.status === 'open').length;
  const criticalCount = flags.filter((f) => f.severity === 'critical' && f.status === 'open').length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auditor Flags</h1>
          <p className="text-sm text-slate-500 mt-1">
            Review and action flags raised by daily auditors.
          </p>
        </div>
        {openCount > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
              {openCount} open
            </span>
            {criticalCount > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                {criticalCount} critical
              </span>
            )}
          </div>
        )}
      </div>

      <Card title="Filters">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            label="Station"
            name="filterStation"
            value={filterStation}
            onChange={(e) => setFilterStation(e.target.value)}
            options={[
              { value: '', label: 'All Stations' },
              ...stations.map((s) => ({ value: s._id, label: s.name })),
            ]}
          />
          <Select
            label="Status"
            name="filterStatus"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'open', label: 'Open' },
              { value: 'acknowledged', label: 'Acknowledged' },
              { value: 'resolved', label: 'Resolved' },
            ]}
          />
          <Select
            label="Severity"
            name="filterSeverity"
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            options={[
              { value: '', label: 'All Severities' },
              { value: 'critical', label: 'Critical' },
              { value: 'warning', label: 'Warning' },
              { value: 'info', label: 'Info' },
            ]}
          />
        </div>
      </Card>

      {fetchError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{fetchError}</div>
      )}

      <Card title={`Flags ${flags.length > 0 ? `(${flags.length})` : ''}`}>
        {loading ? (
          <Loading />
        ) : flags.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">No flags found.</p>
        ) : (
          <div className="space-y-4">
            {flags.map((flag) => {
              const state = actionState[flag._id] || {};
              return (
                <div
                  key={flag._id}
                  className={`p-4 border rounded-xl ${flag.status === 'open' && flag.severity === 'critical' ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${SEVERITY_COLORS[flag.severity]}`}>
                          {flag.severity}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[flag.status]}`}>
                          {flag.status}
                        </span>
                        <span className="text-xs text-slate-400 capitalize">{flag.targetType.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs font-medium text-slate-600">{flag.stationName}</span>
                      </div>
                      <p className="text-sm font-medium text-slate-900">{flag.reason}</p>
                      {flag.additionalDetails && (
                        <p className="text-xs text-slate-500 mt-0.5">{flag.additionalDetails}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-slate-400">
                        {new Date(flag.createdAt).toLocaleDateString('en-NG')}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{new Date(flag.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 mt-2">Raised by: {flag.raisedByUserName}</p>

                  {flag.resolutionNote && (
                    <p className="text-xs text-emerald-700 mt-1 italic">
                      Resolution: {flag.resolutionNote}
                      {flag.resolvedByAdminName ? ` — ${flag.resolvedByAdminName}` : ''}
                    </p>
                  )}

                  {state.error && (
                    <p className="text-xs text-red-600 mt-2">{state.error}</p>
                  )}

                  {/* Actions */}
                  {flag.status !== 'resolved' && (
                    <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                      {/* Resolve form */}
                      {state.resolveOpen ? (
                        <div className="space-y-2">
                          <textarea
                            value={state.resolutionNote || ''}
                            onChange={(e) => setFlagAction(flag._id, { resolutionNote: e.target.value })}
                            rows={2}
                            placeholder="Enter resolution note (required)..."
                            className="w-full px-3 py-2 text-sm text-slate-900 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-ecana-maroon focus:ring-4 focus:ring-ecana-maroon/10 transition-all resize-none"
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => resolve(flag._id)}
                              disabled={state.submitting}
                            >
                              {state.submitting ? 'Saving...' : 'Confirm Resolve'}
                            </Button>
                            <button
                              onClick={() => setFlagAction(flag._id, { resolveOpen: false, resolutionNote: '', error: '' })}
                              className="text-xs text-slate-500 hover:text-slate-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          {flag.status === 'open' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => acknowledge(flag._id)}
                              disabled={state.submitting}
                            >
                              {state.submitting ? 'Saving...' : 'Acknowledge'}
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setFlagAction(flag._id, { resolveOpen: true, error: '' })}
                          >
                            Resolve
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
