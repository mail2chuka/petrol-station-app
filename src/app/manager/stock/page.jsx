'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Button from '@/components/Button';
import Loading from '@/components/Loading';

export default function ReceiveStockPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const adminStationId = searchParams.get('stationId');
  const activeStationId = session?.user?.role === 'admin' ? adminStationId : session?.user?.stationId;
  const [station, setStation] = useState(null);
  const [formData, setFormData] = useState({
    fuelType: 'PMS',
    quantity: '',
    expectedQuantity: '',
    cost: '',
    supplier: '',
    notes: '',
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchStation();
  }, [session]);

  const fetchStation = async () => {
    if (!activeStationId) return;

    try {
      const res = await fetch('/api/stations');
      const data = await res.json();
      
      const myStation = data.stations?.find(s => s._id === activeStationId);
      if (myStation) {
        setStation(myStation);
      }
    } catch (error) {
      console.error('Error fetching station:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const res = await fetch(`/api/stations/${activeStationId}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: activeStationId,
          fuelType: formData.fuelType,
          quantity: parseFloat(formData.quantity),
          expectedQuantity: formData.expectedQuantity ? parseFloat(formData.expectedQuantity) : undefined,
          cost: parseFloat(formData.cost),
          supplier: formData.supplier,
          notes: formData.notes,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(`Stock received successfully! New ${formData.fuelType} stock: ${data.stockUpdate.newStock.toFixed(2)}L`);
        setFormData({
          fuelType: 'PMS',
          quantity: '',
          expectedQuantity: '',
          cost: '',
          supplier: '',
          notes: '',
        });
        fetchStation(); // Refresh station data
      } else {
        setError(data.error || 'Failed to receive stock');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!activeStationId) {
    return (
      <Card title="Select Station">
        <p className="text-sm text-gray-600">Choose a station from the Admin Stations page to manage.</p>
      </Card>
    );
  }

  if (loading) return <Loading />;

  const costPerLiter = formData.quantity && formData.cost
    ? (parseFloat(formData.cost) / parseFloat(formData.quantity)).toFixed(2)
    : '0.00';

  const variance = formData.expectedQuantity && formData.quantity
    ? (parseFloat(formData.quantity) - parseFloat(formData.expectedQuantity)).toFixed(2)
    : null;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Receive Stock</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card title="Current Stock Levels">
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-600">PMS (Petrol)</p>
              <p className="text-2xl font-bold text-blue-600">
                {station?.currentStock?.PMS?.toFixed(2) || '0.00'}L
              </p>
              <p className="text-sm text-gray-600">
                Price: ₦{station?.currentPrices?.PMS?.toFixed(2) || '0.00'}/L
              </p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-600">AGO (Diesel)</p>
              <p className="text-2xl font-bold text-green-600">
                {station?.currentStock?.AGO?.toFixed(2) || '0.00'}L
              </p>
              <p className="text-sm text-gray-600">
                Price: ₦{station?.currentPrices?.AGO?.toFixed(2) || '0.00'}/L
              </p>
            </div>
          </div>
        </Card>

        <Card title="Record New Stock">
          <form onSubmit={handleSubmit}>
            <Select
              label="Fuel Type"
              name="fuelType"
              value={formData.fuelType}
              onChange={handleChange}
              options={[
                { value: 'PMS', label: 'PMS (Petrol)' },
                { value: 'AGO', label: 'AGO (Diesel)' },
              ]}
              required
            />

            <Input
              label="Expected Quantity (Liters)"
              type="number"
              name="expectedQuantity"
              value={formData.expectedQuantity}
              onChange={handleChange}
              placeholder="0.00"
              step="0.01"
              min="0"
              required
            />

            {variance !== null && (
              <div className="mb-4 p-3 bg-amber-50 rounded-lg">
                <p className="text-xs text-gray-600">Supply Variance (Actual - Expected)</p>
                <p className={`text-xl font-bold ${Number(variance) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {Number(variance) >= 0 ? '+' : ''}{variance}L
                </p>
              </div>
            )}

            <Input
              label="Quantity Delivered (Liters)"
              type="number"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              placeholder="0.00"
              step="0.01"
              min="0.01"
              required
            />

            <Input
              label="Total Cost (₦)"
              type="number"
              name="cost"
              value={formData.cost}
              onChange={handleChange}
              placeholder="0.00"
              step="0.01"
              min="0.01"
              required
            />

            {formData.quantity && formData.cost && (
              <div className="mb-4 p-3 bg-ecana-blue-50 rounded-lg">
                <p className="text-xs text-gray-600">Cost Per Liter (₦)</p>
                <p className="text-xl font-bold text-ecana-blue">₦{costPerLiter}</p>
              </div>
            )}

            <Input
              label="Supplier"
              name="supplier"
              value={formData.supplier}
              onChange={handleChange}
              placeholder="e.g., ABC Fuel Suppliers"
            />

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes (Optional)
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Delivery notes, invoice number, etc..."
              />
            </div>

            <Button type="submit" variant="success" disabled={submitting}>
              {submitting ? 'Recording...' : 'Receive Stock'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
