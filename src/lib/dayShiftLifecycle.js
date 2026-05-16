import DayShift from '@/models/DayShift';
import { DAY_STATUS } from '@/lib/constants';

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

  const update = {
    status: DAY_STATUS.ENDED,
    endTime: new Date(),
    endedByName: 'System Auto Close (Midnight)',
  };

  const options = session ? { session } : {};
  return DayShift.updateMany(query, update, options);
}
