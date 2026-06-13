import mongoose from 'mongoose';

const PumpReassignmentSchema = new mongoose.Schema(
  {
    stationId: { type: String, required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    dispenserId: { type: String, required: true },
    dispenserName: { type: String, default: '' },
    fuelType: { type: String, default: '' },
    fromAttendantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendant' },
    fromAttendantStaffNumber: { type: String, default: '' },
    fromAttendantName: { type: String, default: '' },
    toAttendantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendant' },
    toAttendantStaffNumber: { type: String, default: '' },
    toAttendantName: { type: String, default: '' },
    reason: { type: String, required: true, trim: true },
    reassignedAt: { type: Date, default: Date.now },
    reassignedByManagerId: { type: mongoose.Schema.Types.ObjectId },
    reassignedByManagerName: { type: String, default: '' },
  },
  { timestamps: true }
);

PumpReassignmentSchema.index({ stationId: 1, date: 1 });
PumpReassignmentSchema.index({ fromAttendantId: 1 });
PumpReassignmentSchema.index({ toAttendantId: 1 });

export default mongoose.models.PumpReassignment ||
  mongoose.model('PumpReassignment', PumpReassignmentSchema);
