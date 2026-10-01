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
  for (const sale of sales) {
    litersByPump[sale.dispenserId] = (litersByPump[sale.dispenserId] || 0) + (Number(sale.liters) || 0);
    if (!fuelByPump[sale.dispenserId] && sale.fuelType) fuelByPump[sale.dispenserId] = sale.fuelType;
  }
  for (const reading of readings) {
    if (litersByPump[reading.pumpId] == null && reading.closing != null) {
      litersByPump[reading.pumpId] = Math.max(0,
        (Number(reading.closing) || 0) - (Number(reading.opening) || 0) - (Number(reading.rtt) || 0));
    }
  }

  const salesByTank = {};
  const salesByFuelFallback = {};
  for (const [pumpId, liters] of Object.entries(litersByPump)) {
    const tankId = tankByPump[pumpId];
    if (tankId) {
      salesByTank[tankId] = (salesByTank[tankId] || 0) + liters;
    } else {
      const fuelType = fuelByPump[pumpId];
      if (fuelType) salesByFuelFallback[fuelType] = (salesByFuelFallback[fuelType] || 0) + liters;
    }
  }
  return { salesByTank, salesByFuelFallback };
}
