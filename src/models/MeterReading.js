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
      type: String,
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
    // Which DayShift (shift, not just calendar day) this reading belongs to.
    // Null for records predating multi-shift support — treated as the
    // station's implicit 'default' shift. See src/lib/shifts.js.
    dayShiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DayShift',
      default: null,
      index: true,
    },
    // Opening is entered when supervisor "opens" the pump at start of shift
    opening: {
      type: Number,
      required: [true, 'Opening meter reading is required'],
      min: 0,
    },
    openingSubmittedAt: {
      type: Date,
      default: null,
    },
    // Closing and RTT are entered independently at end of shift (optional until submitted)
    closing: {
      type: Number,
      default: null,
      min: 0,
    },
    rtt: {
      type: Number,
      default: 0,
      min: 0,
    },
    closingSubmittedAt: {
      type: Date,
      default: null,
    },
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Supervisor ID is required'],
    },
    supervisorName: {
      type: String,
      required: true,
    },
    previousDayClosing: {
      type: Number,
      default: null,
    },
    discrepancyFlag: {
      type: Boolean,
      default: false,
    },
    discrepancyComment: {
      type: String,
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
      ref: 'User',
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

// dayShiftId is null for stations without a configured shift schedule, so
// this is unchanged for them.
meterReadingSchema.index({ stationId: 1, pumpId: 1, date: 1, dayShiftId: 1 }, { unique: true });
meterReadingSchema.index({ stationId: 1, supervisorId: 1, date: -1 });
meterReadingSchema.index({ stationId: 1, discrepancyFlag: 1 });

if (mongoose.models.MeterReading) {
  delete mongoose.models.MeterReading;
}

export default mongoose.model('MeterReading', meterReadingSchema);
