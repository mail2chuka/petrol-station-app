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
        attendantId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        attendantName: {
          type: String, // Denormalized
          required: true,
        },
        initialReading: {
          type: Number,
          required: true,
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
    // Price snapshots for the day
    pricesAtStart: {
      PMS: {
        type: Number,
        required: true,
      },
      AGO: {
        type: Number,
        required: true,
      },
    },
    // Totals
    totalSales: {
      PMS: {
        liters: { type: Number, default: 0 },
        amount: { type: Number, default: 0 },
      },
      AGO: {
        liters: { type: Number, default: 0 },
        amount: { type: Number, default: 0 },
      },
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
