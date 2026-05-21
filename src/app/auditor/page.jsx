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
  const [comment, setComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [commentStatus, setCommentStatus] = useState('');
  const [previousComments, setPreviousComments] = useState([]);

  useEffect(() => {
    fetchStations();
  }, []);

  useEffect(() => {
    if (selectedStation && selectedDate) fetchComments();
  }, [selectedStation, selectedDate]);

  const fetchStations = async () => {
    try {
      const res = await fetch('/api/stations');
      const data = await res.json();
      setStations(data.stations || []);
      if (data.stations?.length > 0) setSelectedStation(data.stations[0]._id);
    } catch (err) {
      console.error('Error fetching stations:', err);
    }
  };

  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/auditor/comments?stationId=${selectedStation}&date=${selectedDate}`);
      const data = await res.json();
      setPreviousComments(data.comments || []);
    } catch (err) {
      console.error('Error fetching comments:', err);
    }
  };

  const fetchReport = async () => {
    if (!selectedStation || !selectedDate) return;
    setLoading(true);
    setCommentStatus('');
    try {
      const [dailyRes, financialRes] = await Promise.all([
        fetch(`/api/reports/daily?stationId=${selectedStation}&date=${selectedDate}`),
        fetch(`/api/reports/financial-daily?stationId=${selectedStation}&date=${selectedDate}`),
      ]);
      const dailyData = await dailyRes.json();
      const financialData = await financialRes.json();
      setReport(dailyRes.ok ? dailyData : null);
      setFinancialSummary(financialRes.ok ? (financialData.summary || null) : null);
    } catch (err) {
      console.error('Error fetching report:', err);
    } finally {
      setLoading(false);
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
        body: JSON.stringify({ stationId: selectedStation, date: selectedDate, comment }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCommentStatus(data.error || 'Failed to save comment');
        return;
      }
      setComment('');
      setCommentStatus('Comment saved.');
      fetchComments();
    } catch (err) {
      setCommentStatus('An error occurred while saving the comment.');
    } finally {
      setSavingComment(false);
    }
  };

  const stationName = stations.find((s) => s._id === selectedStation)?.name || '';

  const attendantColumns = [
    { header: 'Supervisor', field: 'attendantName' },
    { header: 'Total Litres', render: (row) => `${row.totalLiters.toFixed(2)}L` },
    { header: 'Expected', render: (row) => `₦${row.totalExpected.toFixed(2)}` },
    { header: 'Cash', render: (row) => `₦${row.totalCash.toFixed(2)}` },
    { header: 'POS', render: (row) => `₦${row.totalPos.toFixed(2)}` },
    { header: 'Received', render: (row) => `₦${row.totalReceived.toFixed(2)}` },
  ];

  return (
    <>
      {/* Print-only header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold">Daily Audit Report</h1>
        <p className="text-sm">{stationName} — {selectedDate}</p>
      </div>

      <div className="space-y-6">
        {/* Controls — hidden on print */}
        <div className="print:hidden flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Daily Report</h1>
            <p className="text-sm text-slate-500 mt-1">Select a station and date to generate a report.</p>
          </div>
          {report && (
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all shadow-sm shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print / Save PDF
            </button>
          )}
        </div>

        <Card title="Report Parameters" className="print:hidden">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Station"
              name="station"
              value={selectedStation}
              onChange={(e) => setSelectedStation(e.target.value)}
              options={stations.map((s) => ({ value: s._id, label: `${s.name} (${s.code})` }))}
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
            {financialSummary && (
              <Card title="Financial Summary">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                    <p className="text-xs text-slate-500">Total Payments (Inflow)</p>
                    <p className="text-xl font-bold text-emerald-700">₦{financialSummary.totalPaymentsReceived.toFixed(2)}</p>
                    <p className="text-xs text-slate-400 mt-1">Cash: ₦{financialSummary.totalPaymentsCash.toFixed(2)} · POS: ₦{financialSummary.totalPaymentsPos.toFixed(2)}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-red-50 border border-red-100">
                    <p className="text-xs text-slate-500">Stock Receipts (Outflow)</p>
                    <p className="text-xl font-bold text-red-700">₦{financialSummary.totalStockCost.toFixed(2)}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-xs text-slate-500">Net Position</p>
                    <p className={`text-xl font-bold ${financialSummary.netPosition >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      ₦{financialSummary.netPosition.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Expected Sales: ₦{financialSummary.totalSalesExpected.toFixed(2)}</p>
                  </div>
                </div>
              </Card>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'PMS Litres', value: `${report.summary.totalSales.PMS.liters.toFixed(2)}L`, sub: `₦${report.summary.totalSales.PMS.amount.toFixed(2)}` },
                { label: 'AGO Litres', value: `${report.summary.totalSales.AGO.liters.toFixed(2)}L`, sub: `₦${report.summary.totalSales.AGO.amount.toFixed(2)}` },
                { label: 'Expected', value: `₦${report.summary.expectedAmount.toFixed(2)}` },
                { label: 'Received', value: `₦${report.summary.actualAmount.toFixed(2)}`, highlight: report.summary.discrepancy !== 0, discrepancy: report.summary.discrepancy },
              ].map((card) => (
                <div key={card.label} className="p-4 bg-white border border-slate-200 rounded-xl">
                  <p className="text-xs text-slate-500 mb-1">{card.label}</p>
                  <p className="text-lg font-bold text-slate-900">{card.value}</p>
                  {card.sub && <p className="text-xs text-slate-400">{card.sub}</p>}
                  {card.highlight && card.discrepancy !== 0 && (
                    <p className={`text-xs font-medium mt-1 ${card.discrepancy > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {card.discrepancy > 0 ? '+' : ''}₦{card.discrepancy.toFixed(2)}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <Card title="Supervisor Summary">
              <Table columns={attendantColumns} data={report.attendantSummaries} />
            </Card>
          </>
        )}

        {/* Comment section — always visible (not gated behind report) */}
        <Card title="Audit Comment" className="print:hidden">
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Leave a comment for {selectedDate}{stationName ? ` — ${stationName}` : ''}. Comments are saved to the admin.
            </p>
            <textarea
              className="w-full min-h-[120px] rounded-xl border-2 border-slate-200 p-3 text-sm focus:outline-none focus:border-ecana-maroon focus:ring-4 focus:ring-ecana-maroon/10 transition-all resize-none"
              placeholder="Leave your audit comment..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            {commentStatus && (
              <p className={`text-sm ${commentStatus === 'Comment saved.' ? 'text-green-600' : 'text-red-600'}`}>{commentStatus}</p>
            )}
            <div className="flex justify-end">
              <Button onClick={submitComment} disabled={savingComment || !comment.trim() || !selectedStation}>
                {savingComment ? 'Saving...' : 'Submit Comment'}
              </Button>
            </div>
          </div>

          {previousComments.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Previous comments for this date</p>
              {previousComments.map((c) => (
                <div key={c._id} className="p-3 bg-slate-50 rounded-lg text-sm">
                  <p className="text-slate-700">{c.comment}</p>
                  <p className="text-xs text-slate-400 mt-1">{new Date(c.createdAt).toLocaleString('en-NG')}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <style>{`
        @media print {
          @page { margin: 1.5cm; }
          body { font-size: 12pt; }
        }
      `}</style>
    </>
  );
}
