export function buildHistoricalPumpAssignments({ stationDispensers, stationTanks, existingAssignments = [], requestedAssignments }) {
  if (!Array.isArray(requestedAssignments) || requestedAssignments.length === 0) {
    throw new Error('Choose the historical tank for every selected pump.');
  }

  const dispensers = new Map((stationDispensers || []).map((d) => [d.dispenserId, d]));
  const tanks = new Map((stationTanks || []).map((t) => [String(t._id), t]));
  const previous = new Map(existingAssignments.map((a) => [a.dispenserId, a]));
  const seen = new Set();
  const assignments = requestedAssignments.map(({ dispenserId, tankId }) => {
    if (!dispenserId || seen.has(dispenserId)) throw new Error('Each historical pump must appear once.');
    seen.add(dispenserId);
    const old = previous.get(dispenserId);
    const dispenser = dispensers.get(dispenserId);
    if (!old && !dispenser) throw new Error(`Pump ${dispenserId} is not at this station.`);
    const tank = tanks.get(String(tankId || ''));
    if (!tank) throw new Error(`Choose a valid historical tank for ${old?.dispenserName || dispenser?.name || dispenserId}.`);
    const fuelType = old?.fuelType || dispenser?.fuelType;
    if (tank.product !== fuelType) throw new Error(`${tank.label || tankId} does not contain ${fuelType}.`);
    return {
      ...(old?.toObject ? old.toObject() : old || {}),
      dispenserId,
      dispenserName: old?.dispenserName || dispenser?.name || dispenserId,
      fuelType,
      tankId: String(tankId),
      tankLabel: tank.label || String(tankId),
      supervisorId: old?.supervisorId || null,
      supervisorName: old?.supervisorName || '',
      initialReading: old?.initialReading ?? 0,
      totalLiters: old?.totalLiters ?? 0,
    };
  });

  const oldMapping = Object.fromEntries(existingAssignments.map((a) => [a.dispenserId, a.tankId || null]));
  const newMapping = Object.fromEntries(assignments.map((a) => [a.dispenserId, a.tankId]));
  const changed = existingAssignments.length > 0 &&
    (Object.keys(oldMapping).length !== assignments.length ||
      assignments.some((a) => oldMapping[a.dispenserId] !== a.tankId));
  return { assignments, changed, oldMapping, newMapping };
}
