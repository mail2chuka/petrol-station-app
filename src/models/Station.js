import mongoose from 'mongoose';
import { FUEL_TYPES } from '@/lib/constants';

const ALL_FUEL_TYPES = Object.values(FUEL_TYPES);

const stationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Station name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Station code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
    },
    // Which products this station sells (admin-configurable)
    availableProducts: {
      type: [String],
      enum: ALL_FUEL_TYPES,
      default: ['PMS', 'AGO'],
    },
    // Prices per product (keyed by fuel type string)
    currentPrices: {
      type: Map,
      of: Number,
      default: () => ({ PMS: 0, AGO: 0 }),
    },
    // Stock per product (keyed by fuel type string)
    currentStock: {
      type: Map,
      of: Number,
      default: () => ({ PMS: 0, AGO: 0 }),
    },
      tanks: [
        {
          _id: {
            type: String,
            required: true,
          },
          label: {
            type: String,
            required: true,
          },
          product: {
            type: String,
            enum: ALL_FUEL_TYPES,
            required: true,
          },
          capacity: {
            type: Number,
            required: true,
            min: 1,
          },
          isActive: {
            type: Boolean,
            default: true,
          },
        },
      ],
      tolerancePercent: {
      type: Number,
      default: 2.5,
      min: 0,
    },
    numberOfTanks: {
      type: Number,
      default: 0,
      min: 0,
    },
    numberOfPumps: {
      type: Number,
      default: 0,
      min: 0,
    },
    dispensers: [
      {
        dispenserId: {
          type: String,
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
          tankId: {
            type: String,
            default: null,
          },
        fuelType: {
          type: String,
          enum: ALL_FUEL_TYPES,
          required: true,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],
    // Optional per-station shift schedule (morning/afternoon/night, etc).
    // Stations without one behave as a single implicit 'default' shift —
    // see src/lib/shifts.js getEffectiveShiftSchedule().
    shiftSchedule: [
      {
        key: {
          type: String,
          required: true,
        },
        label: {
          type: String,
          required: true,
        },
        order: {
          type: Number,
          required: true,
        },
        startTime: {
          type: String, // 'HH:mm', informational only
          default: '',
        },
        endTime: {
          type: String,
          default: '',
        },
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    createdByName: {
      type: String, // Denormalized
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
stationSchema.index({ isActive: 1 });

// Ensure all availableProducts have a 0 entry in currentStock and currentPrices before saving,
// so reads never return undefined/null and cause NaN arithmetic bugs.
stationSchema.pre('save', function (next) {
  const products = this.availableProducts?.length ? this.availableProducts : ['PMS', 'AGO'];

  if (!(this.currentStock instanceof Map)) {
    this.currentStock = new Map(Object.entries(this.currentStock || {}));
  }
  if (!(this.currentPrices instanceof Map)) {
    this.currentPrices = new Map(Object.entries(this.currentPrices || {}));
  }

  for (const p of products) {
    if (this.currentStock.get(p) == null) this.currentStock.set(p, 0);
    if (this.currentPrices.get(p) == null) this.currentPrices.set(p, 0);
  }

  next();
});

export default mongoose.models.Station || mongoose.model('Station', stationSchema);
