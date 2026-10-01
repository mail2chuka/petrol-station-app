import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoricalPumpAssignments } from '../src/lib/historicalPumpAssignments.mjs';

const stationDispensers = [{ dispenserId: 'P1', name: 'Pump 1', fuelType: 'PMS', tankId: 'T3' }];
const stationTanks = [
  { _id: 'T1', label: 'Tank 1', product: 'PMS' },
  { _id: 'T3', label: 'Tank 3', product: 'PMS' },
  { _id: 'T4', label: 'Tank 4', product: 'AGO' },
];

test('historical mapping remains independent of the station current mapping', () => {
  const result = buildHistoricalPumpAssignments({
    stationDispensers, stationTanks,
    existingAssignments: [{ dispenserId: 'P1', dispenserName: 'Pump 1', fuelType: 'PMS', tankId: 'T1', totalLiters: 250 }],
    requestedAssignments: [{ dispenserId: 'P1', tankId: 'T1' }],
  });
  assert.equal(result.assignments[0].tankId, 'T1');
  assert.equal(result.assignments[0].totalLiters, 250);
  assert.equal(result.changed, false);
});

test('historical correction identifies changed mapping and preserves shift fields', () => {
  const result = buildHistoricalPumpAssignments({
    stationDispensers, stationTanks,
    existingAssignments: [{ dispenserId: 'P1', dispenserName: 'Pump 1', fuelType: 'PMS', tankId: 'T3', finalReading: 300 }],
    requestedAssignments: [{ dispenserId: 'P1', tankId: 'T1' }],
  });
  assert.equal(result.changed, true);
  assert.deepEqual(result.oldMapping, { P1: 'T3' });
  assert.deepEqual(result.newMapping, { P1: 'T1' });
  assert.equal(result.assignments[0].finalReading, 300);
});

test('missing, duplicate and different-product tank assignments are rejected', () => {
  const base = { stationDispensers, stationTanks };
  assert.throws(() => buildHistoricalPumpAssignments({ ...base, requestedAssignments: [] }), /Choose/);
  assert.throws(() => buildHistoricalPumpAssignments({ ...base,
    requestedAssignments: [{ dispenserId: 'P1', tankId: 'T1' }, { dispenserId: 'P1', tankId: 'T3' }],
  }), /once/);
  assert.throws(() => buildHistoricalPumpAssignments({ ...base,
    requestedAssignments: [{ dispenserId: 'P1', tankId: 'T4' }],
  }), /does not contain/);
});
