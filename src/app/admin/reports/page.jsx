'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/Card';
import Select from '@/components/Select';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Table from '@/components/Table';
import Loading from '@/components/Loading';

export default function ReportsPage() {
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  useEffect(() => {
    fetchStations();
  }, []);

  const fetchStations = async () => {
    try {
      const res = await fetch('/api/stations');
      const data = await res.json();
      setStations(data.stations || []);
      if (data.stations?.length > 0) {
        setSelectedStation(data.stations[0]._id);
      }
    } catch (error) {
      console.error('Error fetching stations:', error);
    }
  };

  const fetchReport = async () => {
    if (!selectedStation || !selectedDate) return;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/reports/daily?stationId=${selectedStation}&date=${selectedDate}`
      );
      const data = await res.json();

      if (res.ok) {
        setReport(data);
        await fetchComments(selectedStation, selectedDate);
      } else {
        setReport(null);
        alert(data.error || 'Failed to fetch report');
      }
    } catch (error) {
      console.error('Error fetching report:', error);
      alert('An error occurred while fetching the report');
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async (stationId, date) => {
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/auditor/comments?stationId=${stationId}&date=${date}`);
      const data = await res.json();
      if (res.ok) {
        setComments(data.comments || []);
      } else {
        setComments([]);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  const stationOptions = stations.map(s => ({
    value: s._id,
    label: `${s.name} (${s.code})`,
  }));

  const attendantColumns = [
    { header: 'Supervisor', field: 'supervisorName' },
    { 
      header: 'Total Liters', 
      render: (row) => `${row.totalLiters.toFixed(2)}L`
    },
    { 
      header: 'Expected Amount', 
      render: (row) => `₦${row.totalExpected.toFixed(2)}`
    },
    { 
      header: 'Cash Received', 
      render: (row) => `₦${row.totalCash.toFixed(2)}`
    },
    { 
      header: 'POS Received', 
      render: (row) => `₦${row.totalPos.toFixed(2)}`
    },
    { 
      header: 'Total Received', 
      render: (row) => `₦${row.totalReceived.toFixed(2)}`
    },
  ];

  const salesColumns = [
    { header: 'Time', render: (row) => new Date(row.createdAt).toLocaleTimeString() },
    { header: 'Supervisor', field: 'supervisorName' },
    { header: 'Dispenser', field: 'dispenserName' },
    { header: 'Fuel Type', field: 'fuelType' },
    { 
      header: 'Liters', 
      render: (row) => `${row.liters.toFixed(2)}L`
    },
    { 
      header: 'Expected', 
      render: (row) => `₦${row.expectedAmount.toFixed(2)}`
    },
    { 
      header: 'Actual', 
      render: (row) => `₦${row.totalAmount.toFixed(2)}`
    },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Daily Reports</h1>

      <Card title="Select Report Parameters" className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select
            label="Station"
            name="station"
            value={selectedStation}
            onChange={(e) => setSelectedStation(e.target.value)}
            options={stationOptions}
          />
          <Input
            label="Date"
            type="date"
            name="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <div className="flex items-end">
            <Button onClick={fetchReport} disabled={loading} className="w-full">
              {loading ? 'Loading...' : 'Generate Report'}
            </Button>
          </div>
        </div>
      </Card>

      {loading && <Loading />}

      {report && !loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">PMS Sales</p>
                <p className="text-2xl font-bold text-ecana-maroon">
                  {report.summary.totalSales.PMS.liters.toFixed(2)}L
                </p>
                <p className="text-sm text-gray-600">
                  ₦{report.summary.totalSales.PMS.amount.toFixed(2)}
                </p>
              </div>
            </Card>

            <Card>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">AGO Sales</p>
                <p className="text-2xl font-bold text-green-600">
                  {report.summary.totalSales.AGO.liters.toFixed(2)}L
                </p>
                <p className="text-sm text-gray-600">
                  ₦{report.summary.totalSales.AGO.amount.toFixed(2)}
                </p>
              </div>
            </Card>

            <Card>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">Total Expected</p>
                <p className="text-2xl font-bold text-ecana-blue">
                  ₦{report.summary.expectedAmount.toFixed(2)}
                </p>
              </div>
            </Card>

            <Card>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">Total Received</p>
                <p className="text-2xl font-bold text-ecana-magenta">
                  ₦{report.summary.actualAmount.toFixed(2)}
                </p>
                {report.summary.discrepancy !== 0 && (
                  <p className={`text-sm ${report.summary.discrepancy > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {report.summary.discrepancy > 0 ? '+' : ''}₦{report.summary.discrepancy.toFixed(2)}
                  </p>
                )}
              </div>
            </Card>
          </div>

          <Card title="Supervisor Summary" className="mb-6">
            <Table columns={attendantColumns} data={report.supervisorSummaries} />
          </Card>

          <Card title="All Sales" className="mb-6">
            <Table columns={salesColumns} data={report.salesEntries} />
          </Card>

          <Card title="Auditor Comments" className="mb-6">
            {commentsLoading ? (
              <Loading />
            ) : comments.length === 0 ? (
              <p className="text-sm text-gray-600">No auditor comments for this station and date.</p>
            ) : (
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
            )}
          </Card>

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
                      <p className="text-sm text-gray-600">
                        Initial: {dispenser.initialReading.toFixed(2)}L
                      </p>
                      {dispenser.finalReading && (
                        <>
                          <p className="text-sm text-gray-600">
                            Final: {dispenser.finalReading.toFixed(2)}L
                          </p>
                          <p className="text-sm font-medium text-blue-600">
                            Total: {dispenser.totalLiters.toFixed(2)}L
                          </p>
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
    </div>
  );
}
