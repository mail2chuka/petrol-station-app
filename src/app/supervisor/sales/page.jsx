import Card from '@/components/Card';

export default function SupervisorSalesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Record Sales</h1>
        <p className="text-sm text-slate-500 mt-1">Sales entry migration is in progress for the supervisor role.</p>
      </div>
      <Card>
        <p className="text-sm text-slate-700">Use the API-backed sales flow to continue operations while Summary Book migration is completed.</p>
      </Card>
    </div>
  );
}
