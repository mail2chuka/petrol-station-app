// The first configuration is identified by server-owned state, never by an
// absence of pump links, which can also occur on an existing station.
export function isInitialStationConfiguration({ station, isAdmin, body }) {
  if (!isAdmin || station.initialConfigurationPending !== true) return false;
  if (!Array.isArray(body.tanks) || !Array.isArray(body.dispensers)) return false;
  return Object.keys(body).every((key) => ['tanks', 'dispensers', 'editReason'].includes(key));
}

export function requiresStationEditReason(context) {
  return !isInitialStationConfiguration(context);
}

export function hasStationConfigurationChange({ station, tanks, dispensers }) {
  const tankRows = (rows) => rows.map((tank) => ({
    id: tank?._id,
    label: tank?.label,
    product: tank?.product,
    capacity: Number(tank?.capacity),
    isActive: tank?.isActive !== false,
  })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const pumpRows = (rows) => rows.map((pump) => ({
    id: pump?.dispenserId,
    name: pump?.name,
    fuelType: pump?.fuelType,
    tankId: pump?.tankId || null,
    isActive: pump?.isActive !== false,
  })).sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return (Array.isArray(tanks) && JSON.stringify(tankRows(tanks)) !== JSON.stringify(tankRows(station.tanks || []))) ||
    (Array.isArray(dispensers) && JSON.stringify(pumpRows(dispensers)) !== JSON.stringify(pumpRows(station.dispensers || [])));
}
