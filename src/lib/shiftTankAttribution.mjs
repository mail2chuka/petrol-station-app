// Attribute pump sales using the mapping saved on that shift. Station settings
// are mutable, so they must never be used to reconstruct an older tank report.
export function attributeShiftPumpSales(assignments, sales, readings) {
  const tankByPump = {};
  const fuelByPump = {};
  for (const assignment of assignments || []) {
    if (assignment.tankId) tankByPump[assignment.dispenserId] = assignment.tankId;
    if (assignment.fuelType) fuelByPump[assignment.dispenserId] = assignment.fuelType;
  }

  const litersByPump = {};
  const meterFallbackPumps = new Set();
  for (const sale of sales) {
    litersByPump[sale.dispenserId] = (litersByPump[sale.dispenserId] || 0) + (Number(sale.liters) || 0);
    if (!fuelByPump[sale.dispenserId] && sale.fuelType) fuelByPump[sale.dispenserId] = sale.fuelType;
  }
  const invalidReadings = [];
  for (const reading of readings) {
    if (litersByPump[reading.pumpId] != null || reading.closing == null) continue;
    const opening = Number(reading.opening);
    const closing = Number(reading.closing);
    const rtt = Number(reading.rtt ?? 0);
    if (reading.opening == null || ![opening, closing, rtt].every(Number.isFinite) || closing - opening - rtt < 0) {
      invalidReadings.push(reading.pumpId);
      continue;
    }
    meterFallbackPumps.add(reading.pumpId);
    litersByPump[reading.pumpId] = closing - opening - rtt;
  }

  const salesByTank = {};
  const salesByFuelFallback = {};
  const estimatedSalesByTank = {};
  const estimatedSalesByFuelFallback = {};
  for (const [pumpId, liters] of Object.entries(litersByPump)) {
    const tankId = tankByPump[pumpId];
    if (tankId) {
      salesByTank[tankId] = (salesByTank[tankId] || 0) + liters;
      if (meterFallbackPumps.has(pumpId)) {
        estimatedSalesByTank[tankId] = (estimatedSalesByTank[tankId] || 0) + liters;
      }
    } else {
      const fuelType = fuelByPump[pumpId];
      if (fuelType) {
        salesByFuelFallback[fuelType] = (salesByFuelFallback[fuelType] || 0) + liters;
        if (meterFallbackPumps.has(pumpId)) {
          estimatedSalesByFuelFallback[fuelType] = (estimatedSalesByFuelFallback[fuelType] || 0) + liters;
        }
      }
    }
  }
  return { salesByTank, salesByFuelFallback, estimatedSalesByTank, estimatedSalesByFuelFallback, invalidReadings };
}
