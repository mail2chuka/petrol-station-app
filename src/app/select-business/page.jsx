'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageLoader } from '@/components/Loading';
import { getDefaultRouteForUser } from '@/lib/routing';

export default function SelectBusinessPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/login');
      return;
    }

    if (session.user.role !== 'admin') {
      router.push(getDefaultRouteForUser(session.user));
    }
  }, [session, status, router]);

  if (status === 'loading' || !session) {
    return <PageLoader />;
  }

  if (session.user.role !== 'admin') {
    return <PageLoader />;
  }

  const fuelEnabled = true;
  const materialsEnabled = true;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-50 p-6 sm:p-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900">Choose Business Dashboard</h1>
        <p className="text-slate-600 mt-2">
          You are signed in as <span className="font-semibold">{session.user.name}</span>. Select the business dashboard to continue.
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Admin accounts currently have access to both businesses during this phase.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          {fuelEnabled && (
            <Link
              href="/admin"
              className="rounded-2xl border-2 border-ecana-maroon-200 bg-gradient-to-br from-white to-ecana-maroon-50 p-6 shadow hover:shadow-lg transition-all"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-ecana-maroon">Fuel Station</p>
              <h2 className="text-2xl font-bold text-slate-900 mt-2">Fuel Admin Dashboard</h2>
              <p className="text-sm text-slate-600 mt-2">Manage stations, fuel prices, users, and reports.</p>
            </Link>
          )}

          {materialsEnabled && (
            <Link
              href="/admin/materials"
              className="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-white to-amber-50 p-6 shadow hover:shadow-lg transition-all"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Building Materials</p>
              <h2 className="text-2xl font-bold text-slate-900 mt-2">Materials Admin Dashboard</h2>
              <p className="text-sm text-slate-600 mt-2">Manage products, customers, orders, and materials staff.</p>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
