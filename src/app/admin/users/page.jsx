'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/Card';
import Table from '@/components/Table';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Loading from '@/components/Loading';
import { useSession } from 'next-auth/react';

export default function UsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [query, setQuery] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    role: '',
    stationId: '',
    isActive: true,
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [hardDeletingId, setHardDeletingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: '',
    stationId: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchData();
  }, [includeInactive]);

  const fetchData = async () => {
    try {
      const [usersRes, stationsRes] = await Promise.all([
        fetch(`/api/users${includeInactive ? '?includeInactive=true' : ''}`),
        fetch('/api/stations'),
      ]);

      const usersData = await usersRes.json();
      const stationsData = await stationsRes.json();

      setUsers(usersData.users || []);
      setStations(stationsData.stations || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
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
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess('User created successfully!');
        setFormData({ name: '', email: '', password: '', role: '', stationId: '' });
        setShowForm(false);
        fetchData();
      } else {
        setError(data.error || 'Failed to create user');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    }
  };

  const roleOptions = [
    { value: 'manager', label: 'Manager' },
    { value: 'accountant', label: 'Accountant' },
    { value: 'attendant', label: 'Attendant' },
    { value: 'auditor', label: 'Auditor' },
  ];

  const stationOptions = stations.map(s => ({
    value: s._id,
    label: `${s.name} (${s.code})`,
  }));

  const openEdit = (user) => {
    setError('');
    setSuccess('');
    setEditingUser(user);
    setEditForm({
      name: user?.name || '',
      email: user?.email || '',
      role: user?.role || '',
      stationId: user?.stationId || '',
      isActive: user?.isActive !== false,
    });
  };

  const saveEdit = async () => {
    if (!editingUser?._id) return;

    setSavingEdit(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        stationId: editForm.role === 'admin' || editForm.role === 'auditor' ? null : editForm.stationId,
        isActive: editForm.isActive,
      };

      const res = await fetch(`/api/users/${editingUser._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to update user');
        return;
      }

      setSuccess('User updated.');
      setEditingUser(null);
      await fetchData();
    } catch (e) {
      setError('An error occurred while updating the user.');
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleActive = async (user) => {
    if (!user?._id) return;
    if (session?.user?.id && user._id === session.user.id) {
      setError('You cannot deactivate your own account.');
      return;
    }

    const nextActive = !user.isActive;
    const ok = window.confirm(`${nextActive ? 'Activate' : 'Deactivate'} user "${user.name}"?`);
    if (!ok) return;

    setDeletingId(user._id);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/users/${user._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextActive }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to update user status');
        return;
      }

      if (!nextActive) {
        setIncludeInactive(true);
        setSuccess('User deactivated. Inactive users are now visible.');
      } else {
        setSuccess('User activated.');
      }
      await fetchData();
    } catch (e) {
      setError('An error occurred while updating user status.');
    } finally {
      setDeletingId(null);
    }
  };

  const hardDelete = async (user) => {
    if (!user?._id) return;

    const ok = window.confirm(`Permanently delete user "${user.name}"? This cannot be undone.`);
    if (!ok) return;

    setHardDeletingId(user._id);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/users/${user._id}?hard=true`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to delete user');
        return;
      }
      setSuccess('User deleted.');
      await fetchData();
    } catch (e) {
      setError('An error occurred while deleting the user.');
    } finally {
      setHardDeletingId(null);
    }
  };

  const columns = [
    { header: 'User', render: (row) => (
      <div>
        <p className="font-semibold text-gray-900">{row.name}</p>
        <p className="text-xs text-gray-500">{row.email}</p>
      </div>
    )},
    { 
      header: 'Role', 
      render: (row) => <span className="capitalize">{row.role}</span>
    },
    { header: 'Station', field: 'stationName' },
    { 
      header: 'Status', 
      render: (row) => (
        <span className={`px-2 py-1 rounded text-sm ${row.isActive !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {row.isActive !== false ? 'Active' : 'Inactive'}
        </span>
      )
    },
    {
      header: 'Actions',
      render: (row) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant={row.isActive ? 'danger' : 'success'}
            disabled={deletingId === row._id || (session?.user?.id && row._id === session.user.id)}
            onClick={() => toggleActive(row)}
          >
            {deletingId === row._id ? 'Working...' : row.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={hardDeletingId === row._id}
            onClick={() => hardDelete(row)}
          >
            {hardDeletingId === row._id ? 'Deleting...' : 'Delete Permanently'}
          </Button>
        </div>
      )
    }
  ];

  if (loading) return <Loading />;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-600 mt-1">Create, edit, and deactivate users.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={showForm ? 'secondary' : 'primary'} onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Close' : 'Create User'}
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
            placeholder="Search name or email"
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

      {editingUser && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close edit user"
            onClick={() => setEditingUser(null)}
          />
          <div className="absolute left-0 right-0 bottom-0 sm:bottom-auto sm:top-24 sm:left-1/2 sm:-translate-x-1/2 sm:w-[560px] rounded-t-2xl sm:rounded-2xl bg-white shadow-xl">
            <div className="p-4 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-600">Edit user</p>
                  <p className="text-lg font-bold text-gray-900">{editingUser.name}</p>
                </div>
                <Button variant="secondary" onClick={() => setEditingUser(null)}>
                  Close
                </Button>
              </div>

              <div className="mt-4">
                <Input
                  label="Full Name"
                  name="name"
                  value={editForm.name}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
                <Input
                  label="Email"
                  type="email"
                  name="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                  required
                />
                <Select
                  label="Role"
                  name="role"
                  value={editForm.role}
                  onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
                  options={[
                    { value: 'admin', label: 'Admin' },
                    ...roleOptions,
                  ]}
                  required
                />

                {editForm.role && !['admin', 'auditor'].includes(editForm.role) && (
                  <Select
                    label="Station"
                    name="stationId"
                    value={editForm.stationId || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, stationId: e.target.value }))}
                    options={stationOptions}
                    required
                  />
                )}

                <Select
                  label="Account Status"
                  name="isActive"
                  value={editForm.isActive ? 'active' : 'inactive'}
                  onChange={(e) => setEditForm((p) => ({ ...p, isActive: e.target.value === 'active' }))}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                  ]}
                  required
                />

                <div className="mt-2">
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    disabled={savingEdit}
                    onClick={saveEdit}
                  >
                    {savingEdit ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <Card title="Create New User" className="mb-6">
          <form onSubmit={handleSubmit}>
            <Input
              label="Full Name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., John Doe"
              required
            />
            <Input
              label="Email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="e.g., john@example.com"
              required
            />
            <Input
              label="Password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Minimum 6 characters"
              required
            />
            <Select
              label="Role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              options={roleOptions}
              required
            />
            {formData.role && !['admin', 'auditor'].includes(formData.role) && (
              <Select
                label="Station"
                name="stationId"
                value={formData.stationId}
                onChange={handleChange}
                options={stationOptions}
                required
              />
            )}
            <Button type="submit" variant="primary" fullWidth size="lg">
              Create User
            </Button>
          </form>
        </Card>
      )}

      <Card title="All Users">
        <Table
          columns={columns}
          data={users.filter((u) => {
            if (!query.trim()) return true;
            const q = query.toLowerCase();
            return (
              String(u.name || '').toLowerCase().includes(q) ||
              String(u.email || '').toLowerCase().includes(q)
            );
          })}
        />
      </Card>
    </div>
  );
}
