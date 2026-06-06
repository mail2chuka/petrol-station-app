'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Sidebar from '@/components/Sidebar';
import MobileTabBar from '@/components/MobileTabBar';
import Loading from '@/components/Loading';

const AUDITOR_ROLES = ['daily_auditor', 'external_auditor'];

// Daily auditor has their own dashboard at /daily-auditor
// External auditor stays at /auditor
const DAILY_AUDITOR_MENU = [
  { label: 'Dashboard', href: '/daily-auditor' },
  { label: 'Daily Report', href: '/auditor/daily' },
  { label: 'Monthly Report', href: '/auditor/monthly' },
  { label: 'Meter Book', href: '/auditor/meter-book' },
  { label: 'Tank Stock', href: '/auditor/tank-stock' },
  { label: 'Flags', href: '/auditor/flags' },
  { label: 'Approvals', href: '/auditor/approvals' },
];

const EXTERNAL_AUDITOR_MENU = [
  { label: 'Dashboard', href: '/external-auditor' },
  { label: 'Daily Report', href: '/auditor/daily' },
  { label: 'Monthly Report', href: '/auditor/monthly' },
  { label: 'Meter Book', href: '/auditor/meter-book' },
  { label: 'Tank Stock', href: '/auditor/tank-stock' },
  { label: 'Flags', href: '/auditor/flags' },
];

export default function AuditorLayout({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) router.push('/login');
    else if (!AUDITOR_ROLES.includes(session.user.role)) router.push('/');
  }, [session, status, router]);

  if (status === 'loading' || !session || !AUDITOR_ROLES.includes(session.user.role)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <Loading size="large" text="Loading dashboard..." />
      </div>
    );
  }

  const menuItems = session.user.role === 'daily_auditor' ? DAILY_AUDITOR_MENU : EXTERNAL_AUDITOR_MENU;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <Navbar />
      <div className="flex">
        <Sidebar menuItems={menuItems} />
        <main className="flex-1 min-h-[calc(100vh-4rem)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 md:pb-8">
            {children}
          </div>
        </main>
      </div>
      <MobileTabBar menuItems={menuItems} />
    </div>
  );
}
