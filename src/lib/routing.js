export function getDefaultRouteForUser(user) {
  if (!user) {
    return '/login';
  }

  const business = user.business || 'fuel';
  const role = user.role;

  if (role === 'admin') {
    return '/select-business';
  }

  if (business === 'materials') {
    switch (role) {
      case 'staff':
        return '/materials/staff';
      case 'auditor':
        return '/materials/auditor';
      case 'customer':
        return '/materials/customer';
      default:
        return '/login';
    }
  }

  switch (role) {
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