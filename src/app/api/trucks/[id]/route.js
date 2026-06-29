import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import Truck from '@/models/Truck';
import StockMovement from '@/models/StockMovement';
import { requireAuth, requireAdmin } from '@/lib/auth';

// GET /api/trucks/[id] — truck details + delivery history & totals
export async function GET(request, { params }) {
  try {
    await requireAuth();
    await connectDB();
    const { id } = await params;

    const truck = await Truck.findById(id).lean();
    if (!truck) return NextResponse.json({ error: 'Truck not found' }, { status: 404 });

    const truckObjId = new mongoose.Types.ObjectId(id);
    const deliveries = await StockMovement.find({ truckId: truckObjId, isOffload: true })
      .sort({ date: -1 })
      .lean();

    let totalDeclared = 0;
    let totalOffloaded = 0;
    let totalShortage = 0;
    let totalExcess = 0;
    const byStation = {};

    for (const d of deliveries) {
      const declared = d.declaredLoad || 0;
      const offloaded = d.actualOffloaded || 0;
      const variance = d.offloadVariance ?? (offloaded - declared);
      totalDeclared += declared;
      totalOffloaded += offloaded;
      if (variance < 0) totalShortage += -variance;
      else if (variance > 0) totalExcess += variance;

      const key = d.stationId?.toString() || 'unknown';
      if (!byStation[key]) byStation[key] = { stationName: d.stationName, deliveries: 0, offloaded: 0, shortage: 0, excess: 0 };
      byStation[key].deliveries += 1;
      byStation[key].offloaded += offloaded;
      if (variance < 0) byStation[key].shortage += -variance;
      else if (variance > 0) byStation[key].excess += variance;
    }

    return NextResponse.json({
      truck,
      totals: {
        deliveries: deliveries.length,
        totalDeclared,
        totalOffloaded,
        totalShortage,
        totalExcess,
      },
      byStation: Object.values(byStation),
      deliveries: deliveries.map((d) => ({
        _id: d._id,
        date: d.date,
        stationName: d.stationName,
        fuelType: d.fuelType,
        declaredLoad: d.declaredLoad,
        actualOffloaded: d.actualOffloaded,
        offloadVariance: d.offloadVariance,
        driverName: d.driverName,
        recordedByName: d.recordedByName,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to load truck' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}

// PATCH /api/trucks/[id] — update truck details / activate-deactivate (admin only)
export async function PATCH(request, { params }) {
  try {
    await requireAdmin();
    await connectDB();
    const { id } = await params;
    const body = await request.json();

    const truck = await Truck.findById(id);
    if (!truck) return NextResponse.json({ error: 'Truck not found' }, { status: 404 });

    if (body.plateNumber !== undefined) {
      const plate = String(body.plateNumber).toUpperCase().trim();
      if (plate !== truck.plateNumber) {
        const exists = await Truck.findOne({ plateNumber: plate, _id: { $ne: truck._id } });
        if (exists) return NextResponse.json({ error: 'Another truck already uses this plate number.' }, { status: 400 });
        truck.plateNumber = plate;
      }
    }
    if (body.driverName !== undefined) truck.driverName = String(body.driverName).trim();
    if (body.driverPhone !== undefined) truck.driverPhone = String(body.driverPhone).trim();
    if (body.notes !== undefined) truck.notes = String(body.notes).trim();
    if (body.isActive !== undefined) truck.isActive = Boolean(body.isActive);

    await truck.save();
    return NextResponse.json({ truck });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to update truck' },
      { status: error.message === 'Authentication required' ? 401 : 500 }
    );
  }
}
