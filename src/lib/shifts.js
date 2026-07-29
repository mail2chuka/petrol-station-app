// Shared helper for resolving a station's shift schedule. Stations that
// haven't configured shifts (the vast majority, at least initially) behave
// as a single implicit 'default' shift spanning the whole day — this keeps
// every unconfigured station's begin/end/report flow unchanged.
export const DEFAULT_SHIFT = { key: 'default', label: 'Full Day', order: 1, isActive: true };

export function getEffectiveShiftSchedule(station) {
  const configured = (station?.shiftSchedule || []).filter((s) => s.isActive !== false);
  if (!configured.length) return [DEFAULT_SHIFT];
  return [...configured].sort((a, b) => a.order - b.order);
}

export function resolveShiftMeta(station, shiftKey) {
  const schedule = getEffectiveShiftSchedule(station);
  const match = schedule.find((s) => s.key === (shiftKey || DEFAULT_SHIFT.key));
  return match || DEFAULT_SHIFT;
}
