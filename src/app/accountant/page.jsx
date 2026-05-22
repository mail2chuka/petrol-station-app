'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Loading from '@/components/Loading';

function formatCurrency(value) {
  return `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toDateString(value) {
  return new Date(value).toISOString().split('T')[0];
}

function StatusPill({ tone = 'slate', children }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
}

export default function AccountantDashboard() {
  const { data: session } = useSession();
  const [activeDayShift, setActiveDayShift] = useState(null);
  const [todayPayments, setTodayPayments] = useState([]);
  const [todayDeposits, setTodayDeposits] = useState([]);
  const [dailyReport, setDailyReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, [session]);

  const fetchData = async () => {
    if (!session?.user?.stationId) {
      setLoading(false);
      return;
    }

    try {
      setError('');
      const [dayShiftRes, paymentsRes, depositsRes] = await Promise.all([
        fetch(`/api/day-shifts?stationId=${session.user.stationId}&status=in_progress`),
        fetch(`/api/payments?stationId=${session.user.stationId}`),
        fetch(`/api/cash-deposits?stationId=${session.user.stationId}&limit=200`),
      ]);

      const dayShiftData = await dayShiftRes.json();
      const paymentsData = await paymentsRes.json();
      const depositsData = await depositsRes.json();
      const activeShift = dayShiftData.dayShifts?.[0] || null;
      setActiveDayShift(activeShift);

      const targetDate = activeShift
        ? toDateString(activeShift.date)
        : new Date().toISOString().split('T')[0];

      const todaysPayments = (paymentsData.paymentRecords || []).filter((payment) => (
        toDateString(payment.date || payment.createdAt) === targetDate
      ));

      const todaysDeposits = (depositsData.cashDeposits || []).filter((deposit) => (
        toDateString(deposit.date || deposit.createdAt) === targetDate
      ));

      setTodayPayments(todaysPayments);
      setTodayDeposits(todaysDeposits);

      if (activeShift) {
        const reportRes = await fetch(`/api/reports/daily?stationId=${session.user.stationId}&date=${targetDate}`);
        const reportData = await reportRes.json();
        setDailyReport(reportRes.ok ? reportData : null);
      } else {
        setDailyReport(null);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load accountant dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading />;

  const totalCashToday = todayPayments.reduce((sum, p) => sum + p.cashReceived, 0);
  const totalPosToday = todayPayments.reduce((sum, p) => sum + p.posReceived, 0);
  const totalReceivedToday = totalCashToday + totalPosToday;

  const expectedAmount = dailyReport?.summary?.expectedAmount || 0;
  const supervisorCollected = dailyReport?.summary?.actualAmount || 0;
  const intakeVariance = totalReceivedToday - expectedAmount;

  const pendingDeposits = todayDeposits
    .filter((d) => d.status === 'pending')
    .reduce((sum, d) => sum + d.amount, 0);
  const approvedDeposits = todayDeposits
    .filter((d) => d.status === 'approved')
    .reduce((sum, d) => sum + d.amount, 0);
  const rejectedDeposits = todayDeposits
    .filter((d) => d.status === 'rejected')
    .reduce((sum, d) => sum + d.amount, 0);

  const cashPendingDeposit = Math.max(0, totalCashToday - approvedDeposits);

  const supervisorGaps = (dailyReport?.supervisorSummaries || [])
    .map((s) => {
      const expected = s.totalExpected || 0;
      const collected = s.totalCollected || 0;
      const paidToAccount = s.totalPaymentReceived || 0;
      const remittanceGap = collected - paidToAccount;

      return {
        supervisorId: s.supervisorId,
        supervisorName: s.supervisorName,
        expected,
        collected,
        paidToAccount,
        remittanceGap,
      };
    })
    .sort((a, b) => Math.abs(b.remittanceGap) - Math.abs(a.remittanceGap));

  const hasOutstandingSupervisorGap = supervisorGaps.some((s) => s.remittanceGap > 0.5);
  const hasActiveDay = Boolean(activeDayShift);
  const hasPaymentEntries = todayPayments.length > 0;
  const hasDailyReport = Boolean(dailyReport?.summary);
  const noIntakeVariance = Math.abs(intakeVariance) <= 0.5;
  const noPendingDeposit = pendingDeposits <= 0.5;

  const checklist = [
    {
      label: 'Day shift is active',
      done: hasActiveDay,
      detail: hasActiveDay ? 'Manager has started the day.' : 'Waiting for manager to begin the day.',
    },
    {
      label: 'Payments have been recorded',
      done: hasPaymentEntries,
      detail: hasPaymentEntries ? `${todayPayments.length} entries captured.` : 'No payment entries yet.',
    },
    {
      label: 'Daily report is available',
      done: hasDailyReport,
      detail: hasDailyReport ? 'Expected and collected values loaded.' : 'No daily report loaded yet.',
    },
    {
      label: 'Supervisor remittance gaps resolved',
      done: !hasOutstandingSupervisorGap,
      detail: hasOutstandingSupervisorGap ? 'One or more supervisors still have remittance gaps.' : 'No open remittance gaps.',
    },
    {
      label: 'Intake variance reconciled',
      done: noIntakeVariance,
      detail: noIntakeVariance ? 'Recorded intake aligns with expected sales.' : `Variance remains at ${formatCurrency(intakeVariance)}.`,
    },
    {
      label: 'Pending deposits cleared',
      done: noPendingDeposit,
      detail: noPendingDeposit ? 'No pending bank deposit approvals.' : `${formatCurrency(pendingDeposits)} still pending approval.`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-white via-green-50 to-white rounded-2xl border-2 border-green-100 shadow-lg p-6 animate-fade-in">
        <h1 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-ecana-blue">Accountant Dashboard</h1>
        <p className="text-base text-gray-600 mt-2 font-medium">Reconcile collections, manage remittances, and track deposit approvals.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {!activeDayShift && (
        <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 border-l-4 border-yellow-500 text-yellow-900 px-5 py-4 rounded-xl shadow-md animate-slide-in">
          <p className="font-bold flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
            </svg>
            No Active Day
          </p>
          <p className="text-sm mt-1">Please wait for the manager to begin the day.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
        <div className="group bg-gradient-to-br from-green-50 via-white to-green-100 rounded-2xl border-2 border-green-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-100 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="text-center relative z-10">
            <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Cash Received Today</p>
            <p className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-green-600 to-green-800">
              {formatCurrency(totalCashToday)}
            </p>
          </div>
        </div>

        <div className="group bg-gradient-to-br from-blue-50 via-white to-blue-100 rounded-2xl border-2 border-blue-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="text-center relative z-10">
            <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">POS Received Today</p>
            <p className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-blue-600 to-blue-800">
              {formatCurrency(totalPosToday)}
            </p>
          </div>
        </div>

        <div className="group bg-gradient-to-br from-purple-50 via-white to-purple-100 rounded-2xl border-2 border-purple-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-100 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="text-center relative z-10">
            <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Total Received Today</p>
            <p className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-purple-600 to-purple-800">
              {formatCurrency(totalReceivedToday)}
            </p>
          </div>
        </div>

        <div className="group bg-gradient-to-br from-slate-50 via-white to-slate-100 rounded-2xl border-2 border-slate-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 p-6 relative overflow-hidden">
          <div className="text-center relative z-10">
            <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Expected Collection</p>
            <p className="text-3xl sm:text-4xl font-black text-slate-800">{formatCurrency(expectedAmount)}</p>
            <p className="text-xs text-slate-500 mt-1">From daily sales report</p>
          </div>
        </div>

        <div className="group bg-gradient-to-br from-amber-50 via-white to-amber-100 rounded-2xl border-2 border-amber-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 p-6 relative overflow-hidden">
          <div className="text-center relative z-10">
            <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Pending Deposit</p>
            <p className="text-3xl sm:text-4xl font-black text-amber-700">{formatCurrency(cashPendingDeposit)}</p>
            <p className="text-xs text-slate-500 mt-1">Cash intake minus approved deposits</p>
          </div>
        </div>

        <div className="group bg-gradient-to-br from-rose-50 via-white to-rose-100 rounded-2xl border-2 border-rose-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 p-6 relative overflow-hidden">
          <div className="text-center relative z-10">
            <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Intake Variance</p>
            <p className={`text-3xl sm:text-4xl font-black ${intakeVariance < 0 ? 'text-red-700' : intakeVariance > 0 ? 'text-green-700' : 'text-slate-700'}`}>
              {intakeVariance > 0 ? '+' : ''}{formatCurrency(intakeVariance)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Recorded intake vs expected sales</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Welcome">
          <p className="text-gray-700">
            Welcome back, <strong>{session?.user?.name}</strong>!
          </p>
          <p className="text-gray-600 mt-2">
            Use the sidebar to capture remittances, review ledgers, and submit bank deposits for approval.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusPill tone={hasActiveDay ? 'green' : 'amber'}>
              {hasActiveDay ? 'Day In Progress' : 'No Active Day'}
            </StatusPill>
            <StatusPill tone={noIntakeVariance ? 'green' : 'red'}>
              {noIntakeVariance ? 'Variance Balanced' : 'Variance Outstanding'}
            </StatusPill>
            <StatusPill tone={pendingDeposits > 0 ? 'amber' : 'blue'}>
              Pending Deposits: {formatCurrency(pendingDeposits)}
            </StatusPill>
          </div>
        </Card>

        <Card title="Quick Actions">
          <div className="space-y-2">
            {activeDayShift && (
              <a
                href="/accountant/payments"
                className="block p-3 bg-ecana-maroon-50 hover:bg-ecana-maroon-100 rounded-lg transition-colors"
              >
                <p className="font-medium text-ecana-maroon">Record Payment</p>
                <p className="text-sm text-gray-600">Record cash and POS payments from supervisors</p>
              </a>
            )}
            <a
              href="/accountant/deposits"
              className="block p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <p className="font-medium text-blue-700">Manage Deposits</p>
              <p className="text-sm text-gray-600">Record deposits and track pending approvals</p>
            </a>
            <a
              href="/accountant/view-payments"
              className="block p-3 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
            >
              <p className="font-medium text-green-700">View Payments</p>
              <p className="text-sm text-gray-600">View all payment records</p>
            </a>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Reconciliation Snapshot">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Expected Sales</span>
              <span className="font-semibold text-slate-900">{formatCurrency(expectedAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Supervisor Collected</span>
              <span className="font-semibold text-slate-900">{formatCurrency(supervisorCollected)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Recorded by Accountant</span>
              <span className="font-semibold text-slate-900">{formatCurrency(totalReceivedToday)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Approved Deposits</span>
              <span className="font-semibold text-slate-900">{formatCurrency(approvedDeposits)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Rejected Deposits</span>
              <span className="font-semibold text-slate-900">{formatCurrency(rejectedDeposits)}</span>
            </div>
            <div className="pt-2 mt-2 border-t border-slate-200 flex justify-between">
              <span className="font-medium text-slate-700">Unresolved Gap</span>
              <span className={`font-bold ${intakeVariance < 0 ? 'text-red-700' : intakeVariance > 0 ? 'text-green-700' : 'text-slate-700'}`}>
                {intakeVariance > 0 ? '+' : ''}{formatCurrency(intakeVariance)}
              </span>
            </div>
          </div>
        </Card>

        <Card title="End-of-Day Readiness">
          <div className="space-y-3">
            {checklist.map((item) => (
              <div key={item.label} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.detail}</p>
                </div>
                <StatusPill tone={item.done ? 'green' : 'amber'}>{item.done ? 'Done' : 'Pending'}</StatusPill>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Supervisor Remittance Gaps">
          {supervisorGaps.length === 0 ? (
            <p className="text-sm text-slate-500">No supervisor summary available yet for today.</p>
          ) : (
            <div className="space-y-3">
              {supervisorGaps.map((row) => {
                const tone = row.remittanceGap > 0.5 ? 'amber' : row.remittanceGap < -0.5 ? 'blue' : 'green';
                return (
                  <div key={row.supervisorId} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-900">{row.supervisorName}</p>
                      <StatusPill tone={tone}>
                        {row.remittanceGap > 0.5
                          ? `Outstanding ${formatCurrency(row.remittanceGap)}`
                          : row.remittanceGap < -0.5
                            ? `Over remitted ${formatCurrency(Math.abs(row.remittanceGap))}`
                            : 'Balanced'}
                      </StatusPill>
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <p className="text-slate-600">Expected: <span className="font-semibold text-slate-900">{formatCurrency(row.expected)}</span></p>
                      <p className="text-slate-600">Collected: <span className="font-semibold text-slate-900">{formatCurrency(row.collected)}</span></p>
                      <p className="text-slate-600">Paid In: <span className="font-semibold text-slate-900">{formatCurrency(row.paidToAccount)}</span></p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Deposit Pipeline (Today)">
          {todayDeposits.length === 0 ? (
            <p className="text-sm text-slate-500">No deposits created for today.</p>
          ) : (
            <div className="space-y-3">
              {todayDeposits.map((deposit) => (
                <div key={deposit._id} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{formatCurrency(deposit.amount)}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{deposit.bankName}{deposit.bankBranch ? ` - ${deposit.bankBranch}` : ''}</p>
                    </div>
                    <StatusPill tone={deposit.status === 'approved' ? 'green' : deposit.status === 'rejected' ? 'red' : 'amber'}>
                      {deposit.status}
                    </StatusPill>
                  </div>
                  {deposit.adminNote && (
                    <p className="mt-2 text-xs text-slate-500">Admin note: {deposit.adminNote}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {todayPayments.length > 0 && (
        <Card title="Today's Payment Records" className="mt-6">
          <div className="space-y-2">
            {todayPayments.map((payment, index) => (
              <div key={index} className="p-3 bg-gray-50 rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-medium">{payment.supervisorName}</p>
                  <p className="text-sm text-gray-600">
                    {new Date(payment.createdAt).toLocaleTimeString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Cash: ₦{payment.cashReceived.toFixed(2)}</p>
                  <p className="text-sm text-gray-600">POS: ₦{payment.posReceived.toFixed(2)}</p>
                  <p className="font-medium text-ecana-maroon">Total: ₦{payment.totalReceived.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
