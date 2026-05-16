import mongoose from 'mongoose';

const auditCommentSchema = new mongoose.Schema(
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
    auditorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Auditor ID is required'],
    },
    auditorName: {
      type: String, // Denormalized
      required: true,
    },
    auditorRole: {
      type: String,
      enum: ['daily_auditor', 'external_auditor'],
      required: true,
    },
    period: {
      type: Date,
      required: [true, 'Period (date) is required'],
      index: true,
    },
    scope: {
      type: String,
      enum: ['account', 'standalone'],
      required: [true, 'Scope is required'],
      // 'account': tied to daily account settlement
      // 'standalone': general period comment not tied to specific account
    },
    targetType: {
      type: String,
      enum: ['daily_account', 'meter_reading', 'tank_stock', 'general'],
      default: 'general',
      // Used when scope='account' to specify what the comment is about
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null, // DayShift, MeterReading, TankStockEntry, etc. Null if general
    },
    targetRef: {
      type: String, // Description of the target for display
      default: null,
    },
    comment: {
      type: String,
      required: [true, 'Comment is required'],
      trim: true,
    },
    classification: {
      type: String,
      enum: ['observation', 'concern', 'issue', 'recommendation'],
      default: 'observation',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
auditCommentSchema.index({ stationId: 1, period: -1 });
auditCommentSchema.index({ stationId: 1, auditorId: 1, period: -1 });
auditCommentSchema.index({ stationId: 1, scope: 1, period: -1 });
auditCommentSchema.index({ auditorId: 1, createdAt: -1 });

if (mongoose.models.AuditComment) {
  delete mongoose.models.AuditComment;
}

export default mongoose.model('AuditComment', auditCommentSchema);
