'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Table from '@/components/Table';
import { PageLoader } from '@/components/Loading';
import PasswordResetModal from '@/components/PasswordResetModal';

export default function AdminMaterialsCustomersPage() {
  const { data: session, status } = useSession();
  const [customers, setCustomers] = useState([]);
  const [customerUsers, setCustomerUsers] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [flagging, setFlagging] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    creditLimit: '',
    loginId: '',
    password: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [flagForm, setFlagForm] = useState({ id: null, reason: '' });
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', address: '', creditLimit: '' });
  const [creditTarget, setCreditTarget] = useState(null);
  const [creditForm, setCreditForm] = useState({ amount: '', method: 'cash', reference: '', notes: '' });
  const [crediting, setCrediting] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resettingPassword, setResettingPassword] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const [customersRes, usersRes] = await Promise.all([
        fetch(`/api/materials/customers?${params}`),
        fetch('/api/materials/users?role=customer'),
      ]);

      const [customersData, usersData] = await Promise.all([customersRes.json(), usersRes.json()]);
      if (!customersRes.ok) throw new Error(customersData.error);
      if (!usersRes.ok) throw new Error(usersData.error);

      const usersByCustomerId = {};
      (usersData.users || []).forEach((u) => {
        if (u.customerId) usersByCustomerId[String(u.customerId)] = u;
      });

      setCustomerUsers(usersByCustomerId);
      setCustomers(customersData.customers || []);
    } catch (err) {
      setError(err.message || 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (status === 'loading' || !session) return;
    fetchCustomers();
  }, [session, status, fetchCustomers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      if (!formData.email || !formData.password) {
        throw new Error('Email and password are required for customer login.');
      }

      const res = await fetch('/api/materials/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Customer account created. Login ID: ${data.loginId || 'auto-generated'}`);
      setFormData({ name: '', phone: '', email: '', address: '', creditLimit: '', loginId: '', password: '' });
      setShowForm(false);
      fetchCustomers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFlag = async (customer) => {
    if (!customer.isFlagged && !flagForm.reason) {
      setFlagForm({ id: customer._id, reason: '' });
      return;
    }
    setFlagging(customer._id);
    try {
      const res = await fetch(`/api/materials/customers/${customer._id}/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag: !customer.isFlagged, reason: flagForm.reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFlagForm({ id: null, reason: '' });
      setSuccess(customer.isFlagged ? 'Customer unflagged' : 'Customer flagged');
      fetchCustomers();
    } catch (err) {
      setError(err.message);
    } finally {
      setFlagging(null);
    }
  };

  const openEdit = (customer) => {
    setEditingCustomer(customer);
    setEditForm({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      creditLimit: customer.creditLimit ?? 0,
    });
  };

  const saveEdit = async () => {
    if (!editingCustomer?._id) return;
    setSavingEdit(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/materials/customers/${editingCustomer._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Customer updated');
      setEditingCustomer(null);
      fetchCustomers();
    } catch (err) {
      setError(err.message || 'Failed to update customer');
    } finally {
      setSavingEdit(false);
    }
  };

  const resetCustomerPassword = async (newPassword) => {
    const customer = resetTarget;
    const linkedUser = customer ? customerUsers[customer._id] : null;
    if (!linkedUser?._id) {
      setError('No linked login account found for this customer.');
      return;
    }

    setResettingPassword(true);
    try {
      const res = await fetch(`/api/materials/users/${linkedUser._id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Password reset for ${customer.name}.`);
      setResetTarget(null);
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  const creditCustomer = async () => {
    if (!creditTarget?._id) return;
    setCrediting(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/materials/topups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: creditTarget._id,
          amount: Number(creditForm.amount),
          method: creditForm.method,
          reference: creditForm.reference,
          notes: creditForm.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Customer credited successfully. New balance: ₦${(data.newBalance || 0).toLocaleString()}`);
      setCreditTarget(null);
      setCreditForm({ amount: '', method: 'cash', reference: '', notes: '' });
      fetchCustomers();
    } catch (err) {
      setError(err.message || 'Failed to credit customer');
    } finally {
      setCrediting(false);
    }
  };

  const createCustomerLogin = async (customer) => {
    const linkedUser = customerUsers[customer._id];
    if (linkedUser?._id) {
      setError('This customer already has a login account.');
      return;
    }

    if (!customer.email) {
      setError('Customer email is required before creating login. Edit customer and add email first.');
      return;
    }

    const newPassword = window.prompt(`Set initial password for ${customer.name} (min 6 chars):`);
    if (!newPassword) return;
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    try {
      const res = await fetch('/api/materials/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customer.name,
          email: customer.email,
          password: newPassword,
          role: 'customer',
          phone: customer.phone,
          customerId: customer._id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Login created for ${customer.name}. Login ID: ${data.user?.loginId}`);
      fetchCustomers();
    } catch (err) {
      setError(err.message || 'Failed to create login account');
    }
  };

  if (status === 'loading') return <PageLoader />;

  const columns = [
    { header: 'Name', render: (r) => r.name },
    { header: 'Phone', render: (r) => r.phone || '—' },
    {
      header: 'Login',
      render: (r) => {
        const linkedUser = customerUsers[r._id];
        return (
          <div>
            <div>{r.email || '—'}</div>
            {linkedUser?.loginId && <div className="text-xs text-slate-500">ID: {linkedUser.loginId}</div>}
          </div>
        );
      },
    },
    {
      header: 'Balance',
      render: (r) => (
        <span className="font-semibold text-emerald-600">₦{(r.balance || 0).toLocaleString()}</span>
      ),
    },
    {
      header: 'Status',
      render: (r) =>
        r.isFlagged ? (
          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">⚠ Flagged</span>
        ) : (
          <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">Active</span>
        ),
    },
    {
      header: 'Actions',
      render: (r) => (
        <div className="flex gap-2 items-center">
          <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>
            Edit
          </Button>
          <Button size="sm" variant="success" onClick={() => setCreditTarget(r)}>
            Credit
          </Button>
          {customerUsers[r._id]?._id ? (
            <Button size="sm" variant="secondary" onClick={() => setResetTarget(r)}>
              Reset Password
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => createCustomerLogin(r)}>
              Create Login
            </Button>
          )}
          {flagForm.id === r._id && !r.isFlagged ? (
            <>
              <Input
                placeholder="Flag reason"
                value={flagForm.reason}
                onChange={(e) => setFlagForm((p) => ({ ...p, reason: e.target.value }))}
                className="w-36"
              />
              <Button size="sm" variant="danger" disabled={!flagForm.reason || flagging === r._id}
                onClick={() => toggleFlag(r)}>
                Confirm
              </Button>
              <Button size="sm" variant="outline" onClick={() => setFlagForm({ id: null, reason: '' })}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant={r.isFlagged ? 'outline' : 'danger'}
              disabled={flagging === r._id}
              onClick={() => toggleFlag(r)}
            >
              {r.isFlagged ? 'Unflag' : 'Flag'}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Materials Customers</h1>
        <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ New Customer'}</Button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</div>}
      {success && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl">{success}</div>}

      {showForm && (
        <Card title="New Customer" className="border border-slate-200">
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Name" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} required />
            <Input label="Phone" value={formData.phone} onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))} />
            <Input label="Email" type="email" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} required />
            <Input label="Address" value={formData.address} onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))} />
            <Input label="Credit Limit" type="number" min="0" value={formData.creditLimit} onChange={(e) => setFormData((p) => ({ ...p, creditLimit: e.target.value }))} />
            <Input label="Login ID (optional)" value={formData.loginId} onChange={(e) => setFormData((p) => ({ ...p, loginId: e.target.value }))} />
            <Input label="Password" type="password" value={formData.password} onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))} required />
            <div className="sm:col-span-2">
              <Button type="submit" isLoading={submitting}>Create Customer Account</Button>
            </div>
          </form>
        </Card>
      )}

      {editingCustomer && (
        <Card title={`Edit Customer: ${editingCustomer.name}`} className="border border-slate-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Name" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} required />
            <Input label="Phone" value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} />
            <Input label="Email" type="email" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} required />
            <Input label="Address" value={editForm.address} onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))} />
            <Input label="Credit Limit" type="number" min="0" value={editForm.creditLimit} onChange={(e) => setEditForm((p) => ({ ...p, creditLimit: e.target.value }))} />
            <div className="sm:col-span-2 flex gap-2">
              <Button isLoading={savingEdit} onClick={saveEdit}>Save Changes</Button>
              <Button variant="outline" onClick={() => setEditingCustomer(null)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {creditTarget && (
        <Card title={`Credit Account: ${creditTarget.name}`} className="border border-slate-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Amount" type="number" min="0.01" step="0.01" value={creditForm.amount} onChange={(e) => setCreditForm((p) => ({ ...p, amount: e.target.value }))} required />
            <Input label="Method" value={creditForm.method} onChange={(e) => setCreditForm((p) => ({ ...p, method: e.target.value }))} helpText="Use cash, bank_transfer, or paystack" required />
            <Input label="Reference" value={creditForm.reference} onChange={(e) => setCreditForm((p) => ({ ...p, reference: e.target.value }))} />
            <Input label="Notes" value={creditForm.notes} onChange={(e) => setCreditForm((p) => ({ ...p, notes: e.target.value }))} />
            <div className="sm:col-span-2 flex gap-2">
              <Button isLoading={crediting} onClick={creditCustomer}>Apply Credit</Button>
              <Button variant="secondary" onClick={() => setCreditTarget(null)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="mb-4">
        <Input placeholder="Search by name, phone or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Table columns={columns} data={customers} loading={loading} emptyMessage="No customers found" />

      <PasswordResetModal
        isOpen={Boolean(resetTarget)}
        targetName={resetTarget?.name}
        onClose={() => setResetTarget(null)}
        onSubmit={resetCustomerPassword}
        isLoading={resettingPassword}
      />
    </div>
  );
}
