"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Select from '@/components/Select';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Table from '@/components/Table';
import Loading from '@/components/Loading';

function ManagerReportsPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const activeStationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    if (!activeStationId || !selectedDate) return;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/reports/daily?stationId=${activeStationId}&date=${selectedDate}`
      );
      const data = await res.json();

      if (res.ok) {
        setReport(data);
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

  useEffect(() => {
    if (activeStationId) {
      fetchReport();
    }
  }, [session, activeStationId]);

  const attendantColumns = [
    { header: 'Attendant', field: 'attendantName' },
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

  if (!activeStationId) {
    return (
      <Card title="Select Station">
        <p className="text-sm text-gray-600">Choose a station from the Admin Stations page to manage.</p>
      </Card>
    );
  }

  if (loading) return <Loading />;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Station Reports</h1>

      <Card title="Select Date" className="mb-6">
        <div className="flex gap-4">
          <Input
            label="Date"
            type="date"
            name="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex-1"
          />
          <div className="flex items-end">
            <Button onClick={fetchReport} disabled={loading}>
              {loading ? 'Loading...' : 'Generate Report'}
            </Button>
          </div>
        </div>
      </Card>

      {report && (
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

          <Card title="Attendant Summary" className="mb-6">
            <Table columns={attendantColumns} data={report.attendantSummaries} />
          </Card>

          <Card title="Dispenser Readings">
            <div className="space-y-2">
              {report.dayShift.dispenserAssignments.map((dispenser, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{dispenser.dispenserName} - {dispenser.fuelType}</p>
                      <p className="text-sm text-gray-600">Attendant: {dispenser.attendantName}</p>
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

export default function ManagerReportsPage() {
  return (
    <Suspense fallback={<Loading /> }>
      <ManagerReportsPageContent />
    </Suspense>
  );
}
