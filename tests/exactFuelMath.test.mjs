import test from 'node:test';
import assert from 'node:assert/strict';
import { fromKobo, fromMilliLitres, saleAmount, toKobo, toMilliLitres } from '../src/lib/exactFuelMath.mjs';

test('currency and litres use fixed precision when summed', () => {
  assert.equal(fromKobo(toKobo(0.1) + toKobo(0.2)), 0.3);
  assert.equal(fromMilliLitres(toMilliLitres(0.1) + toMilliLitres(0.2)), 0.3);
});

test('sale amount rounds once to the nearest kobo', () => {
  assert.equal(saleAmount(1.005, 1000), 1005);
  assert.equal(saleAmount(0.001, 5), 0.01);
  assert.equal(saleAmount(1.2345, 1), 1.24);
});
