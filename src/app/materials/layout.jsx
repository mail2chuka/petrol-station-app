'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageLoader } from '@/components/Loading';

const ALLOWED_ROLES = ['admin', 'staff', 'auditor', 'customer'];

export default function MaterialsLayout({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/login');
      return;
    }
    if (session.user.business !== 'materials') {
      router.push('/');
      return;
    }
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      router.push('/');
    }
  }, [session, status, router]);

  if (
    status === 'loading' ||
    !session ||
    session.user.business !== 'materials' ||
    !ALLOWED_ROLES.includes(session.user.role)
  ) {
    return <PageLoader />;
  }

  return <>{children}</>;
}
