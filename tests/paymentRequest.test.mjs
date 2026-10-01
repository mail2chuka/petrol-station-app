import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentRequestFingerprint } from '../src/lib/paymentRequest.mjs';

test('retries with the same collection values have the same fingerprint', () => {
  const first = paymentRequestFingerprint({ dayShiftId: 's1', dispenserId: 'p1', cashReceived: 10.1,
    posEntries: [{ bank: ' Bank A ', amount: 20.2, terminalId: '' }] });
  const retry = paymentRequestFingerprint({ dayShiftId: 's1', dispenserId: 'p1', cashReceived: 10.10,
    posEntries: [{ bank: 'Bank A', amount: 20.20, terminalId: null }] });
  assert.equal(first, retry);
  assert.notEqual(first, paymentRequestFingerprint({ dayShiftId: 's1', dispenserId: 'p1', cashReceived: 11,
    posEntries: [{ bank: 'Bank A', amount: 20.2 }] }));
});
