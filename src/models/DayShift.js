import mongoose from 'mongoose';
import { DAY_STATUS, FUEL_TYPES } from '@/lib/constants';

const dayShiftSchema = new mongoose.Schema(
  {
    stationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Station',
      required: true,
      index: true,
    },
    stationName: {
      type: String, // Denormalized
      required: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(DAY_STATUS),
      default: DAY_STATUS.NOT_STARTED,
      index: true,
    },
    startedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    startedByName: {
      type: String, // Denormalized
      required: true,
    },
    startTime: {
      type: Date,
    },
    endedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    endedByName: {
      type: String, // Denormalized
    },
    endTime: {
      type: Date,
    },
    dispenserAssignments: [
      {
        dispenserId: {
          type: String,
          required: true,
        },
        dispenserName: {
          type: String,
          required: true,
        },
        fuelType: {
          type: String,
          enum: Object.values(FUEL_TYPES),
          required: true,
        },
        supervisorId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null,
        },
        supervisorName: {
          type: String,
          default: '',
        },
        tankId: {
          type: String,
          default: null,
        },
        tankLabel: {
          type: String,
          default: '',
        },
        initialReading: {
          type: Number,
          default: 0,
        },
        finalReading: {
          type: Number,
        },
        totalLiters: {
          type: Number,
          default: 0,
        },
      },
    ],
    // Price snapshots for the day — keyed by fuel type string (e.g. PMS, AGO, DPK, LPG)
    pricesAtStart: {
      type: Map,
      of: Number,
      default: () => ({}),
    },
    // Tolerance snapshot for the day (% of sales). Captured alongside prices so
    // historic days keep their own tolerance. Null = fall back to station value.
    tolerancePercent: {
      type: Number,
      default: null,
    },
    // Totals per fuel type
    totalSales: {
      type: Map,
      of: new mongoose.Schema({
        liters: { type: Number, default: 0 },
        amount: { type: Number, default: 0 },
      }, { _id: false }),
      default: () => ({}),
    },
    totalPayments: {
      cash: { type: Number, default: 0 },
      pos: { type: Number, default: 0 },
    },
    // Discrepancy tracking
    expectedAmount: {
      type: Number,
      default: 0,
    },
    actualAmount: {
      type: Number,
      default: 0,
    },
    discrepancy: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for queries
dayShiftSchema.index({ stationId: 1, date: -1 });
dayShiftSchema.index({ stationId: 1, status: 1 });
dayShiftSchema.index({ date: -1, status: 1 });

export default mongoose.models.DayShift || mongoose.model('DayShift', dayShiftSchema);
