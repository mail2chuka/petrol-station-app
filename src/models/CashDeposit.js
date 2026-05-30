import mongoose from 'mongoose';

const cashDepositSchema = new mongoose.Schema(
  {
    stationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Station',
      required: [true, 'Station ID is required'],
      index: true,
    },
    stationName: {
      type: String, // Denormalized
      required: true,
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    bankName: {
      type: String,
      required: [true, 'Bank name is required'],
      trim: true,
    },
    bankBranch: String,
    accountNumber: {
      type: String,
      required: [true, 'Account number is required'],
      trim: true,
    },
    initiatedByCashierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Cashier ID is required'],
    },
    initiatedByCashierName: {
      type: String,
      required: true,
    },
    initiatedAt: {
      type: Date,
      default: () => new Date(),
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    approvedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // Filled when Admin approves/rejects
    },
    approvedByAdminName: {
      type: String,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    adminNote: {
      type: String, // Mandatory when approving or rejecting
      default: null,
    },
    rejectionReason: {
      type: String, // Additional detail if rejected
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast queries
cashDepositSchema.index({ stationId: 1, date: -1 });
cashDepositSchema.index({ stationId: 1, status: 1, createdAt: -1 });
cashDepositSchema.index({ initiatedByCashierId: 1, date: -1 });

if (mongoose.models.CashDeposit) {
  delete mongoose.models.CashDeposit;
}

export default mongoose.model('CashDeposit', cashDepositSchema);
