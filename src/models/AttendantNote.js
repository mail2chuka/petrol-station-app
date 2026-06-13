import mongoose from 'mongoose';

const AttendantNoteSchema = new mongoose.Schema(
  {
    attendantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendant', required: true, index: true },
    stationId: { type: String, required: true },
    note: { type: String, required: true, trim: true },
    addedAt: { type: Date, default: Date.now },
    addedById: { type: mongoose.Schema.Types.ObjectId },
    addedByName: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.models.AttendantNote ||
  mongoose.model('AttendantNote', AttendantNoteSchema);
