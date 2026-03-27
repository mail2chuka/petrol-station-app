import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ORDER_STATUSES = ['pending', 'fulfilled', 'cancelled'];

const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId },
    productName: { type: String },
    unitId: { type: Schema.Types.ObjectId },
    unitName: { type: String },
    quantity: { type: Number, required: true, min: 0.001 },
    pricePerUnit: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, required: true, index: true },
    customerName: { type: String }, // denormalized
    items: { type: [orderItemSchema], required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'pending',
      index: true,
    },
    // Payment tracking
    balanceDeducted: { type: Number, default: 0 },
    amountOwed: { type: Number, default: 0 },
    notes: { type: String },
    // Lifecycle tracking
    createdBy: { type: Schema.Types.ObjectId },
    createdByName: { type: String },
    fulfilledBy: { type: Schema.Types.ObjectId },
    fulfilledByName: { type: String },
    fulfilledAt: { type: Date },
    cancelledBy: { type: Schema.Types.ObjectId },
    cancelledByName: { type: String },
    cancelledAt: { type: Date },
    cancelReason: { type: String },
  },
  { timestamps: true }
);

orderSchema.index({ customerId: 1, status: 1 });
orderSchema.index({ createdAt: -1 });

export function getOrderModel(conn) {
  return conn.models.Order || conn.model('Order', orderSchema);
}
