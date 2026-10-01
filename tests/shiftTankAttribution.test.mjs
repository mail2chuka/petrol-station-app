import test from 'node:test';
import assert from 'node:assert/strict';
import { attributeShiftPumpSales } from '../src/lib/shiftTankAttribution.mjs';

test('pump reassignment changes future tank attribution without changing prior shifts', () => {
  const sales = [{ dispenserId: 'P1', fuelType: 'PMS', liters: 125 }];
  const oldShift = attributeShiftPumpSales(
    [{ dispenserId: 'P1', fuelType: 'PMS', tankId: 'T1' }], sales, []);
  const newShift = attributeShiftPumpSales(
    [{ dispenserId: 'P1', fuelType: 'PMS', tankId: 'T3' }], sales, []);

  assert.deepEqual(oldShift.salesByTank, { T1: 125 });
  assert.deepEqual(newShift.salesByTank, { T3: 125 });
});

test('unmapped historic pump uses its recorded fuel and meter fallback', () => {
  const result = attributeShiftPumpSales(
    [{ dispenserId: 'P1', fuelType: 'PMS', tankId: null },
      { dispenserId: 'P2', fuelType: 'AGO', tankId: 'T2' }],
    [{ dispenserId: 'P1', fuelType: 'PMS', liters: 20 }],
    [{ pumpId: 'P2', opening: 200, closing: 240, rtt: 5 }],
  );

  assert.deepEqual(result.salesByFuelFallback, { PMS: 20 });
  assert.deepEqual(result.salesByTank, { T2: 35 });
});
