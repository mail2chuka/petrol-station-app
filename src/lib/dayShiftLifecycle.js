import DayShift from '@/models/DayShift';
import Station from '@/models/Station';
import TankStockEntry from '@/models/TankStockEntry';
import StockMovement from '@/models/StockMovement';
import { createAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/audit';
import { DAY_STATUS } from '@/lib/constants';

const AUTO_CLOSE_LABEL = 'System Auto Close (Midnight)';

function getStartOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

export async function autoCloseExpiredInProgressShifts({ stationId, session } = {}) {
  const startOfToday = getStartOfToday();

  const query = {
    status: DAY_STATUS.IN_PROGRESS,
    date: { $lt: startOfToday },
  };
  if (stationId) {
    query.stationId = stationId;
  }

  const options = session ? { session } : {};
  const expiredShifts = await DayShift.find(query, null, options);

  for (const dayShift of expiredShifts) {
    try {
      await autoCloseOneShift(dayShift, session);
    } catch (error) {
      console.error(`Auto-close failed for day shift ${dayShift._id}:`, error);
    }
  }
}

// Mirrors the manual end-of-day flow (see /api/day-shifts/[id]/end) so a shift
// abandoned past midnight still gets its closing dipstick totals written into
// Station.currentStock instead of leaving it frozen at the previous day's value.
async function autoCloseOneShift(dayShift, session) {
  const options = session ? { session } : {};

  const station = await Station.findById(dayShift.stationId, null, options);
  if (!station) return;

  const dateStr = new Date(dayShift.date).toISOString().split('T')[0];
  const startDate = new Date(dateStr + 'T00:00:00.000Z');
  const endDate = new Date(dateStr + 'T23:59:59.999Z');

  // Scope to this shift's own closing entries, not the whole calendar day —
  // matters once a station runs multiple shifts per day. 'default'-shift days
  // also match pre-deploy docs (dayShiftId: null) since there's always at
  // most one shift per date for stations that never configured a schedule.
  const shiftRecordFilter = dayShift.shiftKey && dayShift.shiftKey !== 'default'
    ? { dayShiftId: dayShift._id }
    : { dayShiftId: { $in: [dayShift._id, null] } };

  const closingEntries = await TankStockEntry.find({
    stationId: dayShift.stationId,
    date: { $gte: startDate, $lte: endDate },
    ...shiftRecordFilter,
    period: 'closing',
  }, null, options);

  const availableProducts = station.availableProducts?.length
    ? station.availableProducts
    : ['PMS', 'AGO'];

  if (!(station.currentStock instanceof Map)) {
    station.currentStock = new Map(Object.entries(station.currentStock || {}));
  }

  let stockChanged = false;
  for (const fuelType of availableProducts) {
    const productClosingEntries = closingEntries.filter(e => e.product === fuelType);
    // An abandoned day may be missing dipstick readings entirely — only trust
    // the closing figure when at least one reading exists, so we never zero
    // out currentStock for a product that simply wasn't measured that day.
    if (productClosingEntries.length === 0) continue;

    const previousStock = station.currentStock.get(fuelType) ?? 0;
    const closingTotal = productClosingEntries.reduce((sum, e) => sum + e.closingStockMeasured, 0);

    station.currentStock.set(fuelType, closingTotal);
    stockChanged = true;

    await StockMovement.create([{
      stationId: station._id,
      stationName: station.name,
      date: startDate,
      fuelType,
      movementType: 'sale',
      quantity: closingTotal - previousStock,
      previousStock,
      newStock: closingTotal,
      recordedBy: dayShift.startedBy,
      recordedByName: AUTO_CLOSE_LABEL,
      referenceId: dayShift._id,
      notes: `End of day closing stock (auto-closed) for ${dateStr}`,
    }], { session, ordered: true });
  }

  if (stockChanged) {
    station.markModified('currentStock');
    await station.save(options);
  }

  dayShift.status = DAY_STATUS.ENDED;
  dayShift.endTime = new Date();
  dayShift.endedByName = AUTO_CLOSE_LABEL;
  await dayShift.save(options);

  await createAuditLog({
    userId: dayShift.startedBy,
    userName: AUTO_CLOSE_LABEL,
    userRole: 'system',
    action: AUDIT_ACTIONS.END_DAY,
    resource: AUDIT_RESOURCES.DAY_SHIFT,
    resourceId: dayShift._id.toString(),
    stationId: dayShift.stationId,
    stationName: dayShift.stationName,
    details: {
      date: dateStr,
      autoClosed: true,
      stockUpdated: stockChanged,
    },
  });
}
