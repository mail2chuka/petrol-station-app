import mongoose from 'mongoose';

const pumpOpeningSchema = new mongoose.Schema(
  {
    stationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Station',
      required: [true, 'Station ID is required'],
      index: true,
    },
    stationName: {
      type: String, // Denormalized for performance
      required: true,
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
      index: true,
    },
    openedByManagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Manager ID is required'],
    },
    openedByManagerName: {
      type: String, // Denormalized
      required: true,
    },
    pumps: [
      {
        _id: { type: String, required: true }, // pumpId reference
        pumpLabel: String,
        openedAt: {
          type: Date,
          required: true,
        },
        addedLate: {
          type: Boolean,
          default: false,
        },
      },
    ],
    dayClosed: {
      type: Boolean,
      default: false,
    },
    closedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for uniqueness: one pump opening per station per day
pumpOpeningSchema.index({ stationId: 1, date: 1 }, { unique: true });

if (mongoose.models.PumpOpening) {
  delete mongoose.models.PumpOpening;
}

export default mongoose.model('PumpOpening', pumpOpeningSchema);
