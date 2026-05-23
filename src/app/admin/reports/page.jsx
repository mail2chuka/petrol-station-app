'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/Card';
import Select from '@/components/Select';
import Table from '@/components/Table';
import DateCalendar from '@/components/DateCalendar';

function todayStr() { return new Date().toISOString().split('T')[0]; }
function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ReportsPage() {
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState('');
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [comments, setComments] = useState([]);
  const [markedDates, setMarkedDates] = useState({});
  const [loadingMonth, setLoadingMonth] = useState(false);

  useEffect(() => {
    fetch('/api/stations')
      .then(r => r.json())
      .then(d => {
        const list = d.stations || [];
        setStations(list);
        if (list.length > 0) setSelectedStation(list[0]._id);
      })
      .catch(() => {});
  }, []);

  const fetchMonthMarks = useCallback(async (monthStr, stId) => {
    const sid = stId || selectedStation;
    if (!sid) return;
    setLoadingMonth(true);
    try {
      const res = await fetch(`/api/day-shifts?stationId=${sid}&month=${monthStr}`);
      const data = await res.json();
      if (!res.ok) return;
      const grouped = {};
      for (const shift of data.dayShifts || []) {
        const d = new Date(shift.date).toISOString().split('T')[0];
        grouped[d] = { total: 1, pending: shift.status === 'in_progress' ? 1 : 0 };
      }
      setMarkedDates(grouped);
    } catch {} finally { setLoadingMonth(false); }
  }, [selectedStation]);

  const fetchReport = useCallback(async (date, stId) => {
    const sid = stId || selectedStation;
    if (!sid || !date) return;
    setLoading(true);
    setError('');
    setReport(null);
    setComments([]);
    try {
      const res = await fetch(`/api/reports/daily?stationId=${sid}&date=${date}`);
      const data = await res.json();
      if (res.ok) {
        setReport(data);
        fetch(`/api/auditor/comments?stationId=${sid}&date=${date}`)
          .then(r => r.json()).then(d => setComments(d.comments || [])).catch(() => {});
      } else {
        setError(data.error || 'Failed to fetch report');
      }
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  }, [selectedStation]);

  // When station changes, reload marks + report
  useEffect(() => {
    if (!selectedStation) return;
    setMarkedDates({});
    setReport(null);
    setError('');
    fetchMonthMarks(currentMonthStr(), selectedStation);
    fetchReport(selectedDate, selectedStation);
  }, [selectedStation]);

  const handleDateChange = (date) => {
    setSelectedDate(date);
    fetchReport(date);
  };

  const stationOptions = stations.map(s => ({ value: s._id, label: `${s.name} (${s.code})` }));
  const s = report?.summary;

  const attendantColumns = [
    { header: 'Supervisor', field: 'supervisorName' },
    { header: 'Total Liters', render: (row) => `${row.totalLiters.toFixed(2)}L` },
    { header: 'Expected Amount', render: (row) => `₦${row.totalExpected.toFixed(2)}` },
    { header: 'Cash Received', render: (row) => `₦${row.totalCash.toFixed(2)}` },
    { header: 'POS Received', render: (row) => `₦${row.totalPos.toFixed(2)}` },
    { header: 'Total Received', render: (row) => `₦${(row.totalCash + row.totalPos).toFixed(2)}` },
  ];

  const salesColumns = [
    { header: 'Time', render: (row) => new Date(row.createdAt).toLocaleTimeString() },
    { header: 'Supervisor', field: 'supervisorName' },
    { header: 'Dispenser', field: 'dispenserName' },
    { header: 'Fuel Type', field: 'fuelType' },
    { header: 'Liters', render: (row) => `${row.liters.toFixed(2)}L` },
    { header: 'Expected', render: (row) => `₦${row.expectedAmount.toFixed(2)}` },
    { header: 'Actual', render: (row) => `₦${row.totalAmount.toFixed(2)}` },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Daily Reports</h1>

      {/* Station selector */}
      <div className="max-w-xs">
        <Select
          label="Station"
          name="station"
          value={selectedStation}
          onChange={(e) => setSelectedStation(e.target.value)}
          options={stationOptions}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
        {/* Calendar */}
        <div className="space-y-2">
          <DateCalendar
            value={selectedDate}
            onChange={handleDateChange}
            onMonthChange={(m) => fetchMonthMarks(m, selectedStation)}
            markedDates={markedDates}
            maxDate={todayStr()}
          />
          {loadingMonth && <p className="text-xs text-center text-gray-400">Loading month data…</p>}
        </div>

        {/* Report panel */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </h2>
            <button onClick={() => fetchReport(selectedDate)} disabled={loading} className="text-sm text-ecana-maroon hover:underline font-medium disabled:opacity-50">
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
          )}

          {loading && <div className="flex justify-center py-12"><div className="spinner" /></div>}

          {report && !loading && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-2">PMS Sales</p>
                    <p className="text-2xl font-bold text-ecana-maroon">{s.totalSales.PMS.liters.toFixed(2)}L</p>
                    <p className="text-sm text-gray-600">₦{s.totalSales.PMS.amount.toFixed(2)}</p>
                  </div>
                </Card>
                <Card>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-2">AGO Sales</p>
                    <p className="text-2xl font-bold text-green-600">{s.totalSales.AGO.liters.toFixed(2)}L</p>
                    <p className="text-sm text-gray-600">₦{s.totalSales.AGO.amount.toFixed(2)}</p>
                  </div>
                </Card>
                <Card>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-2">Total Expected</p>
                    <p className="text-2xl font-bold">₦{s.expectedAmount.toFixed(2)}</p>
                  </div>
                </Card>
                <Card>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-2">Discrepancy</p>
                    <p className={`text-2xl font-bold ${s.discrepancy > 0 ? 'text-green-600' : s.discrepancy < 0 ? 'text-red-600' : ''}`}>
                      {s.discrepancy >= 0 ? '+' : ''}₦{s.discrepancy.toFixed(2)}
                    </p>
                  </div>
                </Card>
              </div>

              <Card title="Supervisor Summary">
                <Table columns={attendantColumns} data={report.supervisorSummaries} />
              </Card>

              <Card title="All Sales">
                <Table columns={salesColumns} data={report.salesEntries} />
              </Card>

              {comments.length > 0 && (
                <Card title="Auditor Comments">
                  <div className="space-y-3">
                    {comments.map((c) => (
                      <div key={c._id} className="rounded-lg border border-gray-200 p-4 bg-white">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-gray-900">{c.auditorName}</p>
                          <p className="text-xs text-gray-500">{new Date(c.createdAt).toLocaleString()}</p>
                        </div>
                        <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{c.comment}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <Card title="Dispenser Readings">
                <div className="space-y-2">
                  {report.dayShift.dispenserAssignments.map((dispenser, index) => (
                    <div key={index} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{dispenser.dispenserName} - {dispenser.fuelType}</p>
                          {dispenser.supervisorName && <p className="text-sm text-gray-600">Supervisor: {dispenser.supervisorName}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-600">Initial: {dispenser.initialReading.toFixed(2)}L</p>
                          {dispenser.finalReading && (
                            <>
                              <p className="text-sm text-gray-600">Final: {dispenser.finalReading.toFixed(2)}L</p>
                              <p className="text-sm font-medium text-blue-600">Total: {dispenser.totalLiters.toFixed(2)}L</p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {!report && !loading && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <svg className="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-base font-medium">Select a marked day to view the report</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
