import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateShiftSummary } from '../src/lib/shiftSummary.mjs';

test('shift totals stay per product and debts stay per selling pump', () => {
  const sales = [
    { dispenserId: 'P1', fuelType: 'PMS', liters: 100, expectedAmount: 1000 },
    { dispenserId: 'P2', fuelType: 'PMS', liters: 50, expectedAmount: 500 },
    { dispenserId: 'D1', fuelType: 'AGO', liters: 20, expectedAmount: 400 },
    { dispenserId: 'P3', fuelType: 'PMS', liters: 0, expectedAmount: 0 },
  ];
  const payments = [
    { dispenserId: 'P1', cashReceived: 700, posReceived: 0, totalReceived: 700 },
    { dispenserId: 'P2', cashReceived: 600, posReceived: 0, totalReceived: 600 },
    { dispenserId: 'D1', cashReceived: 0, posReceived: 400, totalReceived: 400 },
  ];

  const summary = calculateShiftSummary(sales, payments);
  assert.deepEqual(summary.totalSales, {
    PMS: { liters: 150, amount: 1500 },
    AGO: { liters: 20, amount: 400 },
  });
  assert.deepEqual(summary.totalPayments, { cash: 1300, pos: 400 });
  assert.equal(summary.expectedAmount, 1900);
  assert.equal(summary.actualAmount, 1700);
  assert.equal(summary.discrepancy, -200);
  assert.equal(summary.collectionOutstanding, 300);
  assert.equal(summary.collectionStatus, 'pending');

  const settled = calculateShiftSummary(sales, [
    ...payments,
    { dispenserId: 'P1', cashReceived: 300, posReceived: 0, totalReceived: 300 },
  ]);
  assert.equal(settled.collectionOutstanding, 0);
  assert.equal(settled.collectionStatus, 'settled');
});
