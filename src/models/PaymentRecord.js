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
      type: String, // Denormalized
      required: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    attendantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    attendantName: {
      type: String, // Denormalized
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
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recordedByName: {
      type: String, // Denormalized
      required: true,
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
paymentRecordSchema.index({ stationId: 1, date: -1 });
paymentRecordSchema.index({ dayShiftId: 1, attendantId: 1 });

export default mongoose.models.PaymentRecord || mongoose.model('PaymentRecord', paymentRecordSchema);
