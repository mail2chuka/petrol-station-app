import mongoose from 'mongoose';
import { FUEL_TYPES } from '@/lib/constants';

const priceHistorySchema = new mongoose.Schema(
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
    fuelType: {
      type: String,
      enum: Object.values(FUEL_TYPES),
      required: true,
      index: true,
    },
    previousPrice: {
      type: Number,
      required: true,
    },
    newPrice: {
      type: Number,
      required: true,
    },
    changeAmount: {
      type: Number,
      required: true,
    },
    changePercentage: {
      type: Number,
      required: true,
    },
    effectiveDate: {
      type: Date,
      required: true,
      index: true,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    changedByName: {
      type: String, // Denormalized
      required: true,
    },
    reason: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
priceHistorySchema.index({ stationId: 1, fuelType: 1, effectiveDate: -1 });

export default mongoose.models.PriceHistory || mongoose.model('PriceHistory', priceHistorySchema);
