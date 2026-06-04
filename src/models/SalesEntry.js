import mongoose from 'mongoose';
import { FUEL_TYPES } from '@/lib/constants';

const salesEntrySchema = new mongoose.Schema(
  {
    dayShiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DayShift',
      required: true,
      index: true,
    },
    stationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Station',
      required: true,
      index: true,
    },
    stationName: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    supervisorName: {
      type: String,
      required: true,
    },
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
      index: true,
    },
    liters: {
      type: Number,
      required: true,
      min: 0,
    },
    pricePerLiter: {
      type: Number,
      required: true,
    },
    expectedAmount: {
      type: Number,
      required: true,
    },
    cashAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    posAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    discrepancy: {
      type: Number,
      default: 0,
    },
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    enteredByName: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

salesEntrySchema.index({ stationId: 1, date: -1 });
salesEntrySchema.index({ supervisorId: 1, date: -1 });
salesEntrySchema.index({ dayShiftId: 1, supervisorId: 1 });

export default mongoose.models.SalesEntry || mongoose.model('SalesEntry', salesEntrySchema);
