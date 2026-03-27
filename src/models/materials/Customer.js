import mongoose from 'mongoose';

const { Schema } = mongoose;

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    address: { type: String, trim: true },
    balance: { type: Number, default: 0 },
    isFlagged: { type: Boolean, default: false, index: true },
    flagReason: { type: String },
    creditLimit: { type: Number, default: 0, min: 0 },
    // Linked login account (User with role=customer)
    userId: { type: Schema.Types.ObjectId, index: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId },
    createdByName: { type: String },
  },
  { timestamps: true }
);

customerSchema.index({ isFlagged: 1, isActive: 1 });

export function getCustomerModel(conn) {
  return conn.models.Customer || conn.model('Customer', customerSchema);
}
