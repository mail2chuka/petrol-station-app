import DayShift from '@/models/DayShift';
import { DAY_STATUS } from '@/lib/constants';

export const CLOSED_SHIFT_ENTRY_ERROR = 'This shift is not open. Use Historical Data Entry for entries or corrections after closing.';

// The operating date must match the open shift; an old entry must never be
// attached to a different shift that happens to be open at the same station.
export async function findOpenShiftForEntry({ stationId, date, dayShiftId, legacyRecord = false, session }) {
  const query = { stationId, status: DAY_STATUS.IN_PROGRESS };
  if (dayShiftId) query._id = dayShiftId;
  const shift = await DayShift.findOne(query).session(session || null);
  if (!shift) return null;
  if (date && new Date(shift.date).toISOString().slice(0, 10) !== date) return null;
  if (legacyRecord && !dayShiftId) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    const firstShift = await DayShift.findOne({ stationId, date: { $gte: start, $lte: end } })
      .sort({ shiftOrder: 1, _id: 1 }).session(session || null);
    if (!firstShift || String(firstShift._id) !== String(shift._id)) return null;
  }
  return shift;
}
