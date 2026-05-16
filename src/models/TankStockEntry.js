import mongoose from 'mongoose';

const tankStockEntrySchema = new mongoose.Schema(
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
    tankId: {
      type: String,
      required: [true, 'Tank ID is required'],
      index: true,
    },
    tankLabel: String,
    product: {
      type: String,
      enum: ['PMS', 'AGO'],
      required: true,
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
      index: true,
    },
    period: {
      type: String,
      enum: ['opening', 'closing'],
      required: true, // 'opening' at shift start, 'closing' at shift end
    },
    openingStock: {
      type: Number,
      required: [true, 'Opening stock is required'],
      min: 0,
    },
    closingStockMeasured: {
      type: Number,
      required: [true, 'Measured closing stock is required'],
      min: 0,
    },
    closingStockManager: {
      type: Number, // Manager's approved/adjusted closing stock
      default: null,
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
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // Filled when manager approves/adjusts
    },
    managerName: {
      type: String,
      default: null,
    },
    variance: {
      type: Number, // closingStockMeasured - openingStock
      required: true,
    },
    variancePercent: {
      type: Number, // variance / openingStock * 100
      required: true,
    },
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Compound index: one entry per tank per date per period
tankStockEntrySchema.index(
  { stationId: 1, tankId: 1, date: 1, period: 1 },
  { unique: true }
);
tankStockEntrySchema.index({ stationId: 1, supervisorId: 1, date: -1 });
tankStockEntrySchema.index({ stationId: 1, product: 1, date: -1 });

if (mongoose.models.TankStockEntry) {
  delete mongoose.models.TankStockEntry;
}

export default mongoose.model('TankStockEntry', tankStockEntrySchema);
