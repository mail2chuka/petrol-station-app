'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

export default function Navbar() {
  const { data: session } = useSession();
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push('/login');
  };

  const getRoleColor = (role) => {
    const colors = {
      admin: 'bg-ecana-maroon/10 text-ecana-maroon',
      manager: 'bg-ecana-blue/10 text-ecana-blue',
      cashier: 'bg-emerald-100 text-emerald-700',
      supervisor: 'bg-amber-100 text-amber-700',
      daily_auditor: 'bg-purple-100 text-purple-700',
      external_auditor: 'bg-indigo-100 text-indigo-700',
    };
    return colors[role] || 'bg-slate-100 text-slate-700';
  };

  const fetchUnreadCount = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch('/api/notifications?unread=true&limit=1');
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(data.unreadCount || 0);
    } catch {}
  }, [session]);

  const fetchNotifications = useCallback(async () => {
    if (!session) return;
    setNotifLoading(true);
    try {
      const res = await fetch('/api/notifications?limit=20');
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {} finally {
      setNotifLoading(false);
    }
  }, [session]);

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications', { method: 'PATCH' });
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {}
  };

  const markOneRead = async (id) => {
    try {
      await fetch(`/api/notifications/${id}`, { method: 'PATCH' });
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  useEffect(() => {
    if (session) {
      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 60000);
      return () => clearInterval(interval);
    }
  }, [session, fetchUnreadCount]);

  const openNotifDropdown = () => {
    setShowNotifDropdown(true);
    fetchNotifications();
  };

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and title */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/ECANA LOGO BLUE_1-64.png"
                alt="Ecana Energy"
                className="h-9 w-auto"
              />
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold text-slate-900 leading-tight">
                  Ecana PMS
                </h1>
                <p className="text-xs text-slate-500 -mt-0.5">Fuel Station Manager</p>
              </div>
            </div>
          </div>

          {/* Right side */}
          {session && (
            <div className="flex items-center gap-3">
              {/* Station badge */}
              {session.user.stationName && (
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm font-medium text-slate-700">{session.user.stationName}</span>
                </div>
              )}

              {/* Notification bell */}
              <div className="relative">
                <button
                  onClick={showNotifDropdown ? () => setShowNotifDropdown(false) : openNotifDropdown}
                  className="relative p-2 rounded-xl hover:bg-slate-100 transition-colors"
                  aria-label="Notifications"
                >
                  <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>

                {showNotifDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowNotifDropdown(false)} />
                    <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/50 z-50 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                        <p className="text-sm font-semibold text-slate-900">Notifications</p>
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllRead}
                            className="text-xs text-ecana-maroon hover:underline font-medium"
                          >
                            Mark all read
                          </button>
                        )}
                      </div>
                      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                        {notifLoading ? (
                          <div className="flex justify-center py-6"><div className="spinner" /></div>
                        ) : notifications.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-8">No notifications</p>
                        ) : (
                          notifications.map(n => (
                            <div
                              key={n._id}
                              className={`px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${!n.isRead ? 'bg-blue-50/40' : ''}`}
                              onClick={() => !n.isRead && markOneRead(n._id)}
                            >
                              <div className="flex items-start gap-2">
                                {!n.isRead && <span className="mt-1.5 w-2 h-2 rounded-full bg-ecana-maroon shrink-0" />}
                                <div className={!n.isRead ? '' : 'pl-4'}>
                                  <p className={`text-sm font-medium ${!n.isRead ? 'text-slate-900' : 'text-slate-600'}`}>
                                    {n.title}
                                  </p>
                                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                                  <p className="text-xs text-slate-400 mt-1">
                                    {new Date(n.createdAt).toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'short' })}
                                    {n.stationName ? ` · ${n.stationName}` : ''}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* User menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-ecana-maroon to-ecana-blue flex items-center justify-center text-white font-semibold text-sm shadow-lg shadow-ecana-maroon/20">
                    {session.user.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-semibold text-slate-900 leading-tight">
                      {session.user.name}
                    </p>
                    <span className={`inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded-md capitalize ${getRoleColor(session.user.role)}`}>
                      {session.user.role}
                    </span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/50 py-2 z-50">
                      <div className="px-4 py-3 border-b border-slate-100">
                        <p className="text-sm font-semibold text-slate-900">{session.user.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{session.user.email}</p>
                        {session.user.stationName && (
                          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            </svg>
                            {session.user.stationName}
                          </p>
                        )}
                      </div>
                      <div className="py-2">
                        <Link
                          href="/account"
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          onClick={() => setShowUserMenu(false)}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm0 2c-2.673 0-8 1.336-8 4v2h16v-2c0-2.664-5.327-4-8-4z" />
                          </svg>
                          Change Password
                        </Link>
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          Sign out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
