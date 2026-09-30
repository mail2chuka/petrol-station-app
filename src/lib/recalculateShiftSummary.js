import DayShift from '@/models/DayShift';
import SalesEntry from '@/models/SalesEntry';
import PaymentRecord from '@/models/PaymentRecord';
import { calculateShiftSummary } from '@/lib/shiftSummary.mjs';

// Historical sales/payment edits must keep the closed shift's cached
// reconciliation in step with its source records. Shortfalls remain per pump.
export async function recalculateShiftSummary(dayShiftId) {
  const [shift, sales, payments] = await Promise.all([
    DayShift.findById(dayShiftId),
    SalesEntry.find({ dayShiftId }),
    PaymentRecord.find({ dayShiftId }),
  ]);
  if (!shift) return null;

  Object.assign(shift, calculateShiftSummary(sales, payments));
  await shift.save();
  return shift;
}
