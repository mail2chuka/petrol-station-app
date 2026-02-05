'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar({ menuItems }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:block w-64 bg-white/50 backdrop-blur-sm border-r border-slate-200/50 min-h-[calc(100vh-4rem)]">
      <nav className="sticky top-16 py-6">
        {/* Navigation menu */}
        <div className="px-4">
          <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Navigation
          </p>
          <ul className="space-y-1">
            {menuItems.map((item, index) => {
              const isActive = pathname === item.href;
              return (
                <li key={index}>
                  <Link
                    href={item.href}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-xl
                      transition-all duration-200
                      group
                      ${isActive
                        ? 'bg-gradient-to-r from-ecana-maroon to-ecana-maroon-700 text-white shadow-lg shadow-ecana-maroon/20'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }
                    `}
                  >
                    {/* Icon */}
                    {item.icon && (
                      <span className={`
                        flex-shrink-0 w-5 h-5
                        ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}
                      `}>
                        {item.icon}
                      </span>
                    )}

                    {/* Label */}
                    <span className="text-sm font-medium">{item.label}</span>

                    {/* Active indicator */}
                    {isActive && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Help section */}
        <div className="mt-8 mx-4">
          <div className="p-4 bg-gradient-to-br from-slate-100 to-slate-50 rounded-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-white rounded-lg shadow-sm flex items-center justify-center">
                <svg className="w-4 h-4 text-ecana-maroon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-900">Need help?</p>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Contact your administrator for assistance.
            </p>
          </div>
        </div>
      </nav>
    </aside>
  );
}
