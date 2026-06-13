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
  const [stockModal, setStockModal] = useState(null);
  const [stockModalEntries, setStockModalEntries] = useState([]);
  const [stockModalReadings, setStockModalReadings] = useState([]);
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
  }, [session]);

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

  const openStockModal = async (product) => {
    setStockModal({ product });
    setStockModalLoading(true);
    setStockModalEntries([]);
    setStockModalReadings([]);
    try {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
      const [tankRes, readingsRes] = await Promise.all([
        fetch(`/api/tank-stock?stationId=${activeStationId}&date=${today}`),
        fetch(`/api/meter-readings?stationId=${activeStationId}&date=${today}`),
      ]);
      const tankData = await tankRes.json();
      const readingsData = await readingsRes.json();
      const entries = (tankData.entries || []).filter((e) => e.product === product);
      setStockModalEntries(entries);
      setStockModalReadings(readingsData.meterReadings || readingsData.readings || []);
    } catch {
      setStockModalEntries([]);
      setStockModalReadings([]);
    } finally {
      setStockModalLoading(false);
    }
  };

  const openDispenserModal = async () => {
    setDispenserModal(true);
    setDispenserModalLoading(true);
    setDispenserReadings([]);
    try {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
      const res = await fetch(`/api/meter-readings?stationId=${activeStationId}&date=${today}`);
      const data = await res.json();
      setDispenserReadings(data.meterReadings || data.readings || []);
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

  const modalProduct = stockModal?.product;
  const modalColors = PRODUCT_COLORS[modalProduct] || PRODUCT_COLORS.PMS;

  // Group modal entries by tankId
  const tankMap = {};
  for (const entry of stockModalEntries) {
    if (!tankMap[entry.tankId]) {
      tankMap[entry.tankId] = { tankLabel: entry.tankLabel || entry.tankId, opening: null, closing: null };
    }
    if (entry.period === 'opening') tankMap[entry.tankId].opening = entry;
    if (entry.period === 'closing') tankMap[entry.tankId].closing = entry;
  }
  const tankRows = Object.values(tankMap);

  return (
    <div className="space-y-6">
      {stockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close stock breakdown"
            onClick={() => setStockModal(null)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className={`${modalColors.header} p-4 text-white`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold opacity-80 uppercase tracking-wide">Per-Tank Breakdown</p>
                  <p className="text-xl font-black">{PRODUCT_LABELS[modalProduct] || modalProduct}</p>
                  <p className="text-xs opacity-70 mt-0.5">{station?.name} — Today</p>
                </div>
                <Button variant="secondary" onClick={() => setStockModal(null)}>Close</Button>
              </div>
            </div>

            <div className="p-4 max-h-[70vh] overflow-y-auto">
              {stockModalLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600" />
                </div>
              ) : tankRows.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-4xl mb-2">🛢️</p>
                  <p className="text-gray-600 font-semibold">No tank stock entries for today</p>
                  <p className="text-xs text-gray-400 mt-1">Entries are recorded when supervisors begin/end their shift</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tankRows.map((row) => {
                    const openStock = row.opening?.openingStock ?? null;
                    const closeStock = row.closing?.closingStockManager ?? row.closing?.closingStockMeasured ?? null;
                    const variance = row.closing?.variance ?? null;
                    return (
                      <div key={row.tankLabel} className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className={`px-4 py-2 ${modalColors.badge} font-bold text-sm`}>
                          {row.tankLabel}
                        </div>
                        <div className="grid grid-cols-3 divide-x divide-slate-100 bg-white">
                          <div className="p-3 text-center">
                            <p className="text-xs text-gray-500 font-semibold mb-1">Opening</p>
                            <p className="text-lg font-black text-gray-800">
                              {openStock !== null ? `${openStock.toLocaleString()}L` : '—'}
                            </p>
                          </div>
                          <div className="p-3 text-center">
                            <p className="text-xs text-gray-500 font-semibold mb-1">Closing</p>
                            <p className="text-lg font-black text-gray-800">
                              {closeStock !== null ? `${closeStock.toLocaleString()}L` : '—'}
                            </p>
                          </div>
                          <div className="p-3 text-center">
                            <p className="text-xs text-gray-500 font-semibold mb-1">Variance</p>
                            <p className={`text-lg font-black ${variance === null ? 'text-gray-400' : variance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {variance !== null ? `${variance > 0 ? '+' : ''}${variance.toLocaleString()}L` : '—'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                Total station stock for {modalProduct}: <span className="font-bold text-slate-700">
                  {(station?.currentStock?.[modalProduct] ?? 0).toLocaleString()}L
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-white via-ecana-blue-50 to-white rounded-2xl border-2 border-ecana-blue-100 shadow-lg p-6 animate-fade-in">
        <h1 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-ecana-blue to-ecana-maroon">Manager Dashboard</h1>
        <p className="text-base text-gray-600 mt-2 font-medium">{station?.name || 'Loading station...'}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {availableProducts.map((product) => {
          const colors = PRODUCT_COLORS[product] || PRODUCT_COLORS.PMS;
          return (
            <button
              key={product}
              type="button"
              onClick={() => openStockModal(product)}
              className={`group bg-gradient-to-br ${colors.card} rounded-2xl border-2 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 p-6 relative overflow-hidden cursor-pointer text-left w-full`}
            >
              <div className={`absolute top-0 right-0 w-32 h-32 ${colors.bg} rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-500`} />
              <div className="text-center relative z-10">
                <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">{product} Stock</p>
                <p className={`text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br ${colors.text}`}>
                  {(station?.currentStock?.[product] ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}L
                </p>
                <p className="text-sm text-gray-600 mt-2 font-semibold">
                  ₦{station?.currentPrices?.[product]?.toFixed(2) || '0.00'}/L
                </p>
                <p className="text-xs text-gray-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Tap for tank breakdown</p>
              </div>
            </button>
          );
        })}

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

        <div className="group bg-gradient-to-br from-orange-50 via-white to-orange-100 rounded-2xl border-2 border-orange-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-100 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="text-center relative z-10">
            <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Dispensers</p>
            <p className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-orange-600 to-orange-800">
              {station?.dispensers?.length || 0}
            </p>
          </div>
        </div>
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
              href={buildManagerHref('/manager/price-changes')}
              className="block p-4 bg-gradient-to-r from-yellow-50 to-amber-100 hover:from-yellow-100 hover:to-amber-200 rounded-xl transition-all shadow-sm hover:shadow-md border-2 border-amber-200"
            >
              <p className="font-bold text-amber-800 text-lg">💸 Mid-Day Price Change</p>
              <p className="text-sm text-gray-600 mt-1">Request a new PMS or AGO price during an active day</p>
            </a>
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
