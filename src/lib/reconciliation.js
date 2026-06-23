// Single source of truth for tank stock reconciliation.
//
// Expected closing = opening + stock-in (deliveries) − sales (net litres dispensed).
// Variance = measured closing − expected closing.
//   variance < 0 → shortage (less fuel than accounted for)
//   variance > 0 → overage  (more fuel than accounted for)
// Expected tolerance = sales × tolerancePercent% (tolerance is a % of SALES).
//
// Used by the summary-book report, its export, the tank-stock API, and the
// historic-entry wizard so every "variance" figure agrees.

export function reconcile({ opening = 0, stockIn = 0, sales = 0, closing = 0 }) {
  const o = Number(opening) || 0;
  const si = Number(stockIn) || 0;
  const s = Number(sales) || 0;
  const c = Number(closing) || 0;

  const expectedClosing = o + si - s;
  const variance = c - expectedClosing;

  return {
    expectedClosing,
    variance,
    shortage: Math.max(0, -variance),
    overage: Math.max(0, variance),
  };
}

// Tolerance band in litres for a given sales volume.
export function expectedTolerance(sales, tolerancePercent = 0) {
  return (Number(sales) || 0) * ((Number(tolerancePercent) || 0) / 100);
}

// True when a shortage exceeds the allowed tolerance band.
export function isOverTolerance(shortage, sales, tolerancePercent = 0) {
  const band = expectedTolerance(sales, tolerancePercent);
  return band >= 0 && shortage > band;
}

// Resolve the tolerance % to apply for a day: prefer the per-day snapshot
// captured at price-setting time, fall back to the station's current value.
export function resolveTolerancePercent(dayShift, station) {
  const day = dayShift?.tolerancePercent;
  if (day !== undefined && day !== null && Number.isFinite(Number(day))) {
    return Number(day);
  }
  return Number(station?.tolerancePercent ?? 0) || 0;
}
