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
  assert.deepEqual(result.estimatedSalesByTank, { T2: 35 });
});

test('the 29th meter readings attribute sales to its corrected historical tank', () => {
  const result = attributeShiftPumpSales(
    [{ dispenserId: 'EE2-PUMP-2', fuelType: 'PMS', tankId: 'EE2-TANK-1' }],
    [],
    [{ pumpId: 'EE2-PUMP-2', opening: 657453.39, closing: 658479.98, rtt: 20.3 }],
  );
  assert.ok(Math.abs(result.salesByTank['EE2-TANK-1'] - 1006.29) < 1e-7);
  assert.equal(result.salesByTank['EE2-TANK-2'], undefined);
});

test('a missing opening reading cannot be treated as zero litres on the meter', () => {
  const result = attributeShiftPumpSales(
    [{ dispenserId: 'P1', fuelType: 'PMS', tankId: 'T1' }],
    [],
    [{ pumpId: 'P1', opening: null, closing: 1000, rtt: 0 }],
  );
  assert.deepEqual(result.salesByTank, {});
  assert.deepEqual(result.invalidReadings, ['P1']);
});
