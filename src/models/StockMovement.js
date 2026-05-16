import mongoose from 'mongoose';
import { FUEL_TYPES } from '@/lib/constants';

const stockMovementSchema = new mongoose.Schema(
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
    fuelType: {
      type: String,
      enum: Object.values(FUEL_TYPES),
      required: true,
      index: true,
    },
    movementType: {
      type: String,
      enum: ['receipt', 'sale', 'adjustment'],
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
      totalReceived: {
        type: Number,
        default: null,
        // Total litres received before distribution; mainly for receipts
      },
    expectedQuantity: {
      type: Number,
    },
    varianceQuantity: {
      type: Number,
    },
    tank: {
      type: String,
    },
      distribution: [
        {
          tankId: {
            type: String,
            required: true,
          },
          litres: {
            type: Number,
            required: true,
            min: 0,
          },
        },
      ],
    // For receipts
    costPerLiter: {
      type: Number,
    },
    totalCost: {
      type: Number,
    },
    supplier: {
      type: String,
    },
    // Stock levels at time of transaction
    previousStock: {
      type: Number,
      required: true,
    },
    newStock: {
      type: Number,
      required: true,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recordedByName: {
      type: String, // Denormalized
      required: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId, // Can reference DayShift or other documents
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
stockMovementSchema.index({ stationId: 1, date: -1 });
stockMovementSchema.index({ stationId: 1, fuelType: 1, date: -1 });

export default mongoose.models.StockMovement || mongoose.model('StockMovement', stockMovementSchema);
