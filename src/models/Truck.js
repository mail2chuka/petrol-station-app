import mongoose from 'mongoose';

const TruckSchema = new mongoose.Schema(
  {
    plateNumber: {
      type: String,
      required: [true, 'Plate number is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    // Default driver registered with the truck. The actual driver for a given
    // delivery is snapshotted onto the StockMovement at offload time.
    driverName: { type: String, trim: true, default: '' },
    driverPhone: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true }
);

if (mongoose.models.Truck) {
  delete mongoose.models.Truck;
}

export default mongoose.model('Truck', TruckSchema);
