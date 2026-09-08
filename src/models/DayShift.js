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
    // Which shift of the day this record represents (see src/lib/shifts.js).
    // Defaults keep every station that hasn't configured multiple shifts
    // behaving exactly as before — one implicit 'default' shift per day.
    shiftKey: {
      type: String,
      default: 'default',
    },
    shiftLabel: {
      type: String,
      default: 'Full Day',
    },
    shiftOrder: {
      type: Number,
      default: 1,
    },
    // How many shifts the manager planned for this calendar day (1-3, set at
    // Begin Day, carried forward to every subsequent shift that day). A shift
    // knows it's the last one when shiftOrder >= totalShiftsPlanned. Can be
    // recalibrated downward if the day ends early (see end/route.js).
    totalShiftsPlanned: {
      type: Number,
      default: 1,
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
    // Collection reconciliation is intentionally separate from whether the
    // shift can close. A shift may close after each selling pump has made an
    // initial collection, while a remaining balance stays visible to the
    // cashier and manager until it is settled.
    collectionOutstanding: {
      type: Number,
      default: 0,
      min: 0,
    },
    collectionStatus: {
      type: String,
      enum: ['pending', 'settled'],
      default: 'settled',
      index: true,
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
// Hard guarantee: at most one day shift per station per calendar date per
// shift (stations without a configured shift schedule always use the
// implicit 'default' shiftKey, so this is unchanged for them).
dayShiftSchema.index({ stationId: 1, date: 1, shiftKey: 1 }, { unique: true });

export default mongoose.models.DayShift || mongoose.model('DayShift', dayShiftSchema);
