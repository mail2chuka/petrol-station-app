import mongoose from 'mongoose';

const AttendantSchema = new mongoose.Schema(
  {
    stationId: { type: String, required: true, index: true },
    staffNumber: { type: String, required: true }, // STF-001, STF-002 …
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    dateRegistered: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    createdById: { type: mongoose.Schema.Types.ObjectId },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true }
);

AttendantSchema.index({ stationId: 1, staffNumber: 1 }, { unique: true });

export default mongoose.models.Attendant || mongoose.model('Attendant', AttendantSchema);
