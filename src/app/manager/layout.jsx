"use client";

import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Sidebar from '@/components/Sidebar';
import MobileTabBar from '@/components/MobileTabBar';
import Loading from '@/components/Loading';

const managerMenuItems = [
  { label: 'Dashboard', href: '/manager' },
  { label: 'Station Config', href: '/manager/station-config' },
  { label: 'Begin Day', href: '/manager/begin-day' },
  { label: 'Attendants', href: '/manager/attendants' },
  { label: 'Supervisor Entries', href: '/manager/supervisor-entries' },
  { label: 'Cashier Entries', href: '/manager/cashier-entries' },
  { label: 'Summary Book', href: '/manager/summary-book' },
  { label: 'End Day', href: '/manager/end-day' },
  { label: 'Stock In', href: '/manager/stock' },
  { label: 'Closing Stock', href: '/manager/closing-stock' },

];

function ManagerLayoutContent({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const stationId = searchParams.get('stationId');
  const isAdmin = session?.user?.role === 'admin';

  // Keep the admin's selected station sticky across navigation. If a link ever
  // drops ?stationId=, restore it from the last selection so manager pages
  // (stock, begin-day, etc.) don't lose their data context.
  useEffect(() => {
    if (!isAdmin || typeof window === 'undefined') return;
    if (stationId) {
      sessionStorage.setItem('admin.activeStationId', stationId);
    } else {
      const stored = sessionStorage.getItem('admin.activeStationId');
      if (stored) router.replace(`${pathname}?stationId=${stored}`);
    }
  }, [isAdmin, stationId, pathname, router]);

  const menuItems = isAdmin && stationId
    ? managerMenuItems.map((item) => ({
        ...item,
        href: `${item.href}?stationId=${stationId}`,
      }))
    : managerMenuItems;

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/login');
    } else if (session.user.role !== 'manager' && session.user.role !== 'admin') {
      router.push('/');
    }
  }, [session, status, router]);

  if (status === 'loading' || !session || (session.user.role !== 'manager' && session.user.role !== 'admin')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <Loading size="large" text="Loading dashboard..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <Navbar />
      <div className="flex">
        <Sidebar menuItems={menuItems} />
        <main className="flex-1 min-h-[calc(100vh-4rem)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 md:pb-8">
            {isAdmin && !stationId ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-gray-900">Select a station to manage</h2>
                <p className="text-sm text-gray-600 mt-1">Go to Stations and choose “Manage”.</p>
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>
      <MobileTabBar menuItems={menuItems} />
    </div>
  );
}

export default function ManagerLayout({ children }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center"><Loading size="large" text="Loading dashboard..." /></div>}>
      <ManagerLayoutContent>{children}</ManagerLayoutContent>
    </Suspense>
  );
}
