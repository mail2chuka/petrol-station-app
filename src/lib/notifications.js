import Notification from '@/models/Notification';

/**
 * Create a notification for a specific user.
 */
export async function createNotification({
  recipientId,
  recipientRole,
  stationId,
  stationName,
  title,
  message,
  type = 'general',
  isAdminFlag = false,
  relatedType = null,
  relatedId = null,
}) {
  try {
    await Notification.create({
      recipientId: recipientId || null,
      recipientRole: recipientRole || null,
      stationId: stationId || null,
      stationName: stationName || null,
      title,
      message,
      type,
      isAdminFlag,
      relatedType,
      relatedId: relatedId || null,
    });
  } catch (err) {
    // Notifications are best-effort — never block main operations
    console.error('Failed to create notification:', err);
  }
}

/**
 * Notify admin about a meter reading discrepancy.
 */
export async function notifyAdminMeterDiscrepancy({
  stationId,
  stationName,
  supervisorName,
  pumpLabel,
  opening,
  previousClosing,
  comment,
  readingId,
}) {
  await createNotification({
    recipientRole: 'admin',
    stationId,
    stationName,
    title: 'Meter Discrepancy Flagged',
    message: `${supervisorName} submitted an opening reading of ${opening} for ${pumpLabel}, which differs from the previous closing of ${previousClosing}. Reason: "${comment}"`,
    type: 'meter_discrepancy',
    isAdminFlag: true,
    relatedType: 'meter_reading',
    relatedId: readingId,
  });
}

/**
 * Notify supervisor their meter reading was reviewed.
 */
export async function notifySupervisorMeterReview({
  supervisorId,
  stationId,
  stationName,
  managerName,
  pumpLabel,
  action,
  note,
  readingId,
}) {
  const approved = action === 'approve';
  await createNotification({
    recipientId: supervisorId,
    stationId,
    stationName,
    title: approved ? 'Meter Reading Approved' : 'Meter Reading Queried',
    message: approved
      ? `Your meter reading for ${pumpLabel} was approved by ${managerName}. Note: "${note}"`
      : `Your meter reading for ${pumpLabel} was queried by ${managerName}: "${note}"`,
    type: 'meter_review',
    relatedType: 'meter_reading',
    relatedId: readingId,
  });
}

/**
 * Notify admin a new bank deposit was submitted by a cashier.
 */
export async function notifyAdminDepositSubmitted({
  stationId,
  stationName,
  cashierName,
  amount,
  bankName,
  depositId,
}) {
  await createNotification({
    recipientRole: 'admin',
    stationId,
    stationName,
    title: 'New Bank Deposit Submitted',
    message: `${cashierName} submitted a deposit of ₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })} to ${bankName} — pending your approval.`,
    type: 'deposit_submitted',
    isAdminFlag: false,
    relatedType: 'cash_deposit',
    relatedId: depositId,
  });
}

/**
 * Notify cashier their deposit was approved or rejected.
 */
export async function notifyCashierDepositStatus({
  cashierId,
  stationId,
  stationName,
  adminName,
  amount,
  status,
  note,
  depositId,
}) {
  const approved = status === 'approved';
  await createNotification({
    recipientId: cashierId,
    stationId,
    stationName,
    title: approved ? 'Bank Deposit Approved' : 'Bank Deposit Rejected',
    message: approved
      ? `Your deposit of ₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })} was approved by ${adminName}. Note: "${note}"`
      : `Your deposit of ₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })} was rejected by ${adminName}: "${note}"`,
    type: 'deposit_status',
    relatedType: 'cash_deposit',
    relatedId: depositId,
  });
}
