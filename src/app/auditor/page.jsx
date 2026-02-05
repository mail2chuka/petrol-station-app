'use client';

import { useEffect, useState } from 'react';
import Card from '@/components/Card';
import Select from '@/components/Select';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Table from '@/components/Table';
import Loading from '@/components/Loading';

export default function AuditorDashboard() {
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [financialSummary, setFinancialSummary] = useState(null);
  const [financialLoading, setFinancialLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [commentStatus, setCommentStatus] = useState('');

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
    setFinancialLoading(true);
    setCommentStatus('');
    try {
      const [dailyRes, financialRes] = await Promise.all([
        fetch(`/api/reports/daily?stationId=${selectedStation}&date=${selectedDate}`),
        fetch(`/api/reports/financial-daily?stationId=${selectedStation}&date=${selectedDate}`),
      ]);

      const dailyData = await dailyRes.json();
      const financialData = await financialRes.json();

      if (dailyRes.ok) {
        setReport(dailyData);
      } else {
        setReport(null);
        alert(dailyData.error || 'Failed to fetch report');
      }

      if (financialRes.ok) {
        setFinancialSummary(financialData.summary || null);
      } else {
        setFinancialSummary(null);
      }
    } catch (error) {
      console.error('Error fetching report:', error);
      alert('An error occurred while fetching the report');
    } finally {
      setLoading(false);
      setFinancialLoading(false);
    }
  };

  const submitComment = async () => {
    if (!selectedStation || !selectedDate || !comment.trim()) return;

    setSavingComment(true);
    setCommentStatus('');
    try {
      const res = await fetch('/api/auditor/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: selectedStation,
          date: selectedDate,
          comment,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCommentStatus(data.error || 'Failed to save comment');
        return;
      }
      setComment('');
      setCommentStatus('Comment saved for admin review.');
    } catch (error) {
      setCommentStatus('An error occurred while saving the comment.');
    } finally {
      setSavingComment(false);
    }
  };

  const stationOptions = stations.map((s) => ({
    value: s._id,
    label: `${s.name} (${s.code})`,
  }));

  const attendantColumns = [
    { header: 'Attendant', field: 'attendantName' },
    { header: 'Total Liters', render: (row) => `${row.totalLiters.toFixed(2)}L` },
    { header: 'Expected Amount', render: (row) => `₦${row.totalExpected.toFixed(2)}` },
    { header: 'Cash Received', render: (row) => `₦${row.totalCash.toFixed(2)}` },
    { header: 'POS Received', render: (row) => `₦${row.totalPos.toFixed(2)}` },
    { header: 'Total Received', render: (row) => `₦${row.totalReceived.toFixed(2)}` },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Auditor Reports</h1>

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
          <Card title="Financial Summary" className="mb-6">
            {financialLoading ? (
              <Loading />
            ) : financialSummary ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500">Total Payments (Inflow)</p>
                  <p className="text-xl font-bold text-emerald-700">₦{financialSummary.totalPaymentsReceived.toFixed(2)}</p>
                  <p className="text-xs text-slate-500 mt-1">Cash: ₦{financialSummary.totalPaymentsCash.toFixed(2)} · POS: ₦{financialSummary.totalPaymentsPos.toFixed(2)}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500">Stock Receipts (Outflow)</p>
                  <p className="text-xl font-bold text-red-700">₦{financialSummary.totalStockCost.toFixed(2)}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500">Net Position</p>
                  <p className={`text-xl font-bold ${financialSummary.netPosition >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    ₦{financialSummary.netPosition.toFixed(2)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Expected Sales: ₦{financialSummary.totalSalesExpected.toFixed(2)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600">No financial summary available for this date.</p>
            )}
          </Card>

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

          <Card title="Auditor Comment" className="mb-6">
            <div className="space-y-3">
              <textarea
                className="w-full min-h-[120px] rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ecana-maroon"
                placeholder="Leave your audit comment for the admin..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              {commentStatus && (
                <p className="text-sm text-gray-600">{commentStatus}</p>
              )}
              <div className="flex justify-end">
                <Button onClick={submitComment} disabled={savingComment || !comment.trim()}>
                  {savingComment ? 'Saving...' : 'Submit Comment'}
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
