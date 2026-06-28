"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Loading from '@/components/Loading';
import Button from '@/components/Button';

const PRODUCT_COLORS = {
  PMS: {
    card: 'from-blue-50 via-white to-blue-100 border-blue-200',
    bg: 'bg-blue-100',
    text: 'from-blue-600 to-blue-800',
    header: 'bg-blue-600',
    badge: 'bg-blue-100 text-blue-800',
  },
  AGO: {
    card: 'from-green-50 via-white to-green-100 border-green-200',
    bg: 'bg-green-100',
    text: 'from-green-600 to-green-800',
    header: 'bg-green-600',
    badge: 'bg-green-100 text-green-800',
  },
  DPK: {
    card: 'from-amber-50 via-white to-amber-100 border-amber-200',
    bg: 'bg-amber-100',
    text: 'from-amber-600 to-amber-800',
    header: 'bg-amber-600',
    badge: 'bg-amber-100 text-amber-800',
  },
  LPG: {
    card: 'from-purple-50 via-white to-purple-100 border-purple-200',
    bg: 'bg-purple-100',
    text: 'from-purple-600 to-purple-800',
    header: 'bg-purple-600',
    badge: 'bg-purple-100 text-purple-800',
  },
};

const PRODUCT_LABELS = {
  PMS: 'PMS (Petrol)',
  AGO: 'AGO (Diesel)',
  DPK: 'DPK (Kerosene)',
  LPG: 'LPG (Gas)',
};

function ManagerDashboardContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const activeStationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;
  const [station, setStation] = useState(null);
  const [activeDayShift, setActiveDayShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stockModal, setStockModal] = useState(false);
  const [stockModalClosings, setStockModalClosings] = useState([]);
  const [stockModalLoading, setStockModalLoading] = useState(false);

  const [dispenserModal, setDispenserModal] = useState(false);
  const [dispenserReadings, setDispenserReadings] = useState([]);
  const [dispenserModalLoading, setDispenserModalLoading] = useState(false);

  const buildManagerHref = (path) => {
    if (session?.user?.role === 'admin' && adminStationId) {
      return `${path}?stationId=${adminStationId}`;
    }
    return path;
  };

  useEffect(() => {
    fetchData();
  }, [session, activeStationId]);

  const fetchData = async () => {
    if (!activeStationId) return;

    try {
      const [stationRes, dayShiftRes] = await Promise.all([
        fetch(`/api/stations`),
        fetch(`/api/day-shifts?stationId=${activeStationId}&status=in_progress`),
      ]);

      const stationData = await stationRes.json();
      const dayShiftData = await dayShiftRes.json();

      if (stationData.stations?.length > 0) {
        const found = stationData.stations.find((s) => s._id === activeStationId) || null;
        setStation(found);
      }

      if (dayShiftData.dayShifts?.length > 0) {
        setActiveDayShift(dayShiftData.dayShifts[0]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openStockModal = async () => {
    setStockModal(true);
    setStockModalLoading(true);
    setStockModalClosings([]);
    try {
      const res = await fetch(`/api/tank-stock?stationId=${activeStationId}&lastPerTank=true`);
      const data = await res.json();
      setStockModalClosings(data.lastClosings || []);
    } catch {
      setStockModalClosings([]);
    } finally {
      setStockModalLoading(false);
    }
  };

  const openDispenserModal = async () => {
    setDispenserModal(true);
    setDispenserModalLoading(true);
    setDispenserReadings([]);
    try {
      const res = await fetch(`/api/meter-readings?stationId=${activeStationId}&lastPerPump=true`);
      const data = await res.json();
      setDispenserReadings(data.meterReadings || []);
    } catch {
      setDispenserReadings([]);
    } finally {
      setDispenserModalLoading(false);
    }
  };

  if (!activeStationId) {
    return (
      <Card title="Select Station">
        <p className="text-sm text-gray-600">Choose a station from the Admin Stations page to manage.</p>
      </Card>
    );
  }

  if (loading) return <Loading />;

  const availableProducts = station?.availableProducts?.length > 0
    ? station.availableProducts
    : ['PMS', 'AGO'];

  // Group last closings by product for the stock modal
  const closingsByProduct = {};
  for (const t of stockModalClosings) {
    if (!closingsByProduct[t.product]) closingsByProduct[t.product] = [];
    closingsByProduct[t.product].push(t);
  }

  // Dispenser modal data — index readings by pumpId
  const readingByPumpId = {};
  for (const r of dispenserReadings) {
    readingByPumpId[r.pumpId] = r;
  }
  const allDispensers = (station?.dispensers || []).filter(d => d.isActive !== false);
  const tankLabelMap = {};
  for (const t of (station?.tanks || [])) tankLabelMap[t._id] = t.label;

  return (
    <div className="space-y-6">
      {/* ── Fuel Stock modal ── */}
      {stockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button type="button" className="absolute inset-0 bg-black/50" onClick={() => setStockModal(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-slate-700 p-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold opacity-80 uppercase tracking-wide">Last Closing Dipstick Per Tank</p>
                  <p className="text-xl font-black">Fuel Stock</p>
                  <p className="text-xs opacity-70 mt-0.5">{station?.name}</p>
                </div>
                <Button variant="secondary" onClick={() => setStockModal(false)}>Close</Button>
              </div>
            </div>

            <div className="p-4 max-h-[70vh] overflow-y-auto">
              {stockModalLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600" />
                </div>
              ) : stockModalClosings.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-4xl mb-2">🛢️</p>
                  <p className="text-gray-600 font-semibold">No closing dipstick readings on record</p>
                  <p className="text-xs text-gray-400 mt-1">Entered by supervisors via Tank Dipstick</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {availableProducts.map(product => {
                    const tanks = closingsByProduct[product] || [];
                    const colors = PRODUCT_COLORS[product] || PRODUCT_COLORS.PMS;
                    return (
                      <div key={product}>
                        <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${colors.text.replace('bg-clip-text bg-gradient-to-br', '').trim()} text-slate-600`}>
                          {PRODUCT_LABELS[product] || product}
                        </p>
                        {tanks.length === 0 ? (
                          <p className="text-xs text-gray-400 italic px-2">No closing reading recorded</p>
                        ) : (
                          <div className="space-y-2">
                            {tanks.map(t => (
                              <div key={t.tankId} className={`rounded-xl border border-slate-200 overflow-hidden`}>
                                <div className={`px-4 py-2 ${colors.badge} font-semibold text-sm flex items-center justify-between`}>
                                  <span>{t.tankLabel}</span>
                                  <span className="text-xs font-normal opacity-70">
                                    {new Date(t.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 divide-x divide-slate-100 bg-white">
                                  <div className="p-3 text-center">
                                    <p className="text-xs text-gray-500 font-semibold mb-1">Last Closing</p>
                                    <p className="text-xl font-black text-gray-800">
                                      {Number(t.closingStockMeasured).toLocaleString('en-NG', { maximumFractionDigits: 1 })}L
                                    </p>
                                  </div>
                                  <div className="p-3 text-center">
                                    <p className="text-xs text-gray-500 font-semibold mb-1">Entered By</p>
                                    <p className="text-sm font-semibold text-gray-700">{t.supervisorName || '—'}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Dispenser modal ── */}
      {dispenserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button type="button" className="absolute inset-0 bg-black/50" onClick={() => setDispenserModal(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-orange-600 p-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold opacity-80 uppercase tracking-wide">Today's Readings</p>
                  <p className="text-xl font-black">Dispensers</p>
                  <p className="text-xs opacity-70 mt-0.5">{station?.name}</p>
                </div>
                <Button variant="secondary" onClick={() => setDispenserModal(false)}>Close</Button>
              </div>
            </div>

            <div className="p-4 max-h-[70vh] overflow-y-auto">
              {dispenserModalLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
                </div>
              ) : allDispensers.length === 0 ? (
                <p className="text-center text-gray-500 py-10">No dispensers configured.</p>
              ) : (
                <div className="space-y-3">
                  {allDispensers.map(d => {
                    const r = readingByPumpId[d.dispenserId] || null;
                    const netSold = r ? Math.max(0, (r.closing || 0) - (r.opening || 0) - (r.rtt || 0)) : null;
                    return (
                      <div key={d.dispenserId} className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="px-4 py-2 bg-orange-50 font-bold text-sm text-orange-900 flex items-center justify-between">
                          <div>
                            <span>{d.name || d.dispenserId}</span>
                            {d.tankId && (
                              <p className="text-xs font-normal text-orange-500 mt-0.5">
                                Tank: {tankLabelMap[d.tankId] || d.tankId}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-medium text-orange-600">{PRODUCT_LABELS[d.fuelType] || d.fuelType}</span>
                            {r?.date && (
                              <p className="text-xs font-normal text-orange-400">
                                {new Date(r.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                            )}
                          </div>
                        </div>
                        {r ? (
                          <div className="grid grid-cols-4 divide-x divide-slate-100 bg-white">
                            <div className="p-3 text-center">
                              <p className="text-xs text-gray-500 font-semibold mb-1">Opening</p>
                              <p className="text-base font-black text-gray-800">{Number(r.opening || 0).toLocaleString()}</p>
                            </div>
                            <div className="p-3 text-center">
                              <p className="text-xs text-gray-500 font-semibold mb-1">Closing</p>
                              <p className="text-base font-black text-gray-800">
                                {r.closing != null ? Number(r.closing).toLocaleString() : '—'}
                              </p>
                            </div>
                            <div className="p-3 text-center">
                              <p className="text-xs text-gray-500 font-semibold mb-1">RTT</p>
                              <p className="text-base font-black text-gray-500">{Number(r.rtt || 0).toLocaleString()}</p>
                            </div>
                            <div className="p-3 text-center">
                              <p className="text-xs text-gray-500 font-semibold mb-1">Net Sold</p>
                              <p className="text-base font-black text-green-700">
                                {netSold != null ? `${netSold.toLocaleString('en-NG', { maximumFractionDigits: 1 })}L` : '—'}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="px-4 py-3 bg-white text-sm text-gray-400 italic">
                            No meter reading on record
                          </div>
                        )}
                        {r?.supervisorName && (
                          <div className="px-4 py-1.5 bg-slate-50 text-xs text-slate-500 border-t border-slate-100">
                            Entered by {r.supervisorName}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-white via-ecana-blue-50 to-white rounded-2xl border-2 border-ecana-blue-100 shadow-lg p-6 animate-fade-in">
        <h1 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-ecana-blue to-ecana-maroon">Manager Dashboard</h1>
        <p className="text-base text-gray-600 mt-2 font-medium">{station?.name || 'Loading station...'}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Single Fuel Stock card */}
        <button
          type="button"
          onClick={openStockModal}
          className="group bg-gradient-to-br from-slate-50 via-white to-slate-100 rounded-2xl border-2 border-slate-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 p-6 relative overflow-hidden cursor-pointer text-left w-full"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-slate-100 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-500" />
          <div className="relative z-10">
            <p className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wide">Fuel Stock</p>
            <div className="space-y-1.5">
              {availableProducts.map(product => {
                const colors = PRODUCT_COLORS[product] || PRODUCT_COLORS.PMS;
                const vol = station?.currentStock?.[product] ?? 0;
                return (
                  <div key={product} className="flex items-center justify-between">
                    <span className={`text-xs font-bold uppercase ${colors.badge.replace('bg-', 'text-').split(' ')[0]} text-gray-600`}>{product}</span>
                    <span className="text-sm font-black text-gray-800">
                      {vol.toLocaleString('en-NG', { maximumFractionDigits: 0 })}L
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">Tap for tank breakdown</p>
          </div>
        </button>

        <div className="group bg-gradient-to-br from-purple-50 via-white to-purple-100 rounded-2xl border-2 border-purple-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-100 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="text-center relative z-10">
            <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Day Status</p>
            <p className="text-5xl font-black">
              {activeDayShift ? '🟢' : '🔴'}
            </p>
            <p className={`text-sm font-bold mt-2 ${activeDayShift ? 'text-green-700' : 'text-red-700'}`}>
              {activeDayShift ? 'Active' : 'Not Started'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openDispenserModal}
          className="group bg-gradient-to-br from-orange-50 via-white to-orange-100 rounded-2xl border-2 border-orange-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 p-6 relative overflow-hidden cursor-pointer text-left w-full"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-100 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-500" />
          <div className="text-center relative z-10">
            <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Dispensers</p>
            <p className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-orange-600 to-orange-800 tabular-nums leading-tight">
              {allDispensers.length || 0}
            </p>
            <p className="text-xs text-gray-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Tap for meter readings</p>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Station Information" className="border border-gray-200">
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <span className="text-2xl">🏢</span>
              <div>
                <p className="text-xs text-gray-500 font-semibold">Name</p>
                <p className="font-bold text-gray-900">{station?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <span className="text-2xl">🔖</span>
              <div>
                <p className="text-xs text-gray-500 font-semibold">Code</p>
                <p className="font-bold text-gray-900">{station?.code}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <span className="text-2xl">📍</span>
              <div>
                <p className="text-xs text-gray-500 font-semibold">Location</p>
                <p className="font-bold text-gray-900">{station?.location}</p>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Quick Actions" className="border border-gray-200">
          <div className="space-y-3">
            {!activeDayShift ? (
              <a
                href={buildManagerHref('/manager/begin-day')}
                className="block p-4 bg-gradient-to-r from-ecana-maroon-50 to-ecana-maroon-100 hover:from-ecana-maroon-100 hover:to-ecana-maroon-200 rounded-xl transition-all shadow-sm hover:shadow-md border-2 border-ecana-maroon-200"
              >
                <p className="font-bold text-ecana-maroon text-lg">🚀 Begin Day</p>
                <p className="text-sm text-gray-600 mt-1">Start operations for today</p>
              </a>
            ) : (
              <a
                href={buildManagerHref('/manager/end-day')}
                className="block p-4 bg-gradient-to-r from-red-50 to-red-100 hover:from-red-100 hover:to-red-200 rounded-xl transition-all shadow-sm hover:shadow-md border-2 border-red-200"
              >
                <p className="font-bold text-red-700 text-lg">🛑 End Day</p>
                <p className="text-sm text-gray-600 mt-1">Close operations for today</p>
              </a>
            )}
            <a
              href={buildManagerHref('/manager/open-pumps')}
              className="block p-4 bg-gradient-to-r from-cyan-50 to-cyan-100 hover:from-cyan-100 hover:to-cyan-200 rounded-xl transition-all shadow-sm hover:shadow-md border-2 border-cyan-200"
            >
              <p className="font-bold text-cyan-700 text-lg">⛽ Open Pumps</p>
              <p className="text-sm text-gray-600 mt-1">Select pumps available for today's operations</p>
            </a>
            <a
              href={buildManagerHref('/manager/supervisor-entries')}
              className="block p-4 bg-gradient-to-r from-amber-50 to-amber-100 hover:from-amber-100 hover:to-amber-200 rounded-xl transition-all shadow-sm hover:shadow-md border-2 border-amber-200"
            >
              <p className="font-bold text-amber-700 text-lg">🧾 Supervisor Entries</p>
              <p className="text-sm text-gray-600 mt-1">Approve or query meter and RTT submissions</p>
            </a>
            <a
              href={buildManagerHref('/manager/stock')}
              className="block p-4 bg-gradient-to-r from-green-50 to-green-100 hover:from-green-100 hover:to-green-200 rounded-xl transition-all shadow-sm hover:shadow-md border-2 border-green-200"
            >
              <p className="font-bold text-green-700 text-lg">📦 Stock In</p>
              <p className="text-sm text-gray-600 mt-1">Record received litres and split by tank</p>
            </a>
            <a
              href={buildManagerHref('/manager/closing-stock')}
              className="block p-4 bg-gradient-to-r from-fuchsia-50 to-fuchsia-100 hover:from-fuchsia-100 hover:to-fuchsia-200 rounded-xl transition-all shadow-sm hover:shadow-md border-2 border-fuchsia-200"
            >
              <p className="font-bold text-fuchsia-700 text-lg">🛢️ Closing Stock</p>
              <p className="text-sm text-gray-600 mt-1">Confirm per-tank closing stock values</p>
            </a>
            <a
              href={buildManagerHref('/manager/summary-book')}
              className="block p-4 bg-gradient-to-r from-indigo-50 to-indigo-100 hover:from-indigo-100 hover:to-indigo-200 rounded-xl transition-all shadow-sm hover:shadow-md border-2 border-indigo-200"
            >
              <p className="font-bold text-indigo-700 text-lg">📘 Summary Book</p>
              <p className="text-sm text-gray-600 mt-1">View daily summary by tank and export PDF/Excel</p>
            </a>
            <a
              href={buildManagerHref('/manager/reports')}
              className="block p-4 bg-gradient-to-r from-ecana-blue-50 to-ecana-blue-100 hover:from-ecana-blue-100 hover:to-ecana-blue-200 rounded-xl transition-all shadow-sm hover:shadow-md border-2 border-ecana-blue-200"
            >
              <p className="font-bold text-ecana-blue text-lg">📊 View Reports</p>
              <p className="text-sm text-gray-600 mt-1">Access daily reports</p>
            </a>
            <a
              href={buildManagerHref('/manager/station-config')}
              className="block p-4 bg-gradient-to-r from-slate-50 to-slate-100 hover:from-slate-100 hover:to-slate-200 rounded-xl transition-all shadow-sm hover:shadow-md border-2 border-slate-200"
            >
              <p className="font-bold text-slate-800 text-lg">🛠️ Station Config</p>
              <p className="text-sm text-gray-600 mt-1">Maintain tank and pump setup for this station</p>
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function ManagerDashboard() {
  return (
    <Suspense fallback={<Loading /> }>
      <ManagerDashboardContent />
    </Suspense>
  );
}
