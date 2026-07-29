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
    // Which DayShift (shift, not just calendar day) this dip belongs to.
    // Null for records predating multi-shift support — treated as the
    // station's implicit 'default' shift. See src/lib/shifts.js.
    dayShiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DayShift',
      default: null,
      index: true,
    },
    product: {
      type: String,
      enum: ['PMS', 'AGO', 'DPK', 'LPG'],
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
    adminCorrectedBy: {
      type: String,
      default: null,
    },
    adminCorrectedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: one entry per tank per date per period per shift
// (dayShiftId is null for stations without a configured shift schedule,
// so this is unchanged for them).
tankStockEntrySchema.index(
  { stationId: 1, tankId: 1, date: 1, period: 1, dayShiftId: 1 },
  { unique: true }
);
tankStockEntrySchema.index({ stationId: 1, supervisorId: 1, date: -1 });
tankStockEntrySchema.index({ stationId: 1, product: 1, date: -1 });

if (mongoose.models.TankStockEntry) {
  delete mongoose.models.TankStockEntry;
}

export default mongoose.model('TankStockEntry', tankStockEntrySchema);
