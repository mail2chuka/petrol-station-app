'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageLoader } from '@/components/Loading';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/login');
    } else {
      // Redirect to appropriate dashboard based on role
      switch (session.user.role) {
        case 'admin':
          router.push('/admin');
          break;
        case 'manager':
          router.push('/manager');
          break;
        case 'accountant':
          router.push('/accountant');
          break;
        case 'attendant':
          router.push('/attendant');
          break;
        case 'auditor':
          router.push('/auditor');
          break;
        default:
          router.push('/login');
      }
    }
  }, [session, status, router]);

  return <PageLoader />;
}
