'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Table from '@/components/Table';
import { PageLoader } from '@/components/Loading';
import PasswordResetModal from '@/components/PasswordResetModal';

export default function AdminMaterialsStaffPage() {
  const { data: session, status } = useSession();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', loginId: '', password: '', role: 'staff', phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [deactivating, setDeactivating] = useState(null);
  const [generatingIds, setGeneratingIds] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', loginId: '', phone: '', role: 'staff' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resettingPassword, setResettingPassword] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/materials/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers((data.users || []).filter((u) => u.role !== 'customer'));
    } catch (err) {
      setError(err.message || 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'loading' || !session) return;
    fetchUsers();
  }, [session, status, fetchUsers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/materials/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Staff account created');
      setFormData({ name: '', email: '', loginId: '', password: '', role: 'staff', phone: '' });
      setShowForm(false);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (user) => {
    if (!confirm(`Deactivate "${user.name}"?`)) return;
    setDeactivating(user._id);
    try {
      const res = await fetch(`/api/materials/users/${user._id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('User deactivated');
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeactivating(null);
    }
  };

  const generateMissingLoginIds = async () => {
    setGeneratingIds(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/materials/users/generate-login-ids', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Generated login IDs for ${data.updated || 0} user(s).`);
      fetchUsers();
    } catch (err) {
      setError(err.message || 'Failed to generate login IDs');
    } finally {
      setGeneratingIds(false);
    }
  };

  const resetPassword = async (newPassword) => {
    if (!resetTarget?._id) return;
    setResettingPassword(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/materials/users/${resetTarget._id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Password reset for ${resetTarget.name}.`);
      setResetTarget(null);
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setEditForm({
      name: user.name || '',
      email: user.email || '',
      loginId: user.loginId || '',
      phone: user.phone || '',
      role: user.role || 'staff',
    });
  };

  const saveEdit = async () => {
    if (!editingUser?._id) return;
    setSavingEdit(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/materials/users/${editingUser._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Staff account updated');
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.message || 'Failed to update staff');
    } finally {
      setSavingEdit(false);
    }
  };

  if (status === 'loading') return <PageLoader />;

  const roleOptions = [
    { value: 'staff', label: 'Staff' },
    { value: 'auditor', label: 'Auditor' },
    { value: 'admin', label: 'Admin' },
  ];

  const columns = [
    { header: 'Name', render: (r) => r.name },
    {
      header: 'Login',
      render: (r) => (
        <div>
          <div>{r.email}</div>
          {r.loginId && <div className="text-xs text-slate-500">ID: {r.loginId}</div>}
        </div>
      ),
    },
    { header: 'Role', render: (r) => <span className="capitalize">{r.role}</span> },
    { header: 'Phone', render: (r) => r.phone || '—' },
    {
      header: 'Action',
      render: (r) =>
        session?.user?.id !== r._id ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
              Edit
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setResetTarget(r)}>
              Reset Password
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={deactivating === r._id}
              onClick={() => handleDeactivate(r)}
            >
              Deactivate
            </Button>
          </div>
        ) : (
          <span className="text-xs text-slate-400">You</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Materials Staff</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={generateMissingLoginIds} disabled={generatingIds}>
            {generatingIds ? 'Generating IDs...' : 'Generate Missing User IDs'}
          </Button>
          <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ New Staff'}</Button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</div>}
      {success && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl">{success}</div>}

      {showForm && (
        <Card title="New Staff Account" className="border border-slate-200">
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Full Name" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} required />
            <Input label="Email" type="email" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} required />
            <Input label="Login ID (optional)" value={formData.loginId} onChange={(e) => setFormData((p) => ({ ...p, loginId: e.target.value }))} />
            <Input label="Password" type="password" value={formData.password} onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))} required />
            <Input label="Phone" value={formData.phone} onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))} />
            <Select label="Role" value={formData.role} onChange={(e) => setFormData((p) => ({ ...p, role: e.target.value }))} options={roleOptions} />
            <div className="sm:col-span-2">
              <Button type="submit" isLoading={submitting}>Create Account</Button>
            </div>
          </form>
        </Card>
      )}

      <Table columns={columns} data={users} loading={loading} emptyMessage="No staff found" />

      {editingUser && (
        <Card title={`Edit Staff: ${editingUser.name}`} className="border border-slate-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Full Name" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} required />
            <Input label="Email" type="email" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} required />
            <Input label="Login ID" value={editForm.loginId} onChange={(e) => setEditForm((p) => ({ ...p, loginId: e.target.value }))} />
            <Input label="Phone" value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} />
            <Select label="Role" value={editForm.role} onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))} options={roleOptions} />
            <div className="sm:col-span-2 flex gap-2">
              <Button isLoading={savingEdit} onClick={saveEdit}>Save Changes</Button>
              <Button variant="secondary" onClick={() => setEditingUser(null)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      <PasswordResetModal
        isOpen={Boolean(resetTarget)}
        targetName={resetTarget?.name}
        onClose={() => setResetTarget(null)}
        onSubmit={resetPassword}
        isLoading={resettingPassword}
      />
    </div>
  );
}
