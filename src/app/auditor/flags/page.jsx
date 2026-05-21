'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Select from '@/components/Select';
import Input from '@/components/Input';
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

export default function AuditorFlagsPage() {
  const { data: session } = useSession();
  const isDailyAuditor = session?.user?.role === 'daily_auditor';

  const [stations, setStations] = useState([]);
  const [flags, setFlags] = useState([]);
  const [loadingFlags, setLoadingFlags] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');

  const [form, setForm] = useState({
    stationId: '',
    targetType: 'general',
    severity: 'warning',
    reason: '',
    additionalDetails: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  useEffect(() => {
    fetchStations();
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [filterStatus, filterSeverity]);

  const fetchStations = async () => {
    const res = await fetch('/api/stations');
    const data = await res.json();
    setStations(data.stations || []);
    if (data.stations?.length > 0) {
      setForm((prev) => ({ ...prev, stationId: data.stations[0]._id }));
    }
  };

  const fetchFlags = async () => {
    setLoadingFlags(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterSeverity) params.set('severity', filterSeverity);
      const res = await fetch(`/api/flags?${params.toString()}`);
      const data = await res.json();
      setFlags(data.flags || []);
    } catch (err) {
      console.error('Error fetching flags:', err);
    } finally {
      setLoadingFlags(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.reason.trim() || form.reason.trim().length < 5) {
      setFormError('Reason must be at least 5 characters.');
      return;
    }
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: form.stationId,
          targetType: form.targetType,
          severity: form.severity,
          reason: form.reason.trim(),
          additionalDetails: form.additionalDetails.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Failed to raise flag');
        return;
      }
      setFormSuccess('Flag raised successfully.');
      setForm((prev) => ({ ...prev, reason: '', additionalDetails: '', targetType: 'general', severity: 'warning' }));
      fetchFlags();
    } catch (err) {
      setFormError('An error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Flags</h1>
        <p className="text-sm text-slate-500 mt-1">
          {isDailyAuditor
            ? 'Raise flags for inconsistencies and view all raised flags.'
            : 'View all raised flags and their resolution status.'}
        </p>
      </div>

      {/* Raise flag form — only for daily_auditor */}
      {isDailyAuditor && (
        <Card title="Raise a Flag">
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            {formSuccess && <p className="text-sm text-green-600">{formSuccess}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Select
                label="Station"
                name="stationId"
                value={form.stationId}
                onChange={(e) => setForm((prev) => ({ ...prev, stationId: e.target.value }))}
                options={stations.map((s) => ({ value: s._id, label: s.name }))}
              />
              <Select
                label="Target Type"
                name="targetType"
                value={form.targetType}
                onChange={(e) => setForm((prev) => ({ ...prev, targetType: e.target.value }))}
                options={[
                  { value: 'general', label: 'General' },
                  { value: 'meter_reading', label: 'Meter Reading' },
                  { value: 'tank_stock', label: 'Tank Stock' },
                  { value: 'sales', label: 'Sales' },
                  { value: 'payment', label: 'Payment' },
                  { value: 'stock_movement', label: 'Stock Movement' },
                ]}
              />
              <Select
                label="Severity"
                name="severity"
                value={form.severity}
                onChange={(e) => setForm((prev) => ({ ...prev, severity: e.target.value }))}
                options={[
                  { value: 'info', label: 'Info' },
                  { value: 'warning', label: 'Warning' },
                  { value: 'critical', label: 'Critical' },
                ]}
              />
            </div>

            <Input
              label="Reason"
              name="reason"
              value={form.reason}
              onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="Describe the inconsistency or issue..."
              required
            />

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Additional Details (Optional)</label>
              <textarea
                value={form.additionalDetails}
                onChange={(e) => setForm((prev) => ({ ...prev, additionalDetails: e.target.value }))}
                rows="3"
                className="w-full px-4 py-3 text-sm text-slate-900 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-ecana-maroon focus:ring-4 focus:ring-ecana-maroon/10 transition-all resize-none"
                placeholder="Any extra context, figures, or references..."
              />
            </div>

            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Raising Flag...' : 'Raise Flag'}
            </Button>
          </form>
        </Card>
      )}

      {/* Flag list */}
      <Card title="All Flags">
        <div className="flex flex-wrap gap-3 mb-4 print:hidden">
          <Select
            label="Filter by Status"
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
            label="Filter by Severity"
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

        {loadingFlags ? (
          <Loading />
        ) : flags.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No flags found.</p>
        ) : (
          <div className="space-y-3">
            {flags.map((flag) => (
              <div key={flag._id} className="p-4 border border-slate-100 rounded-xl bg-slate-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${SEVERITY_COLORS[flag.severity]}`}>
                        {flag.severity}
                      </span>
                      <span className="text-xs text-slate-400 capitalize">{flag.targetType.replace('_', ' ')}</span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-400">{flag.stationName}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-900">{flag.reason}</p>
                    {flag.additionalDetails && (
                      <p className="text-xs text-slate-500 mt-0.5">{flag.additionalDetails}</p>
                    )}
                    {flag.resolutionNote && (
                      <p className="text-xs text-slate-500 mt-1 italic">Resolution: {flag.resolutionNote}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[flag.status]}`}>
                      {flag.status}
                    </span>
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(flag.createdAt).toLocaleDateString('en-NG')}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-2">Raised by: {flag.raisedByUserName}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
