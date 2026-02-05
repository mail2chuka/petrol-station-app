'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

function getInitial(label) {
  return (label || '').trim().slice(0, 1).toUpperCase();
}

const icons = {
  'Dashboard': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  'Begin Day': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  'End Day': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  ),
  'Record Sales': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  'My Sales': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  'Receive Stock': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  ),
  'Reports': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  'Stations': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  'Users': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  'Audit Logs': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  'Record Payments': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  'View Payments': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
};

function getIcon(label) {
  return icons[label] || (
    <span className="w-5 h-5 flex items-center justify-center text-xs font-bold">
      {getInitial(label)}
    </span>
  );
}

export default function MobileTabBar({ menuItems = [] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const safeMenuItems = Array.isArray(menuItems) ? menuItems : [];
  const primaryItems = safeMenuItems.length <= 3 ? safeMenuItems : safeMenuItems.slice(0, 3);
  const overflowItems = safeMenuItems.length <= 3 ? [] : safeMenuItems.slice(3);

  if (safeMenuItems.length === 0) return null;

  const isMoreActive = overflowItems.some((item) => item.href === pathname);

  return (
    <>
      {/* More menu overlay */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
          />

          {/* Bottom sheet */}
          <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-white shadow-2xl animate-slide-up">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-slate-300 rounded-full" />
            </div>

            <div className="px-4 pb-8 max-h-[70vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Menu</p>
                <button
                  type="button"
                  className="text-sm font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                  onClick={() => setMoreOpen(false)}
                >
                  Close
                </button>
              </div>

              {/* Menu items */}
              <div className="space-y-1">
                {safeMenuItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={`
                        flex items-center gap-4 px-4 py-3.5 rounded-2xl
                        transition-all duration-200
                        ${isActive
                          ? 'bg-gradient-to-r from-ecana-maroon to-ecana-maroon-700 text-white shadow-lg shadow-ecana-maroon/20'
                          : 'text-slate-700 hover:bg-slate-100 active:bg-slate-200'
                        }
                      `}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className={`
                        flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
                        ${isActive ? 'bg-white/20' : 'bg-slate-100'}
                      `}>
                        <span className={isActive ? 'text-white' : 'text-slate-500'}>
                          {getIcon(item.label)}
                        </span>
                      </span>
                      <span className="flex-1 font-medium">{item.label}</span>
                      {isActive && (
                        <span className="w-2 h-2 rounded-full bg-white" />
                      )}
                      {!isActive && (
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-xl border-t border-slate-200/50 md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Bottom navigation"
      >
        <div className="px-2 py-2">
          <ul className={`grid ${overflowItems.length ? 'grid-cols-4' : 'grid-cols-3'} gap-1`}>
            {primaryItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`
                      flex flex-col items-center justify-center py-2 px-1 rounded-xl
                      transition-all duration-200
                      ${isActive
                        ? 'text-ecana-maroon'
                        : 'text-slate-400 hover:text-slate-600 active:bg-slate-100'
                      }
                    `}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className={`
                      mb-1 p-1.5 rounded-xl transition-all
                      ${isActive ? 'bg-ecana-maroon/10 scale-110' : ''}
                    `}>
                      {getIcon(item.label)}
                    </span>
                    <span className="text-[10px] font-medium truncate max-w-full">{item.label}</span>
                  </Link>
                </li>
              );
            })}

            {overflowItems.length > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  className={`
                    flex flex-col items-center justify-center w-full py-2 px-1 rounded-xl
                    transition-all duration-200
                    ${isMoreActive
                      ? 'text-ecana-maroon'
                      : 'text-slate-400 hover:text-slate-600 active:bg-slate-100'
                    }
                  `}
                  aria-label="Open menu"
                >
                  <span className={`
                    mb-1 p-1.5 rounded-xl transition-all
                    ${isMoreActive ? 'bg-ecana-maroon/10 scale-110' : ''}
                  `}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16m-7 6h7" />
                    </svg>
                  </span>
                  <span className="text-[10px] font-medium">More</span>
                </button>
              </li>
            )}
          </ul>
        </div>
      </nav>

      {/* Spacer to prevent content from being hidden behind the tab bar */}
      <div className="h-20 md:hidden" />
    </>
  );
}
