import { z } from 'zod';
import { ROLES, FUEL_TYPES, PAYMENT_METHODS } from './constants';

// User Validation Schemas
export const userSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  loginId: z
    .string()
    .min(3, 'Login ID must be at least 3 characters')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Login ID can only contain letters, numbers, dot, underscore, and hyphen')
    .optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum([
    ROLES.ADMIN,
    ROLES.EXTERNAL_AUDITOR,
    ROLES.DAILY_AUDITOR,
    ROLES.MANAGER,
    ROLES.SUPERVISOR,
    ROLES.CASHIER,
  ]),
  stationId: z.string().optional(),
});

// Station Validation Schemas
export const stationSchema = z.object({
  name: z.string().min(2, 'Station name must be at least 2 characters'),
  location: z.string().min(2, 'Location must be at least 2 characters'),
  code: z.string().min(2, 'Station code must be at least 2 characters'),
  numberOfTanks: z.number().int().min(0, 'Number of tanks must be 0 or more'),
  numberOfPumps: z.number().int().min(0, 'Number of pumps must be 0 or more'),
});

// Price Adjustment Schema
export const priceAdjustmentSchema = z.object({
  stationId: z.string(),
  fuelType: z.enum(Object.values(FUEL_TYPES)),
  price: z.number().positive('Price must be positive'),
});

// Stock Receipt Schema
export const stockReceiptSchema = z.object({
  stationId: z.string(),
  fuelType: z.enum(Object.values(FUEL_TYPES)),
  tank: z.string().optional(),
  quantity: z.number().positive('Quantity must be positive'),
  expectedQuantity: z.number().positive('Expected quantity must be positive'),
  cost: z.number().positive('Cost must be positive'),
  distribution: z
    .array(
      z.object({
        tankId: z.string().min(1, 'Tank is required'),
        litres: z.number().positive('Tank litres must be positive'),
      })
    )
    .optional(),
});

// Begin Day Schema — prices are dynamic per station's availableProducts
export const beginDaySchema = z.object({
  stationId: z.string(),
  date: z.string(),
  pricesAtStart: z.record(z.string(), z.number().positive('Price must be positive')),
  dispensers: z.array(z.object({
    dispenserId: z.string(),
    fuelType: z.enum(Object.values(FUEL_TYPES)),
  })),
});

// Sales Entry Schema
export const salesEntrySchema = z.object({
  dayShiftId: z.string(),
  dispenserId: z.string(),
  liters: z.number().positive('Liters must be positive'),
  cashAmount: z.number().min(0, 'Cash amount cannot be negative'),
  posAmount: z.number().min(0, 'POS amount cannot be negative'),
});

// Payment Record Schema
export const paymentRecordSchema = z.object({
  dayShiftId: z.string(),
  supervisorId: z.string(),
  cashReceived: z.number().min(0, 'Cash received cannot be negative'),
  posReceived: z.number().min(0, 'POS received cannot be negative'),
});

// Change Password Schema
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(6, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});
