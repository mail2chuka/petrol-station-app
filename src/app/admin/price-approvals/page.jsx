"use client";

import { useEffect, useState } from 'react';
import Card from '@/components/Card';
import Input, { Textarea } from '@/components/Input';
import Button from '@/components/Button';
import Table, { TableAction, TableBadge } from '@/components/Table';
import Loading from '@/components/Loading';

export default function AdminPriceApprovalsPage() {
  const [loading, setLoading] = useState(true);
  const [stations, setStations] = useState([]);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [decision, setDecision] = useState({ status: 'approved', adminNote: '' });
  const [savingDecision, setSavingDecision] = useState(false);

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  const fetchPendingRequests = async () => {
    try {
      setLoading(true);
      const stationsRes = await fetch('/api/stations');
      const stationsData = await stationsRes.json();

      if (!stationsRes.ok) {
        setError(stationsData.error || 'Failed to load stations');
        return;
      }

      const activeStations = (stationsData.stations || []).filter((station) => station.isActive !== false);
      setStations(activeStations);

      const requestResults = await Promise.all(
        activeStations.map(async (station) => {
          const res = await fetch(`/api/stations/${station._id}/prices?status=pending&limit=50`);
          const data = await res.json().catch(() => ({}));
          return res.ok ? (data.priceRequests || []) : [];
        })
      );

      const mergedRequests = requestResults.flat().sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
      setRequests(mergedRequests);
      setError('');
    } catch (fetchError) {
      setError('Failed to load pending price approvals');
    } finally {
      setLoading(false);
    }
  };

  const submitDecision = async () => {
    if (!selectedRequest?._id) return;
    if (!decision.adminNote || decision.adminNote.trim().length < 3) {
      setError('Admin note must be at least 3 characters.');
      return;
    }

    setSavingDecision(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/stations/${selectedRequest.stationId}/prices/${selectedRequest._id}/approval`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: decision.status,
          adminNote: decision.adminNote.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to process price request');
        return;
      }

      setSuccess(data.message || 'Price request processed successfully.');
      setSelectedRequest(null);
      setDecision({ status: 'approved', adminNote: '' });
      await fetchPendingRequests();
    } catch (submitError) {
      setError('Failed to process price request');
    } finally {
      setSavingDecision(false);
    }
  };

  const columns = [
    { header: 'Station', field: 'stationName' },
    { header: 'Fuel', field: 'fuelType' },
    { header: 'Current', render: (row) => `N${Number(row.previousPrice || 0).toFixed(2)}` },
    { header: 'Requested', render: (row) => `N${Number(row.newPrice || 0).toFixed(2)}` },
    { header: 'Requested By', field: 'changedByName' },
    { header: 'Status', render: () => <TableBadge variant="warning">pending</TableBadge> },
    { header: 'Action', render: (row) => (
      <TableAction variant="primary" onClick={() => {
        setSelectedRequest(row);
        setDecision({ status: 'approved', adminNote: '' });
      }}>
        Review
      </TableAction>
    ) },
  ];

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Price Approvals</h1>
        <p className="mt-2 text-sm text-gray-600">Review pending manager requests for regulated mid-day price changes.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-800">{success}</div>}

      <Card title="Pending Requests" subtitle={`${requests.length} pending across ${stations.length} active stations`}>
        <Table columns={columns} data={requests} emptyMessage="No pending price approvals" />
      </Card>

      {selectedRequest && (
        <Card title="Review Request">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Station" name="station" value={selectedRequest.stationName} disabled />
            <Input label="Fuel Type" name="fuelType" value={selectedRequest.fuelType} disabled />
            <Input label="Current Price" name="previousPrice" value={`N${Number(selectedRequest.previousPrice || 0).toFixed(2)}`} disabled />
            <Input label="Requested Price" name="newPrice" value={`N${Number(selectedRequest.newPrice || 0).toFixed(2)}`} disabled />
            <Input label="Requested By" name="requestedBy" value={selectedRequest.changedByName} disabled />
            <Input label="Requested At" name="requestedAt" value={new Date(selectedRequest.createdAt).toLocaleString()} disabled />
          </div>
          <div className="mt-4">
            <Textarea label="Manager Reason" name="reason" value={selectedRequest.reason || ''} disabled rows={3} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-slate-700 mb-1.5">Decision</label>
              <select
                id="status"
                value={decision.status}
                onChange={(e) => setDecision((current) => ({ ...current, status: e.target.value }))}
                className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:border-ecana-maroon focus:ring-4 focus:ring-ecana-maroon/10"
              >
                <option value="approved">Approve</option>
                <option value="rejected">Reject</option>
              </select>
            </div>
            <Textarea
              label="Admin Note"
              name="adminNote"
              value={decision.adminNote}
              onChange={(e) => setDecision((current) => ({ ...current, adminNote: e.target.value }))}
              rows={3}
              placeholder="State the regulatory source or reason for your decision"
            />
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setSelectedRequest(null)}>Cancel</Button>
            <Button variant="primary" onClick={submitDecision} disabled={savingDecision}>
              {savingDecision ? 'Saving...' : decision.status === 'approved' ? 'Approve Request' : 'Reject Request'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}