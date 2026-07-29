import mongoose from 'mongoose';

const AttendantAssignmentSchema = new mongoose.Schema(
  {
    stationId: { type: String, required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    // Which DayShift (shift, not just calendar day) this assignment belongs
    // to. Null for records predating multi-shift support — treated as the
    // station's implicit 'default' shift. See src/lib/shifts.js.
    dayShiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'DayShift', default: null },
    dispenserId: { type: String, required: true },
    dispenserName: { type: String, default: '' },
    fuelType: { type: String, default: '' },
    attendantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendant', required: true },
    attendantStaffNumber: { type: String, default: '' },
    attendantName: { type: String, default: '' },
    assignedAt: { type: Date, default: Date.now },
    assignedByManagerId: { type: mongoose.Schema.Types.ObjectId },
    assignedByManagerName: { type: String, default: '' },
  },
  { timestamps: true }
);

// One assignment per pump per day per shift (upsert replaces). dayShiftId is
// null for stations without a configured shift schedule, so this is
// unchanged for them.
AttendantAssignmentSchema.index({ stationId: 1, date: 1, dispenserId: 1, dayShiftId: 1 }, { unique: true });
AttendantAssignmentSchema.index({ stationId: 1, date: 1 });
AttendantAssignmentSchema.index({ attendantId: 1, date: 1 });

export default mongoose.models.AttendantAssignment ||
  mongoose.model('AttendantAssignment', AttendantAssignmentSchema);
