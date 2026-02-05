'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/Card';
import Table from '@/components/Table';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

export default function AuditLogsPage() {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState('100');

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/audit?limit=${limit}`);
      const data = await res.json();
      setAuditLogs(data.auditLogs || []);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { 
      header: 'Timestamp', 
      render: (row) => new Date(row.timestamp).toLocaleString()
    },
    { header: 'User', field: 'userName' },
    { 
      header: 'Role', 
      render: (row) => <span className="capitalize">{row.userRole}</span>
    },
    { 
      header: 'Action', 
      render: (row) => <span className="capitalize">{row.action.replace('_', ' ')}</span>
    },
    { 
      header: 'Resource', 
      render: (row) => <span className="capitalize">{row.resource.replace('_', ' ')}</span>
    },
    { header: 'Station', field: 'stationName' },
  ];

  if (loading) return <Loading />;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Audit Logs</h1>

      <Card title="Filter Options" className="mb-6">
        <div className="flex gap-4">
          <Input
            label="Number of Records"
            type="number"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            min="10"
            max="500"
            className="flex-1"
          />
          <div className="flex items-end">
            <Button onClick={fetchAuditLogs}>Refresh</Button>
          </div>
        </div>
      </Card>

      <Card title={`Recent Activity (${auditLogs.length} records)`}>
        <Table columns={columns} data={auditLogs} />
      </Card>
    </div>
  );
}
