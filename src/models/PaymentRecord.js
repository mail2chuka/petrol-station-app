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
    cashReceived: {
      type: Number,
      required: true,
      min: 0,
    },
    posReceived: {
      type: Number,
      required: true,
      min: 0,
    },
    totalReceived: {
      type: Number,
      required: true,
    },
    method: {
      type: String,
      enum: ['cash', 'pos'],
      default: null,
    },
    posTerminalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'POSTerminal',
      default: null,
    },
    posTerminalLabel: {
      type: String,
      default: null,
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
paymentRecordSchema.index({ dayShiftId: 1, supervisorId: 1 });

export default mongoose.models.PaymentRecord || mongoose.model('PaymentRecord', paymentRecordSchema);
