'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Card from '@/components/Card';
import Table from '@/components/Table';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

export default function AdminDashboard() {
  const { data: session } = useSession();
  const [stats, setStats] = useState(null);
  const [stations, setStations] = useState([]);
  const [users, setUsers] = useState([]);
  const [priceForm, setPriceForm] = useState({ stationId: '', fuelType: 'PMS', price: '', reason: '' });
  const [savingPrice, setSavingPrice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [stationsRes, usersRes] = await Promise.all([
        fetch('/api/stations'),
        fetch('/api/users?includeInactive=true'),
      ]);

      const stationsData = await stationsRes.json();
      const usersData = await usersRes.json();

      const allStations = stationsData.stations || [];
      const allUsers = usersData.users || [];

      setStations(allStations);
      setUsers(allUsers);

      setStats({
        totalStations: allStations.filter((s) => s.isActive !== false).length,
        totalUsers: allUsers.length,
        staff: allUsers.filter(u => ['manager', 'accountant', 'attendant'].includes(u.role) && u.isActive !== false).length,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const stationOptions = stations
    .filter((s) => s.isActive !== false)
    .map((s) => ({ value: s._id, label: `${s.name} (${s.code})` }));

  const handleQuickPriceUpdate = async () => {
    setError('');
    setSuccess('');

    const price = Number(priceForm.price);
    if (!priceForm.stationId) {
      setError('Please select a station.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError('Please enter a valid positive price.');
      return;
    }

    setSavingPrice(true);
    try {
      const res = await fetch(`/api/stations/${priceForm.stationId}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: priceForm.stationId,
          fuelType: priceForm.fuelType,
          price,
          reason: priceForm.reason || 'Quick price update',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to update price');
        return;
      }
      setSuccess('Price updated successfully.');
      setPriceForm((p) => ({ ...p, price: '', reason: '' }));
      await fetchStats();
    } catch (e) {
      setError('An error occurred while updating price.');
    } finally {
      setSavingPrice(false);
    }
  };

  const toggleUserActive = async (user) => {
    if (!user?._id) return;
    if (session?.user?.id && user._id === session.user.id) {
      setError('You cannot deactivate your own account.');
      return;
    }
    const nextActive = !user.isActive;
    const ok = window.confirm(`${nextActive ? 'Activate' : 'Deactivate'} user "${user.name}"?`);
    if (!ok) return;

    setError('');
    setSuccess('');
    try {
      const res = nextActive
        ? await fetch(`/api/users/${user._id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: true }),
          })
        : await fetch(`/api/users/${user._id}`, { method: 'DELETE' });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to update user');
        return;
      }
      setSuccess(nextActive ? 'User activated.' : 'User deactivated.');
      await fetchStats();
    } catch (e) {
      setError('An error occurred while updating the user.');
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-white via-ecana-maroon-50 to-white rounded-2xl border-2 border-ecana-maroon-100 shadow-lg p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-ecana-maroon to-ecana-blue">Admin Dashboard</h1>
            <p className="text-base text-gray-600 mt-2 font-medium">Manage stations, prices and users across the Ecana network.</p>
          </div>
          <div className="text-right hidden sm:block bg-white/80 backdrop-blur-sm rounded-xl px-4 py-2 shadow-sm">
            <p className="text-xs text-gray-500 font-medium">Signed in as</p>
            <p className="text-sm font-bold text-ecana-maroon truncate max-w-[10rem]">{session?.user?.name}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-gradient-to-r from-red-50 to-red-100 border-l-4 border-red-500 text-red-900 px-5 py-4 rounded-xl shadow-md animate-slide-in">
          <p className="font-bold flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
            </svg>
            Error
          </p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-gradient-to-r from-green-50 to-green-100 border-l-4 border-green-500 text-green-900 px-5 py-4 rounded-xl shadow-md animate-slide-in">
          <p className="font-bold flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
            Success
          </p>
          <p className="text-sm mt-1">{success}</p>
        </div>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <Link
          href="/admin/stations"
          className="group bg-gradient-to-br from-ecana-maroon-50 via-white to-ecana-maroon-100 rounded-2xl border-2 border-ecana-maroon-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 p-6 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-ecana-maroon-100 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="text-center relative z-10">
            <p className="text-xs sm:text-sm font-bold text-gray-600 mb-2 uppercase tracking-wide">Total Stations</p>
            <p className="text-4xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-ecana-maroon to-ecana-maroon-800">{stats?.totalStations || 0}</p>
            <p className="text-xs text-gray-500 mt-2">View stations</p>
          </div>
        </Link>

        <Link
          href="/admin/users"
          className="group bg-gradient-to-br from-green-50 via-white to-green-100 rounded-2xl border-2 border-green-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 p-6 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-100 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="text-center relative z-10">
            <p className="text-xs sm:text-sm font-bold text-gray-600 mb-2 uppercase tracking-wide">Total Users</p>
            <p className="text-4xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-green-600 to-green-800">{stats?.totalUsers || 0}</p>
            <p className="text-xs text-gray-500 mt-2">View users</p>
          </div>
        </Link>

        <Link
          href="/admin/staff"
          className="group bg-gradient-to-br from-ecana-blue-50 via-white to-ecana-blue-100 rounded-2xl border-2 border-ecana-blue-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 p-6 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-ecana-blue-100 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="text-center relative z-10">
            <p className="text-xs sm:text-sm font-bold text-gray-600 mb-2 uppercase tracking-wide">Staff</p>
            <p className="text-4xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-ecana-blue to-ecana-blue-800">{stats?.staff || 0}</p>
            <p className="text-xs text-gray-500 mt-2">View staff list</p>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Quick Actions" className="border border-gray-200 shadow-md">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a href="/admin/stations" className="rounded-xl border-2 border-ecana-maroon-200 bg-ecana-maroon-50 p-4 hover:bg-ecana-maroon-100 hover:border-ecana-maroon-300 transition-all shadow-sm hover:shadow-md">
              <p className="text-sm font-bold text-ecana-maroon-900">Stations</p>
              <p className="text-xs text-gray-600 mt-1">Create stations, set prices, and deactivate.</p>
            </a>
            <a href="/admin/price-approvals" className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 hover:bg-amber-100 hover:border-amber-300 transition-all shadow-sm hover:shadow-md">
              <p className="text-sm font-bold text-amber-900">Price Approvals</p>
              <p className="text-xs text-gray-600 mt-1">Review pending manager requests for mid-day price changes.</p>
            </a>
            <a href="/admin/users" className="rounded-xl border-2 border-green-200 bg-green-50 p-4 hover:bg-green-100 hover:border-green-300 transition-all shadow-sm hover:shadow-md">
              <p className="text-sm font-bold text-green-900">Users</p>
              <p className="text-xs text-gray-600 mt-1">Create, edit and deactivate users.</p>
            </a>
            <a href="/admin/reports" className="rounded-xl border-2 border-ecana-blue-200 bg-ecana-blue-50 p-4 hover:bg-ecana-blue-100 hover:border-ecana-blue-300 transition-all shadow-sm hover:shadow-md">
              <p className="text-sm font-bold text-ecana-blue-900">Reports</p>
              <p className="text-xs text-gray-600 mt-1">Daily performance and summaries.</p>
            </a>
            <a href="/admin/audit" className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4 hover:bg-gray-100 hover:border-gray-300 transition-all shadow-sm hover:shadow-md">
              <p className="text-sm font-bold text-gray-900">Audit Logs</p>
              <p className="text-xs text-gray-600 mt-1">Track sensitive actions.</p>
            </a>
          </div>
        </Card>

        <Card title="Quick Price Update" className="border border-gray-200 shadow-md">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Station"
              name="stationId"
              value={priceForm.stationId}
              onChange={(e) => setPriceForm((p) => ({ ...p, stationId: e.target.value }))}
              options={stationOptions}
              required
            />
            <Select
              label="Fuel"
              name="fuelType"
              value={priceForm.fuelType}
              onChange={(e) => setPriceForm((p) => ({ ...p, fuelType: e.target.value }))}
              options={[
                { value: 'PMS', label: 'PMS' },
                { value: 'AGO', label: 'AGO' },
              ]}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Price (₦/L)"
              type="number"
              name="price"
              value={priceForm.price}
              onChange={(e) => setPriceForm((p) => ({ ...p, price: e.target.value }))}
              placeholder="0.00"
              step="0.01"
              min="0"
              required
            />
            <Input
              label="Reason (optional)"
              name="reason"
              value={priceForm.reason}
              onChange={(e) => setPriceForm((p) => ({ ...p, reason: e.target.value }))}
              placeholder="e.g., price update"
            />
          </div>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={savingPrice}
            onClick={handleQuickPriceUpdate}
          >
            {savingPrice ? 'Updating...' : 'Update Price'}
          </Button>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card
          title="Recent Stations"
          className="border border-gray-200 shadow-md"
          action={<a className="text-sm font-medium text-ecana-maroon hover:underline" href="/admin/stations">View All →</a>}
        >
          <Table
            columns={[
              { header: 'Station', render: (row) => (
                <div>
                  <p className="font-semibold text-gray-900">{row.name}</p>
                  <p className="text-xs text-gray-500">{row.code} • {row.location}</p>
                </div>
              )},
              { header: 'PMS', render: (row) => `₦${row.currentPrices?.PMS?.toFixed(2) || '0.00'}` },
              { header: 'AGO', render: (row) => `₦${row.currentPrices?.AGO?.toFixed(2) || '0.00'}` },
            ]}
            data={stations.slice(0, 6)}
          />
        </Card>

        <Card
          title="Recent Users"
          className="border border-gray-200 shadow-md"
          action={<a className="text-sm font-medium text-ecana-maroon hover:underline" href="/admin/users">View All →</a>}
        >
          <Table
            columns={[
              { header: 'User', render: (row) => (
                <div>
                  <p className="font-semibold text-gray-900">{row.name}</p>
                  <p className="text-xs text-gray-500">{row.email}</p>
                </div>
              )},
              { header: 'Role', render: (row) => <span className="capitalize">{row.role}</span> },
              { header: 'Status', render: (row) => (
                <span className={`px-2 py-1 rounded text-sm ${row.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {row.isActive ? 'Active' : 'Inactive'}
                </span>
              ) },
              { header: 'Action', render: (row) => (
                <Button
                  size="sm"
                  variant={row.isActive ? 'danger' : 'success'}
                  disabled={session?.user?.id && row._id === session.user.id}
                  onClick={() => toggleUserActive(row)}
                >
                  {row.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              ) },
            ]}
            data={users.slice(0, 8)}
          />
        </Card>
      </div>
    </div>
  );
}
