import mongoose from 'mongoose';

const { Schema } = mongoose;

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    code: { type: String, required: true, trim: true, match: /^\d{5}$/, unique: true, index: true },
    description: { type: String },
    category: { type: String, trim: true, index: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId },
    createdByName: { type: String },
  },
  { timestamps: true }
);

productSchema.index({ category: 1, isActive: 1 });

export function getProductModel(conn) {
  return conn.models.Product || conn.model('Product', productSchema);
}
