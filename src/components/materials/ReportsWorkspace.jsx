'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Navbar from '@/components/Navbar';
import Card from '@/components/Card';
import Table from '@/components/Table';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/Button';
import { PageLoader } from '@/components/Loading';

function formatCurrency(value) {
  return `₦${Number(value || 0).toLocaleString()}`;
}

function formatQuantity(value) {
  return Number(value || 0).toLocaleString();
}

function buildInitialFilters() {
  const today = new Date();
  const month = today.toISOString().slice(0, 7);
  const date = today.toISOString().slice(0, 10);
  const firstDay = `${month}-01`;

  return {
    view: 'monthly',
    date,
    month,
    from: firstDay,
    to: date,
    customerId: '',
    productId: '',
  };
}

export default function ReportsWorkspace({
  title,
  subtitle,
  audience,
}) {
  const [filters, setFilters] = useState(buildInitialFilters);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSeeAmounts = report?.permissions?.canSeeAmounts;
  const canSeeDebt = report?.permissions?.canSeeDebt;

  const loadOptions = useCallback(async () => {
    const [customersRes, productsRes] = await Promise.all([
      fetch('/api/materials/customers'),
      fetch('/api/materials/products?withUnits=false'),
    ]);

    const [customersData, productsData] = await Promise.all([
      customersRes.json(),
      productsRes.json(),
    ]);

    if (!customersRes.ok) {
      throw new Error(customersData.error || 'Failed to load customers');
    }
    if (!productsRes.ok) {
      throw new Error(productsData.error || 'Failed to load products');
    }

    setCustomers(customersData.customers || []);
    setProducts(productsData.products || []);
  }, []);

  const fetchReport = useCallback(async (nextFilters) => {
    setSubmitting(true);
    setError('');

    try {
      const params = new URLSearchParams({ view: nextFilters.view });
      if (nextFilters.view === 'daily') {
        params.set('date', nextFilters.date);
      }
      if (nextFilters.view === 'monthly') {
        params.set('month', nextFilters.month);
      }
      if (nextFilters.view === 'custom') {
        params.set('from', nextFilters.from);
        params.set('to', nextFilters.to);
      }
      if (nextFilters.customerId) {
        params.set('customerId', nextFilters.customerId);
      }
      if (nextFilters.productId) {
        params.set('productId', nextFilters.productId);
      }

      const res = await fetch(`/api/materials/reports/overview?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load report');
      setReport(data);
    } catch (err) {
      setError(err.message || 'Failed to load report');
      setReport(null);
    } finally {
      setSubmitting(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const initialFilters = buildInitialFilters();

    const bootstrap = async () => {
      try {
        await loadOptions();
        if (mounted) {
          setFilters(initialFilters);
          await fetchReport(initialFilters);
        }
      } catch (err) {
        if (mounted) {
          setError(err.message || 'Failed to load report workspace');
          setLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      mounted = false;
    };
  }, [fetchReport, loadOptions]);

  const customerOptions = useMemo(
    () => [{ value: '', label: 'All customers' }].concat(
      customers.map((customer) => ({
        value: customer._id,
        label: customer.name,
      }))
    ),
    [customers]
  );

  const productOptions = useMemo(
    () => [{ value: '', label: 'All products' }].concat(
      products.map((product) => ({
        value: product._id,
        label: product.name,
      }))
    ),
    [products]
  );

  const salesSummaryCards = report ? [
    { label: 'Orders', value: formatQuantity(report.summary.orderCount), tone: 'text-slate-900' },
    { label: 'Quantity Sold', value: formatQuantity(report.summary.quantitySold), tone: 'text-blue-700' },
    { label: 'Customers', value: formatQuantity(report.summary.uniqueCustomers), tone: 'text-emerald-700' },
    { label: 'Products', value: formatQuantity(report.summary.uniqueProducts), tone: 'text-amber-700' },
  ] : [];

  if (report && canSeeAmounts) {
    salesSummaryCards.push(
      { label: 'Sales Value', value: formatCurrency(report.summary.totalSalesAmount), tone: 'text-emerald-700' },
      { label: 'Balance Applied', value: formatCurrency(report.summary.balanceApplied), tone: 'text-blue-700' }
    );
  }

  if (report && canSeeDebt) {
    salesSummaryCards.push({
      label: 'Debt Incurred',
      value: formatCurrency(report.summary.debtIncurred),
      tone: 'text-red-600',
    });
  }

  const productColumns = [
    { header: 'Product', field: 'productName' },
    { header: 'Units Sold', render: (row) => formatQuantity(row.quantitySold) },
    { header: 'Orders', render: (row) => formatQuantity(row.orderCount) },
  ];

  if (canSeeAmounts) {
    productColumns.push({ header: 'Sales Value', render: (row) => formatCurrency(row.totalSalesAmount) });
  }

  const customerColumns = [
    { header: 'Customer', field: 'customerName' },
    { header: 'Orders', render: (row) => formatQuantity(row.orderCount) },
    { header: 'Quantity', render: (row) => formatQuantity(row.quantitySold) },
  ];

  if (canSeeAmounts) {
    customerColumns.push({ header: 'Sales Value', render: (row) => formatCurrency(row.totalSalesAmount) });
  }
  if (canSeeDebt) {
    customerColumns.push({ header: 'Debt', render: (row) => formatCurrency(row.debtIncurred) });
  }

  const timelineColumns = [
    { header: report?.filters?.view === 'daily' ? 'Hour' : 'Period', field: 'period' },
    { header: 'Orders', render: (row) => formatQuantity(row.orderCount) },
    { header: 'Quantity', render: (row) => formatQuantity(row.quantitySold) },
  ];

  if (canSeeAmounts) {
    timelineColumns.push({ header: 'Sales Value', render: (row) => formatCurrency(row.totalSalesAmount) });
  }
  if (canSeeDebt) {
    timelineColumns.push({ header: 'Debt', render: (row) => formatCurrency(row.debtIncurred) });
  }

  const orderColumns = [
    { header: 'Date', render: (row) => new Date(row.createdAt).toLocaleString() },
    { header: 'Customer', field: 'customerName' },
    { header: 'Items', field: 'itemSummary' },
    { header: 'Quantity', render: (row) => formatQuantity(row.quantitySold) },
  ];

  if (canSeeAmounts) {
    orderColumns.push({ header: 'Sales Value', render: (row) => formatCurrency(row.totalSalesAmount) });
    orderColumns.push({ header: 'Applied', render: (row) => formatCurrency(row.balanceApplied) });
  }
  if (canSeeDebt) {
    orderColumns.push({ header: 'Debt', render: (row) => formatCurrency(row.debtIncurred) });
  }

  const debtorColumns = [
    { header: 'Customer', field: 'customerName' },
    { header: 'Current Debt', render: (row) => formatCurrency(row.currentDebt) },
  ];

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const handleRunReport = async () => {
    await fetchReport(filters);
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{audience}</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">{subtitle}</p>
            </div>
            {report && (
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current Window</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{report.filters.label}</p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Card title="Filters" subtitle="Choose the period and focus the report by customer or product.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Select
              label="View"
              name="view"
              value={filters.view}
              onChange={handleFilterChange}
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'custom', label: 'Custom range' },
              ]}
            />

            {filters.view === 'daily' && (
              <Input
                label="Date"
                type="date"
                name="date"
                value={filters.date}
                onChange={handleFilterChange}
              />
            )}

            {filters.view === 'monthly' && (
              <Input
                label="Month"
                type="month"
                name="month"
                value={filters.month}
                onChange={handleFilterChange}
              />
            )}

            {filters.view === 'custom' && (
              <>
                <Input
                  label="From"
                  type="date"
                  name="from"
                  value={filters.from}
                  onChange={handleFilterChange}
                />
                <Input
                  label="To"
                  type="date"
                  name="to"
                  value={filters.to}
                  onChange={handleFilterChange}
                />
              </>
            )}

            <Select
              label="Customer"
              name="customerId"
              value={filters.customerId}
              onChange={handleFilterChange}
              options={customerOptions.slice(1)}
              placeholder="All customers"
            />

            <Select
              label="Product"
              name="productId"
              value={filters.productId}
              onChange={handleFilterChange}
              options={productOptions.slice(1)}
              placeholder="All products"
            />
          </div>

          <div className="mt-5 flex justify-end">
            <Button isLoading={submitting} onClick={handleRunReport}>
              Run Report
            </Button>
          </div>
        </Card>

        {report && (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 2xl:grid-cols-7">
              {salesSummaryCards.map((item) => (
                <Card key={item.label} className="p-5" hover={false}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{item.label}</p>
                  <p className={`mt-2 text-2xl font-bold ${item.tone}`}>{item.value}</p>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <Card title="Cash Flow" subtitle="Income, applied balances, and debt within the selected window." className="xl:col-span-1">
                <div className="space-y-4">
                  {canSeeAmounts && (
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Top-up Inflow</p>
                      <p className="mt-1 text-2xl font-bold text-emerald-700">
                        {report.cashFlow.topUpInflow === null ? 'Not product-specific' : formatCurrency(report.cashFlow.topUpInflow)}
                      </p>
                      {report.summary.topUpCount !== null && (
                        <p className="mt-1 text-xs text-slate-500">{formatQuantity(report.summary.topUpCount)} completed top-ups</p>
                      )}
                    </div>
                  )}

                  {canSeeAmounts && (
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Balances Applied</p>
                      <p className="mt-1 text-2xl font-bold text-blue-700">{formatCurrency(report.cashFlow.balanceApplied)}</p>
                    </div>
                  )}

                  {canSeeDebt && (
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Debt Incurred</p>
                      <p className="mt-1 text-2xl font-bold text-red-600">{formatCurrency(report.cashFlow.debtIncurred)}</p>
                    </div>
                  )}

                  {canSeeDebt && (
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Current Outstanding Debt</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(report.cashFlow.currentOutstandingDebt)}</p>
                    </div>
                  )}

                  {report.notes.topUpsAreNotProductScoped && (
                    <p className="text-xs text-slate-500">
                      Product filtering narrows sales and debt to the selected product. Customer top-ups remain customer-wide and are not allocated to individual products.
                    </p>
                  )}
                </div>
              </Card>

              <Card title="Timeline" subtitle="Daily view breaks down by hour; other views break down by day." className="xl:col-span-2">
                <Table columns={timelineColumns} data={report.timeline} emptyMessage="No activity in this period" />
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card title="Sales by Product" subtitle="Most active products in the selected report window.">
                <Table columns={productColumns} data={report.productBreakdown} emptyMessage="No products matched the current filters" />
              </Card>

              <Card title="Sales by Customer" subtitle="Use this to focus on customer-level activity and repeat ordering.">
                <Table columns={customerColumns} data={report.customerBreakdown} emptyMessage="No customers matched the current filters" />
              </Card>
            </div>

            <Card title="Order Activity" subtitle="Detailed order rows inside the current report window.">
              <Table columns={orderColumns} data={report.orderRows} emptyMessage="No fulfilled orders matched the current filters" />
            </Card>

            {canSeeDebt && (
              <Card title="Debtors" subtitle="Current customer debt based on account balances.">
                <Table columns={debtorColumns} data={report.debtors} emptyMessage="No customers are currently in debt" />
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}