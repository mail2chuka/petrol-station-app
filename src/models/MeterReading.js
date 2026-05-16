import mongoose from 'mongoose';

const meterReadingSchema = new mongoose.Schema(
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
    pumpId: {
      type: String,
      required: [true, 'Pump ID is required'],
      index: true,
    },
    pumpLabel: String,
    date: {
      type: Date,
      required: [true, 'Date is required'],
      index: true,
    },
    opening: {
      type: Number,
      required: [true, 'Opening meter reading is required'],
      min: 0,
    },
    closing: {
      type: Number,
      required: [true, 'Closing meter reading is required'],
      min: 0,
    },
    rtt: {
      type: Number,
      required: [true, 'Return-to-tank reading is required'],
      min: 0,
    },
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Supervisor ID is required'],
    },
    supervisorName: {
      type: String, // Denormalized
      required: true,
    },
    previousDayClosing: {
      type: Number, // Auto-fetched from previous day's closing reading
      default: null,
    },
    discrepancyFlag: {
      type: Boolean,
      default: false,
    },
    discrepancyComment: {
      type: String, // Required when supervisor edits opening field
      default: null,
    },
    managerReviewStatus: {
      type: String,
      enum: ['pending', 'approved', 'query'],
      default: 'pending',
      index: true,
    },
    managerReviewNote: {
      type: String,
      default: null,
    },
    reviewedByManagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedByManagerName: {
      type: String,
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    editedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Admin who last edited this reading
      default: null,
    },
    editedByAdminName: {
      type: String,
      default: null,
    },
    editHistory: [
      {
        editedAt: Date,
        editedByAdminId: mongoose.Schema.Types.ObjectId,
        editedByAdminName: String,
        fieldChanged: String,
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed,
        reason: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Compound index for uniqueness: one reading per pump per day
meterReadingSchema.index({ stationId: 1, pumpId: 1, date: 1 }, { unique: true });
meterReadingSchema.index({ stationId: 1, supervisorId: 1, date: -1 });
meterReadingSchema.index({ stationId: 1, discrepancyFlag: 1 });

if (mongoose.models.MeterReading) {
  delete mongoose.models.MeterReading;
}

export default mongoose.model('MeterReading', meterReadingSchema);
