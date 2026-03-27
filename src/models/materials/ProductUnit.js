import mongoose from 'mongoose';

const { Schema } = mongoose;

const productUnitSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, required: true, index: true },
    productName: { type: String }, // denormalized for query speed
    // Unit name e.g. "bag", "ton", "piece", "bundle"
    name: { type: String, required: true, trim: true },
    pricePerUnit: { type: Number, required: true, min: 0 },
    stockQuantity: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId },
  },
  { timestamps: true }
);

productUnitSchema.index({ productId: 1, isActive: 1 });

export function getProductUnitModel(conn) {
  return conn.models.ProductUnit || conn.model('ProductUnit', productUnitSchema);
}
