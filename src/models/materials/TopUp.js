import mongoose from 'mongoose';

const { Schema } = mongoose;

export const TOPUP_METHODS = ['cash', 'bank_transfer', 'paystack'];
export const TOPUP_STATUSES = ['pending', 'completed', 'failed'];

const topUpSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, required: true, index: true },
    customerName: { type: String }, // denormalized
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: TOPUP_METHODS, required: true },
    reference: { type: String, trim: true, index: true },
    status: {
      type: String,
      enum: TOPUP_STATUSES,
      default: 'pending',
      index: true,
    },
    notes: { type: String },
    confirmedBy: { type: Schema.Types.ObjectId },
    confirmedByName: { type: String },
    confirmedAt: { type: Date },
    // Paystack online payment fields
    paystackReference: { type: String, index: true },
    paystackData: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

topUpSchema.index({ customerId: 1, status: 1 });
topUpSchema.index({ createdAt: -1 });

export function getTopUpModel(conn) {
  return conn.models.TopUp || conn.model('TopUp', topUpSchema);
}
