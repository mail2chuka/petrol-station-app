'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Card from '@/components/Card';
import Table from '@/components/Table';
import Loading from '@/components/Loading';

export default function ViewPaymentsPage() {
  const { data: session } = useSession();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPayments();
  }, [session]);

  const fetchPayments = async () => {
    if (!session?.user?.stationId) return;

    try {
      const res = await fetch(`/api/payments?stationId=${session.user.stationId}`);
      const data = await res.json();
      setPayments(data.paymentRecords || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { 
      header: 'Date/Time', 
      render: (row) => new Date(row.createdAt).toLocaleString()
    },
    { header: 'Attendant', field: 'attendantName' },
    { 
      header: 'Cash', 
      render: (row) => `₦${row.cashReceived.toFixed(2)}`
    },
    { 
      header: 'POS', 
      render: (row) => `₦${row.posReceived.toFixed(2)}`
    },
    { 
      header: 'Total', 
      render: (row) => `₦${row.totalReceived.toFixed(2)}`
    },
    { header: 'Notes', field: 'notes' },
  ];

  if (loading) return <Loading />;

  const totalCash = payments.reduce((sum, p) => sum + p.cashReceived, 0);
  const totalPos = payments.reduce((sum, p) => sum + p.posReceived, 0);
  const totalReceived = totalCash + totalPos;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Payment Records</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">Total Cash</p>
            <p className="text-4xl font-bold text-green-600">₦{totalCash.toFixed(2)}</p>
          </div>
        </Card>

        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">Total POS</p>
            <p className="text-4xl font-bold text-ecana-maroon">₦{totalPos.toFixed(2)}</p>
          </div>
        </Card>

        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">Grand Total</p>
            <p className="text-4xl font-bold text-ecana-blue">₦{totalReceived.toFixed(2)}</p>
          </div>
        </Card>
      </div>

      <Card title="All Payment Records">
        <Table columns={columns} data={payments} />
      </Card>
    </div>
  );
}
