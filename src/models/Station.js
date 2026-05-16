import mongoose from 'mongoose';
import { FUEL_TYPES } from '@/lib/constants';

const stationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Station name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Station code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
    },
    currentPrices: {
      PMS: {
        type: Number,
        default: 0,
      },
      AGO: {
        type: Number,
        default: 0,
      },
    },
    currentStock: {
      PMS: {
        type: Number,
        default: 0,
      },
      AGO: {
        type: Number,
        default: 0,
      },
    },
      tanks: [
        {
          _id: {
            type: String,
            required: true, // Unique tank identifier (e.g., "PMS-1", "AGO-1")
          },
          label: {
            type: String,
            required: true, // Display name (e.g., "Premium Motor Spirit Tank 1")
          },
          product: {
            type: String,
            enum: ['PMS', 'AGO'],
            required: true,
          },
          capacity: {
            type: Number,
            required: true,
            min: 1,
            // Capacity in litres
          },
          isActive: {
            type: Boolean,
            default: true,
          },
        },
      ],
      tolerancePercent: {
      type: Number,
      default: 2.5,
      min: 0,
    },
    numberOfTanks: {
      type: Number,
      default: 0,
      min: 0,
    },
    numberOfPumps: {
      type: Number,
      default: 0,
      min: 0,
    },
    dispensers: [
      {
        dispenserId: {
          type: String,
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
          tankId: {
            type: String, // Reference to tanks[*]._id
            default: null,
          },
        fuelType: {
          type: String,
          enum: Object.values(FUEL_TYPES),
          required: true,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    createdByName: {
      type: String, // Denormalized
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
stationSchema.index({ isActive: 1 });

export default mongoose.models.Station || mongoose.model('Station', stationSchema);
