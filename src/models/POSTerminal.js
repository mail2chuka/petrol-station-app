import mongoose from 'mongoose';

const posTerminalSchema = new mongoose.Schema(
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
    label: {
      type: String,
      required: [true, 'Terminal label is required'],
      trim: true,
    },
    terminalId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true, // Unique identifier from POS provider
    },
    provider: {
      type: String,
      enum: ['SoftPos', 'Verve', 'Interswitch', 'Other'],
      required: [true, 'Provider is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Admin who created this terminal
      required: true,
    },
    createdByName: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for fast lookups
posTerminalSchema.index({ stationId: 1, isActive: 1 });

if (mongoose.models.POSTerminal) {
  delete mongoose.models.POSTerminal;
}

export default mongoose.model('POSTerminal', posTerminalSchema);
