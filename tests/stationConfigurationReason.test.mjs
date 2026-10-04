import test from 'node:test';
import assert from 'node:assert/strict';
import { hasStationConfigurationChange, isInitialStationConfiguration, requiresStationEditReason } from '../src/lib/stationConfigurationReason.mjs';

const configuration = {
  tanks: [{ _id: 'T1', product: 'PMS' }],
  dispensers: [{ dispenserId: 'P1', tankId: 'T1' }],
};

test('only a newly created station gets a reason-free first configuration', () => {
  assert.equal(isInitialStationConfiguration({ station: { initialConfigurationPending: true }, isAdmin: true, body: configuration }), true);
  assert.equal(isInitialStationConfiguration({ station: { initialConfigurationPending: false }, isAdmin: true, body: configuration }), false);
  assert.equal(isInitialStationConfiguration({ station: {}, isAdmin: true, body: configuration }), false);
});

test('initial setup cannot exempt a manager or unrelated station changes', () => {
  const station = { initialConfigurationPending: true };
  assert.equal(isInitialStationConfiguration({ station, isAdmin: false, body: configuration }), false);
  assert.equal(isInitialStationConfiguration({ station, isAdmin: true, body: { ...configuration, numberOfPumps: 2 } }), false);
  assert.equal(isInitialStationConfiguration({ station, isAdmin: true, body: { tanks: configuration.tanks } }), false);
});

test('all station edit forms require a reason outside the admin first mapping save', () => {
  const pending = { initialConfigurationPending: true };
  const configured = { initialConfigurationPending: false };
  assert.equal(requiresStationEditReason({ station: pending, isAdmin: true, body: configuration }), false);
  for (const body of [
    { availableProducts: ['PMS'] },
    { tolerancePercent: 2 },
    { name: 'Changed station' },
    { numberOfPumps: 4 },
    configuration,
  ]) {
    assert.equal(requiresStationEditReason({ station: configured, isAdmin: true, body }), true);
  }
  assert.equal(requiresStationEditReason({ station: pending, isAdmin: false, body: configuration }), true);
});

test('later edits to tank and pump details count as configuration changes', () => {
  const station = {
    tanks: [{ _id: 'T1', label: 'Tank 1', product: 'PMS', capacity: 10000, isActive: true }],
    dispensers: [{ dispenserId: 'P1', name: 'Pump 1', fuelType: 'PMS', tankId: 'T1', isActive: true }],
  };
  assert.equal(hasStationConfigurationChange({ station, tanks: [{ ...station.tanks[0], capacity: 12000 }] }), true);
  assert.equal(hasStationConfigurationChange({ station, dispensers: [{ ...station.dispensers[0], name: 'Front pump' }] }), true);
  assert.equal(hasStationConfigurationChange({ station, tanks: [...station.tanks, { _id: 'T2', label: 'Tank 2', product: 'PMS', capacity: 10000 }] }), true);
  assert.equal(hasStationConfigurationChange({ station, tanks: [{ ...station.tanks[0] }], dispensers: [{ ...station.dispensers[0] }] }), false);
});
