'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageLoader } from '@/components/Loading';
import { getDefaultRouteForUser } from '@/lib/routing';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/login');
    } else {
      router.push(getDefaultRouteForUser(session.user));
    }
  }, [session, status, router]);

  return <PageLoader />;
}
