'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Loading from '@/components/Loading';

export default function AccountantDashboard() {
  const { data: session } = useSession();
  const [activeDayShift, setActiveDayShift] = useState(null);
  const [todayPayments, setTodayPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [session]);

  const fetchData = async () => {
    if (!session?.user?.stationId) return;

    try {
      const [dayShiftRes, paymentsRes] = await Promise.all([
        fetch(`/api/day-shifts?stationId=${session.user.stationId}&status=in_progress`),
        fetch(`/api/payments?stationId=${session.user.stationId}`),
      ]);

      const dayShiftData = await dayShiftRes.json();
      const paymentsData = await paymentsRes.json();

      if (dayShiftData.dayShifts?.length > 0) {
        setActiveDayShift(dayShiftData.dayShifts[0]);
        
        // Filter today's payments
        const today = new Date().toISOString().split('T')[0];
        const todaysPayments = paymentsData.paymentRecords?.filter(p => 
          new Date(p.date).toISOString().split('T')[0] === today
        ) || [];
        setTodayPayments(todaysPayments);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading />;

  const totalCashToday = todayPayments.reduce((sum, p) => sum + p.cashReceived, 0);
  const totalPosToday = todayPayments.reduce((sum, p) => sum + p.posReceived, 0);
  const totalReceivedToday = totalCashToday + totalPosToday;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-white via-green-50 to-white rounded-2xl border-2 border-green-100 shadow-lg p-6 animate-fade-in">
        <h1 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-ecana-blue">Accountant Dashboard</h1>
        <p className="text-base text-gray-600 mt-2 font-medium">Monitor and record payment collections</p>
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="group bg-gradient-to-br from-green-50 via-white to-green-100 rounded-2xl border-2 border-green-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-100 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="text-center relative z-10">
            <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Cash Received Today</p>
            <p className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-green-600 to-green-800">
              ₦{totalCashToday.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="group bg-gradient-to-br from-blue-50 via-white to-blue-100 rounded-2xl border-2 border-blue-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="text-center relative z-10">
            <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">POS Received Today</p>
            <p className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-blue-600 to-blue-800">
              ₦{totalPosToday.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="group bg-gradient-to-br from-purple-50 via-white to-purple-100 rounded-2xl border-2 border-purple-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-100 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="text-center relative z-10">
            <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Total Received Today</p>
            <p className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-purple-600 to-purple-800">
              ₦{totalReceivedToday.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Welcome">
          <p className="text-gray-700">
            Welcome back, <strong>{session?.user?.name}</strong>!
          </p>
          <p className="text-gray-600 mt-2">
            Use the sidebar to record payments received from supervisors.
          </p>
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
              href="/accountant/view-payments"
              className="block p-3 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
            >
              <p className="font-medium text-green-700">View Payments</p>
              <p className="text-sm text-gray-600">View all payment records</p>
            </a>
          </div>
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
