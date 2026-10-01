// Attribute pump sales using the mapping saved on that shift. Station settings
// are mutable, so they must never be used to reconstruct an older tank report.
import { fromMilliLitres, toMilliLitres } from './exactFuelMath.mjs';

export function attributeShiftPumpSales(assignments, sales, readings) {
  const tankByPump = {};
  const fuelByPump = {};
  for (const assignment of assignments || []) {
    if (assignment.tankId) tankByPump[assignment.dispenserId] = assignment.tankId;
    if (assignment.fuelType) fuelByPump[assignment.dispenserId] = assignment.fuelType;
  }

  const milliLitresByPump = {};
  const meterFallbackPumps = new Set();
  for (const sale of sales) {
    milliLitresByPump[sale.dispenserId] = (milliLitresByPump[sale.dispenserId] || 0n) + toMilliLitres(sale.liters);
    if (!fuelByPump[sale.dispenserId] && sale.fuelType) fuelByPump[sale.dispenserId] = sale.fuelType;
  }
  const invalidReadings = [];
  for (const reading of readings) {
    if (milliLitresByPump[reading.pumpId] != null || reading.closing == null) continue;
    let net;
    try {
      if (reading.opening == null) throw new Error('Missing opening');
      net = toMilliLitres(reading.closing) - toMilliLitres(reading.opening) - toMilliLitres(reading.rtt ?? 0);
    } catch {
      invalidReadings.push(reading.pumpId);
      continue;
    }
    if (net < 0n) {
      invalidReadings.push(reading.pumpId);
      continue;
    }
    meterFallbackPumps.add(reading.pumpId);
    milliLitresByPump[reading.pumpId] = net;
  }

  const salesByTankMl = {};
  const salesByFuelMl = {};
  const estimatedByTankMl = {};
  const estimatedByFuelMl = {};
  for (const [pumpId, milliLitres] of Object.entries(milliLitresByPump)) {
    const tankId = tankByPump[pumpId];
    if (tankId) {
      salesByTankMl[tankId] = (salesByTankMl[tankId] || 0n) + milliLitres;
      if (meterFallbackPumps.has(pumpId)) {
        estimatedByTankMl[tankId] = (estimatedByTankMl[tankId] || 0n) + milliLitres;
      }
    } else {
      const fuelType = fuelByPump[pumpId];
      if (fuelType) {
        salesByFuelMl[fuelType] = (salesByFuelMl[fuelType] || 0n) + milliLitres;
        if (meterFallbackPumps.has(pumpId)) {
          estimatedByFuelMl[fuelType] = (estimatedByFuelMl[fuelType] || 0n) + milliLitres;
        }
      }
    }
  }
  const asLitres = (values) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, fromMilliLitres(value)]));
  const salesByTank = asLitres(salesByTankMl);
  const salesByFuelFallback = asLitres(salesByFuelMl);
  const estimatedSalesByTank = asLitres(estimatedByTankMl);
  const estimatedSalesByFuelFallback = asLitres(estimatedByFuelMl);
  return { salesByTank, salesByFuelFallback, estimatedSalesByTank, estimatedSalesByFuelFallback, invalidReadings };
}
