// User Roles
export const ROLES = {
  ADMIN: 'admin',
  EXTERNAL_AUDITOR: 'external_auditor',
  DAILY_AUDITOR: 'daily_auditor',
  MANAGER: 'manager',
  SUPERVISOR: 'supervisor',
  CASHIER: 'cashier',
};

// Fuel Types
export const FUEL_TYPES = {
  PMS: 'PMS',   // Premium Motor Spirit (Petrol)
  AGO: 'AGO',   // Automotive Gas Oil (Diesel)
  DPK: 'DPK',   // Dual Purpose Kerosene
  LPG: 'LPG',   // Liquefied Petroleum Gas
};

export const FUEL_TYPE_LABELS = {
  PMS: 'PMS (Petrol)',
  AGO: 'AGO (Diesel)',
  DPK: 'DPK (Kerosene)',
  LPG: 'LPG (Gas)',
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
