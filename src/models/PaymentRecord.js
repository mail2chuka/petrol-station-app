import mongoose from 'mongoose';

const paymentRecordSchema = new mongoose.Schema(
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
    dispenserId: {
      type: String,
      required: true,
      index: true,
    },
    dispenserName: {
      type: String,
      required: true,
    },
    fuelType: {
      type: String,
    },
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    supervisorName: {
      type: String,
    },
    cashReceived: {
      type: Number,
      required: true,
      min: 0,
    },
    // Multiple POS entries — one per bank/terminal used
    posEntries: [
      {
        bank: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        terminalId: { type: String, default: null }, // optional physical terminal ID
      },
    ],
    posReceived: {
      type: Number,
      required: true,
      min: 0,
    },
    totalReceived: {
      type: Number,
      required: true,
      min: 0,
    },
    // Snapshot after this collection was recorded. The current source of
    // truth remains the sum of all records for the pump and shift.
    expectedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    outstandingAfter: {
      type: Number,
      default: 0,
      min: 0,
    },
    collectionType: {
      type: String,
      enum: ['initial', 'supplemental', 'post_close_settlement'],
      default: 'initial',
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recordedByName: {
      type: String,
      required: true,
    },
    notes: {
      type: String,
    },
    managerReviewStatus: {
      type: String,
      enum: ['pending', 'approved', 'queried'],
      default: 'pending',
    },
    managerReviewNote: { type: String, default: '' },
    reviewedByManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByManagerName: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

paymentRecordSchema.index({ stationId: 1, date: -1 });
paymentRecordSchema.index({ dayShiftId: 1, dispenserId: 1 });
paymentRecordSchema.index({ dayShiftId: 1, supervisorId: 1 });

export default mongoose.models.PaymentRecord || mongoose.model('PaymentRecord', paymentRecordSchema);
