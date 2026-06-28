export function getDefaultRouteForUser(user) {
  if (!user) {
    return '/login';
  }

  const role = user.role;

  switch (role) {
    case 'admin':
      return '/admin';
    case 'manager':
      return '/manager';
    case 'cashier':
      return '/cashier';
    case 'supervisor':
      return '/supervisor';
    case 'daily_auditor':
      return '/daily-auditor';
    case 'external_auditor':
      return '/external-auditor';
    default:
      return '/login';
  }
}
