'use client';

import { useEffect, useMemo, useState } from 'react';
import Card from '@/components/Card';
import Table from '@/components/Table';
import Input from '@/components/Input';
import Loading from '@/components/Loading';

const STAFF_ROLES = ['manager', 'cashier', 'supervisor'];

export default function StaffPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    try {
      const res = await fetch('/api/users?includeInactive=true');
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching staff:', error);
    } finally {
      setLoading(false);
    }
  };

  const staffUsers = useMemo(() => {
    const filtered = (users || []).filter((u) => STAFF_ROLES.includes(u.role));
    if (!query.trim()) return filtered;
    const q = query.toLowerCase();
    return filtered.filter((u) =>
      String(u.name || '').toLowerCase().includes(q) ||
      String(u.email || '').toLowerCase().includes(q)
    );
  }, [users, query]);

  const columns = [
    {
      header: 'Staff',
      render: (row) => (
        <div>
          <p className="font-semibold text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">{row.email}</p>
        </div>
      ),
    },
    {
      header: 'Role',
      render: (row) => <span className="capitalize">{row.role}</span>,
    },
    { header: 'Station', field: 'stationName' },
    {
      header: 'Status',
      render: (row) => (
        <span className={`px-2 py-1 rounded text-sm ${row.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {row.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ];

  if (loading) return <Loading />;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Staff</h1>
          <p className="text-sm text-gray-600 mt-1">Managers, cashiers, and supervisors.</p>
        </div>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="Search"
            name="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email"
          />
        </div>
      </Card>

      <Card title="Staff List">
        <Table columns={columns} data={staffUsers} emptyMessage="No staff found" />
      </Card>
    </div>
  );
}
