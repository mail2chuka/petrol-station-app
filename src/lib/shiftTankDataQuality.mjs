import { attributeShiftPumpSales } from './shiftTankAttribution.mjs';

export function findShiftTankDataIssues({ assignments, sales, readings, tankEntries }) {
  const { salesByTank, invalidReadings } = attributeShiftPumpSales(assignments, sales, readings);
  const closingTanks = new Set((tankEntries || []).filter((entry) => entry.period === 'closing').map((entry) => entry.tankId));
  const issues = [];

  for (const [tankId, liters] of Object.entries(salesByTank)) {
    if (liters > 0 && !closingTanks.has(tankId)) {
      issues.push({ code: 'missing_closing_tank_dip', tankId, liters });
    }
  }
  for (const pumpId of invalidReadings) issues.push({ code: 'invalid_meter_reading', pumpId });
  return issues;
}
