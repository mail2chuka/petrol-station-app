import test from 'node:test';
import assert from 'node:assert/strict';
import { findShiftTankDataIssues } from '../src/lib/shiftTankDataQuality.mjs';

test('detects a 29 September style mapping that points sold litres to a tank without a closing dip', () => {
  const issues = findShiftTankDataIssues({
    assignments: [{ dispenserId: 'P2', fuelType: 'PMS', tankId: 'T2' }],
    sales: [],
    readings: [{ pumpId: 'P2', opening: 100, closing: 150, rtt: 0 }],
    tankEntries: [{ tankId: 'T1', period: 'closing' }],
  });
  assert.deepEqual(issues, [{ code: 'missing_closing_tank_dip', tankId: 'T2', liters: 50 }]);
});

test('corrected mapping has no issue', () => {
  const issues = findShiftTankDataIssues({
    assignments: [{ dispenserId: 'P2', fuelType: 'PMS', tankId: 'T1' }],
    sales: [],
    readings: [{ pumpId: 'P2', opening: 100, closing: 150, rtt: 0 }],
    tankEntries: [{ tankId: 'T1', period: 'closing' }],
  });
  assert.deepEqual(issues, []);
});
