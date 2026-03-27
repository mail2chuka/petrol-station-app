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
  if (!user.business) {
    user.business = 'fuel';
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

export async function requireBusiness(expectedBusiness) {
  const user = await requireAuth();

  // During initial rollout, admins can operate across both businesses.
  if (user.role === ROLES.ADMIN) {
    return user;
  }

  if ((user.business || 'fuel') !== expectedBusiness) {
    throw new Error(`Access denied for this business. Sign in with a ${expectedBusiness} account.`);
  }

  return user;
}

export async function requireBusinessRole(expectedBusiness, allowedRoles) {
  const user = await requireBusiness(expectedBusiness);

  if (!allowedRoles.includes(user.role)) {
    throw new Error('Insufficient permissions');
  }

  return user;
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
