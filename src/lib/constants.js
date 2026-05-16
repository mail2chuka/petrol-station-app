// User Roles
export const ROLES = {
  ADMIN: 'admin',
  EXTERNAL_AUDITOR: 'external_auditor',
  DAILY_AUDITOR: 'daily_auditor',
  MANAGER: 'manager',
  SUPERVISOR: 'supervisor',
  ACCOUNTANT: 'accountant',
};

// Fuel Types
export const FUEL_TYPES = {
  PMS: 'PMS', // Petrol
  AGO: 'AGO', // Diesel
};

// Payment Methods
export const PAYMENT_METHODS = {
  CASH: 'cash',
  POS: 'pos',
};

// Day Status
export const DAY_STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  ENDED: 'ended',
};

// Transaction Types
export const TRANSACTION_TYPES = {
  STOCK_RECEIVED: 'stock_received',
  SALE: 'sale',
  PRICE_ADJUSTMENT: 'price_adjustment',
};
