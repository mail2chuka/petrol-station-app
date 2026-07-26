import mongoose from 'mongoose';
import TankStockEntry from '@/models/TankStockEntry';

// Single source of truth for "current stock" everywhere it's displayed.
// Station.currentStock is only a write-time snapshot (updated at day-end) and
// can drift stale — this computes it live from each tank's most recent closing
// dipstick reading, the same data the manager's "tap for tank breakdown" modal
// already uses, so every page agrees.
export async function getLiveCurrentStock(stationIds) {
  const objectIds = stationIds.map((id) =>
    typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
  );

  const rows = await TankStockEntry.aggregate([
    { $match: { stationId: { $in: objectIds }, period: 'closing', closingStockMeasured: { $ne: null } } },
    { $sort: { date: -1, createdAt: -1 } },
    {
      $group: {
        _id: { stationId: '$stationId', tankId: '$tankId' },
        product: { $first: '$product' },
        closingStockMeasured: { $first: '$closingStockMeasured' },
      },
    },
    {
      $group: {
        _id: { stationId: '$_id.stationId', product: '$product' },
        total: { $sum: '$closingStockMeasured' },
      },
    },
  ]);

  const byStation = {};
  for (const row of rows) {
    const sid = row._id.stationId.toString();
    if (!byStation[sid]) byStation[sid] = {};
    byStation[sid][row._id.product] = row.total;
  }
  return byStation;
}

// Applies live stock onto a plain (lean) station object's currentStock field,
// defaulting to 0 for each of the station's declared products.
export function applyLiveStock(station, liveStockByStation) {
  const availableProducts = station.availableProducts?.length
    ? station.availableProducts
    : ['PMS', 'AGO'];
  const live = liveStockByStation[station._id.toString()] || {};
  const currentStock = {};
  for (const p of availableProducts) {
    currentStock[p] = live[p] ?? 0;
  }
  station.currentStock = currentStock;
  return station;
}
