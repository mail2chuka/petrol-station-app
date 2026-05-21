'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Sidebar from '@/components/Sidebar';
import MobileTabBar from '@/components/MobileTabBar';
import Loading from '@/components/Loading';

const accountantMenuItems = [
  { label: 'Dashboard', href: '/accountant' },
  { label: 'Record Payments', href: '/accountant/payments' },
  { label: 'View Payments', href: '/accountant/view-payments' },
  { label: 'Cash Deposits', href: '/accountant/deposits' },
];

export default function AccountantLayout({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/login');
    } else if (session.user.role !== 'accountant') {
      router.push('/');
    }
  }, [session, status, router]);

  if (status === 'loading' || !session || session.user.role !== 'accountant') {
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
        <Sidebar menuItems={accountantMenuItems} />
        <main className="flex-1 min-h-[calc(100vh-4rem)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 md:pb-8">
            {children}
          </div>
        </main>
      </div>
      <MobileTabBar menuItems={accountantMenuItems} />
    </div>
  );
}
