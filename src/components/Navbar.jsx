'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Navbar() {
  const { data: session } = useSession();
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push('/login');
  };

  const getRoleColor = (role) => {
    const colors = {
      admin: 'bg-ecana-maroon/10 text-ecana-maroon',
      manager: 'bg-ecana-blue/10 text-ecana-blue',
      accountant: 'bg-emerald-100 text-emerald-700',
      supervisor: 'bg-amber-100 text-amber-700',
      daily_auditor: 'bg-purple-100 text-purple-700',
      external_auditor: 'bg-indigo-100 text-indigo-700',
    };
    return colors[role] || 'bg-slate-100 text-slate-700';
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

              {/* User menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-ecana-maroon to-ecana-blue flex items-center justify-center text-white font-semibold text-sm shadow-lg shadow-ecana-maroon/20">
                    {session.user.name?.charAt(0).toUpperCase()}
                  </div>

                  {/* User info - hidden on mobile */}
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-semibold text-slate-900 leading-tight">
                      {session.user.name}
                    </p>
                    <span className={`inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded-md ${getRoleColor(session.user.role)}`}>
                      {session.user.role}
                    </span>
                  </div>

                  {/* Dropdown arrow */}
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown menu */}
                {showUserMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowUserMenu(false)}
                    />
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/50 py-2 z-50">
                      {/* User info */}
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

                      {/* Menu items */}
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
