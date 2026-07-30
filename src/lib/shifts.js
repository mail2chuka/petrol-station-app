// Computes a shift's identity from its position in the day, not from any
// per-station configuration. A day with totalShiftsPlanned <= 1 (the vast
// majority) always resolves to the single implicit 'default'/'Full Day'
// shift, keeping every single-shift day's behavior/labels unchanged.
export function computeShiftMeta(order, totalShiftsPlanned) {
  const total = totalShiftsPlanned || 1;
  if (total <= 1) return { key: 'default', label: 'Full Day', order: 1 };
  return { key: `shift-${order}`, label: `Shift ${order}`, order };
}
