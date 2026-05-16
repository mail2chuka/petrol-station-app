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
      method: {
        type: String,
        enum: ['cash', 'pos'],
        default: null, // Optional for backward compatibility with mixed cash/POS records
      },
      posTerminalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'POSTerminal',
        default: null, // Only filled if method is 'pos'
      },
      posTerminalLabel: {
        type: String,
        default: null, // Denormalized POS terminal label
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
