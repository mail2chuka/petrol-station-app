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
    // Which shift this movement belongs to. Nullable — deliveries recorded
    // before shift-scoping existed, or outside any active shift, have none.
    dayShiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DayShift',
      default: null,
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
    // ── Truck offload (receipt via a registered truck) ──────────────────────
    isOffload: { type: Boolean, default: false, index: true },
    truckId: { type: mongoose.Schema.Types.ObjectId, ref: 'Truck', index: true },
    truckPlate: { type: String },          // snapshot
    driverName: { type: String },          // snapshot (actual driver for this trip)
    driverPhone: { type: String },         // snapshot
    declaredLoad: { type: Number },        // litres declared on the depot waybill
    actualOffloaded: { type: Number },     // Σ of per-tank (closing − opening)
    offloadVariance: { type: Number },     // actualOffloaded − declaredLoad (− = shortage, + = excess)
    // Per-tank dipstick detail for the offload
    offloadDistribution: [
      {
        tankId: { type: String, required: true },
        tankLabel: { type: String, default: '' },
        openingDip: { type: Number, required: true, min: 0 },
        closingDip: { type: Number, required: true, min: 0 },
        offloaded: { type: Number, required: true },
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
