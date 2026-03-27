import mongoose from 'mongoose';

const { Schema } = mongoose;

export const TRANSACTION_TYPES = ['topup', 'order', 'refund', 'adjustment'];

const transactionSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, required: true, index: true },
    customerName: { type: String }, // denormalized
    type: {
      type: String,
      enum: TRANSACTION_TYPES,
      required: true,
      index: true,
    },
    // Positive = credit (topup/refund), negative = debit (order)
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    referenceType: {
      type: String,
      enum: ['TopUp', 'Order', null],
      default: null,
    },
    referenceId: { type: Schema.Types.ObjectId },
    description: { type: String },
    createdBy: { type: Schema.Types.ObjectId },
    createdByName: { type: String },
  },
  { timestamps: true }
);

transactionSchema.index({ customerId: 1, createdAt: -1 });
transactionSchema.index({ referenceType: 1, referenceId: 1 });

export function getTransactionModel(conn) {
  return conn.models.Transaction || conn.model('Transaction', transactionSchema);
}
