import AuditLog from '@/models/AuditLog';

export async function createAuditLog({
  userId,
  userName,
  userRole,
  action,
  resource,
  resourceId,
  stationId,
  stationName,
  details,
  ipAddress,
}) {
  try {
    await AuditLog.create({
      userId,
      userName,
      userRole,
      action,
      resource,
      resourceId,
      stationId,
      stationName,
      details,
      ipAddress,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw - audit logging shouldn't break the main operation
  }
}

export const AUDIT_ACTIONS = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LOGIN: 'login',
  LOGOUT: 'logout',
  BEGIN_DAY: 'begin_day',
  END_DAY: 'end_day',
  RECORD_SALE: 'record_sale',
  RECORD_PAYMENT: 'record_payment',
  CHANGE_PASSWORD: 'change_password',
  ADJUST_PRICE: 'adjust_price',
  RECEIVE_STOCK: 'receive_stock',
};

export const AUDIT_RESOURCES = {
  USER: 'user',
  STATION: 'station',
  DAY_SHIFT: 'day_shift',
  SALES_ENTRY: 'sales_entry',
  PAYMENT_RECORD: 'payment_record',
  STOCK_MOVEMENT: 'stock_movement',
  PRICE: 'price',
  TRUCK: 'truck',
};
