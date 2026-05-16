import mongoose from 'mongoose';

const flagSchema = new mongoose.Schema(
  {
    stationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Station',
      required: [true, 'Station ID is required'],
      index: true,
    },
    stationName: {
      type: String, // Denormalized
      required: true,
    },
    raisedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    raisedByUserName: {
      type: String, // Denormalized (Daily Auditor name)
      required: true,
    },
    raisedByUserRole: {
      type: String,
      enum: ['daily_auditor', 'admin'],
      required: true,
    },
    targetType: {
      type: String,
      enum: ['meter_reading', 'tank_stock', 'sales', 'payment', 'stock_movement', 'general'],
      required: [true, 'Target type is required'],
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null, // ObjectId of MeterReading, TankStockEntry, etc. Null if general flag
    },
    targetRef: {
      type: String, // Description of the target for display
      default: null,
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'warning',
      index: true,
    },
    reason: {
      type: String,
      required: [true, 'Reason is required'],
      trim: true,
    },
    additionalDetails: String, // Extra context
    status: {
      type: String,
      enum: ['open', 'acknowledged', 'resolved'],
      default: 'open',
      index: true,
    },
    acknowledgedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
    resolvedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolvedByAdminName: {
      type: String,
      default: null,
    },
    resolutionNote: {
      type: String, // Action taken to resolve
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast queries
flagSchema.index({ stationId: 1, status: 1, createdAt: -1 });
flagSchema.index({ stationId: 1, severity: 1, status: 1 });
flagSchema.index({ raisedByUserId: 1, createdAt: -1 });

if (mongoose.models.Flag) {
  delete mongoose.models.Flag;
}

export default mongoose.model('Flag', flagSchema);
