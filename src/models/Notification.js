import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    // Who should receive this notification (null = admin-only system notification)
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },
    recipientRole: {
      type: String,
      index: true,
      default: null,
    },
    // Station context
    stationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Station',
      index: true,
      default: null,
    },
    stationName: {
      type: String,
      default: null,
    },
    // Notification content
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    // Type for filtering/display
    type: {
      type: String,
      enum: [
        'meter_discrepancy',   // supervisor's opening differs from prev closing
        'meter_review',        // manager reviewed a meter reading
        'deposit_submitted',   // cashier submitted a bank deposit
        'deposit_status',      // admin approved/rejected a deposit
        'payment_review',      // manager reviewed a payment collection
        'flag_raised',         // auditor raised a flag
        'general',
      ],
      default: 'general',
      index: true,
    },
    // Whether the notification requires admin attention (shown in admin flags)
    isAdminFlag: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Reference to the related document
    relatedType: {
      type: String,
      enum: ['meter_reading', 'cash_deposit', 'payment_record', 'flag', 'day_shift', null],
      default: null,
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ stationId: 1, isAdminFlag: 1, createdAt: -1 });
notificationSchema.index({ recipientRole: 1, isRead: 1, createdAt: -1 });

if (mongoose.models.Notification) {
  delete mongoose.models.Notification;
}

export default mongoose.model('Notification', notificationSchema);
