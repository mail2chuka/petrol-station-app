'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Card from '@/components/Card';
import Table from '@/components/Table';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/Button';
import { PageLoader } from '@/components/Loading';

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-700',
  fulfilled: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

function money(value) {
  return `₦${Number(value || 0).toLocaleString()}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function CustomerReportsPage() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState('sales');
  const [filters, setFilters] = useState({
    from: '',
    to: todayIso(),
    status: 'all',
  });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchReport = useCallback(async (nextFilters) => {
    setSubmitting(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (nextFilters.from) params.set('from', nextFilters.from);
      if (nextFilters.to) params.set('to', nextFilters.to);
      if (nextFilters.status) params.set('status', nextFilters.status);

      const res = await fetch(`/api/materials/customer/reports?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load reports');
      setReport(data);
    } catch (err) {
      setError(err.message || 'Failed to load reports');
      setReport(null);
    } finally {
      setSubmitting(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'loading' || !session) return;
    fetchReport(filters);
  }, [session, status, filters, fetchReport]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const salesColumns = useMemo(() => ([
    { header: 'Date', render: (row) => new Date(row.createdAt).toLocaleDateString() },
    { header: 'Items', field: 'itemSummary' },
    { header: 'Total', render: (row) => money(row.totalAmount) },
    { header: 'Paid', render: (row) => money(row.paidAmount) },
    { header: 'Outstanding', render: (row) => row.owedAmount > 0 ? <span className="text-red-600">{money(row.owedAmount)}</span> : '—' },
    {
      header: 'Status',
      render: (row) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[row.status] || ''}`}>
          {row.status}
        </span>
      ),
    },
  ]), []);

  const statementColumns = useMemo(() => ([
    { header: 'Date', render: (row) => new Date(row.createdAt).toLocaleString() },
    { header: 'Reference', field: 'referenceLabel' },
    { header: 'Description', field: 'description' },
    { header: 'Credit', render: (row) => row.credit > 0 ? <span className="font-semibold text-emerald-600">{money(row.credit)}</span> : '—' },
    { header: 'Debit', render: (row) => row.debit > 0 ? <span className="font-semibold text-red-600">{money(row.debit)}</span> : '—' },
    { header: 'Balance', render: (row) => money(row.balanceAfter) },
  ]), []);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!report) return;

    const [{ jsPDF }, autoTableModule] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const autoTable = autoTableModule.default;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const title = activeTab === 'sales' ? 'Sales Report' : 'Account Statement';
    const generated = new Date(report.generatedAt).toLocaleString();

    doc.setFontSize(18);
    doc.text(`Ecana Group Materials - ${title}`, 40, 40);
    doc.setFontSize(10);
    doc.text(`Customer: ${report.customer.name}`, 40, 60);
    doc.text(`Generated: ${generated}`, 40, 75);
    doc.text(
      `Filters: ${report.filters.from || 'Beginning'} to ${report.filters.to || 'Today'}${activeTab === 'sales' ? ` | Status: ${report.filters.status}` : ''}`,
      40,
      90
    );

    if (activeTab === 'sales') {
      autoTable(doc, {
        startY: 115,
        head: [['Date', 'Items', 'Total', 'Paid', 'Outstanding', 'Status']],
        body: report.salesOrders.map((row) => ([
          new Date(row.createdAt).toLocaleDateString(),
          row.itemSummary,
          money(row.totalAmount),
          money(row.paidAmount),
          row.owedAmount > 0 ? money(row.owedAmount) : '—',
          row.status,
        ])),
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [15, 23, 42] },
      });
    } else {
      autoTable(doc, {
        startY: 115,
        head: [['Date', 'Reference', 'Description', 'Credit', 'Debit', 'Balance']],
        body: report.statementEntries.map((row) => ([
          new Date(row.createdAt).toLocaleString(),
          row.referenceLabel,
          row.description,
          row.credit > 0 ? money(row.credit) : '—',
          row.debit > 0 ? money(row.debit) : '—',
          money(row.balanceAfter),
        ])),
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [15, 23, 42] },
      });
    }

    doc.save(`ecana-${activeTab === 'sales' ? 'sales-report' : 'account-statement'}-${report.customer.name.replace(/\s+/g, '-').toLowerCase()}.pdf`);
  };

  if (status === 'loading' || loading) return <PageLoader />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 print:bg-white">
      <style jsx global>{`
        @media print {
          nav, .print-hidden {
            display: none !important;
          }
          body {
            background: #ffffff !important;
          }
          .print-card {
            box-shadow: none !important;
            border: 1px solid #e2e8f0 !important;
          }
        }
      `}</style>

      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="print-card rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Customer Reports</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Sales Report and Account Statement</h1>
              <p className="mt-2 text-sm text-slate-500">
                Review your orders, payments, and account movement across any date range.
              </p>
            </div>
            {report && (
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current Balance</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{money(report.accountSummary.currentBalance)}</p>
              </div>
            )}
          </div>
        </div>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <Card title="Filters" className="print-card" subtitle="Choose the date range for both the sales report and the account statement.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Input label="From" type="date" name="from" value={filters.from} onChange={handleFilterChange} />
            <Input label="To" type="date" name="to" value={filters.to} onChange={handleFilterChange} />
            <Select
              label="Order Status"
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              options={[
                { value: 'all', label: 'All orders' },
                { value: 'pending', label: 'Pending' },
                { value: 'fulfilled', label: 'Fulfilled' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
            />
            <div className="flex items-end justify-end gap-3 print-hidden">
              <Button variant="secondary" onClick={handlePrint}>Print</Button>
              <Button isLoading={submitting} onClick={handleDownloadPdf}>Download PDF</Button>
            </div>
          </div>
        </Card>

        <div className="print-hidden flex flex-wrap gap-2">
          {[
            { key: 'sales', label: 'Sales Report' },
            { key: 'account', label: 'Account Statement' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeTab === tab.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {report && (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <Card className="print-card" hover={false}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Orders</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{report.salesSummary.totalOrders}</p>
              </Card>
              <Card className="print-card" hover={false}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Fulfilled</p>
                <p className="mt-2 text-2xl font-bold text-emerald-600">{report.salesSummary.fulfilledOrders}</p>
              </Card>
              <Card className="print-card" hover={false}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pending</p>
                <p className="mt-2 text-2xl font-bold text-amber-600">{report.salesSummary.pendingOrders}</p>
              </Card>
              <Card className="print-card" hover={false}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Outstanding</p>
                <p className="mt-2 text-2xl font-bold text-red-600">{money(report.salesSummary.totalOutstandingAmount)}</p>
              </Card>
            </div>

            {activeTab === 'sales' ? (
              <>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <Card className="print-card" title="Sales Summary" hover={false}>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between"><span className="text-slate-500">Total Order Value</span><span className="font-semibold text-slate-900">{money(report.salesSummary.totalOrderAmount)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-500">Total Paid</span><span className="font-semibold text-emerald-600">{money(report.salesSummary.totalPaidAmount)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-500">Still Owing</span><span className="font-semibold text-red-600">{money(report.salesSummary.totalOutstandingAmount)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-500">Cancelled Orders</span><span className="font-semibold text-slate-900">{report.salesSummary.cancelledOrders}</span></div>
                    </div>
                  </Card>
                  <Card className="print-card lg:col-span-2" title="Sales Report" subtitle="Orders in the selected date range, including pending, fulfilled, and cancelled orders.">
                    <Table columns={salesColumns} data={report.salesOrders} emptyMessage="No orders matched the current filters" />
                  </Card>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                  <Card className="print-card" hover={false}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Opening Balance</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{money(report.accountSummary.openingBalance)}</p>
                  </Card>
                  <Card className="print-card" hover={false}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Credits</p>
                    <p className="mt-2 text-2xl font-bold text-emerald-600">{money(report.accountSummary.totalCredits)}</p>
                  </Card>
                  <Card className="print-card" hover={false}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Debits</p>
                    <p className="mt-2 text-2xl font-bold text-red-600">{money(report.accountSummary.totalDebits)}</p>
                  </Card>
                  <Card className="print-card" hover={false}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Closing Balance</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{money(report.accountSummary.closingBalance)}</p>
                  </Card>
                </div>

                <Card className="print-card" title="Account Statement" subtitle="Credits and debits affecting your account balance, including order charges and account top-ups.">
                  <Table columns={statementColumns} data={report.statementEntries} emptyMessage="No account activity matched the selected range" />
                </Card>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}