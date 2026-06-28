import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { ROLES } from '@/lib/constants';

export async function getSession() {
  return await getServerSession(authOptions);
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

export async function requireRole(allowedRoles) {
  const user = await requireAuth();
  
  if (!allowedRoles.includes(user.role)) {
    throw new Error('Insufficient permissions');
  }
  
  return user;
}

export async function requireAdmin() {
  return requireRole([ROLES.ADMIN]);
}

export async function requireManagerOrAdmin() {
  return requireRole([ROLES.ADMIN, ROLES.MANAGER]);
}

export async function requireStationAccess(stationId) {
  const user = await requireAuth();
  
  // Admins can access all stations
  if (user.role === ROLES.ADMIN) {
    return user;
  }
  
  // Other roles must belong to the station
  if (user.stationId !== stationId) {
    throw new Error('Access denied to this station');
  }
  
  return user;
}
