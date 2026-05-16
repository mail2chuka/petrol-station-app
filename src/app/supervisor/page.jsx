import Card from '@/components/Card';

export default function SupervisorDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Supervisor Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Use this workspace to enter pump readings and track your shift tasks.</p>
      </div>

      <Card title="Next Step">
        <p className="text-sm text-slate-700">
          Supervisor workflow pages are being migrated. You can continue to use existing sales capture screens while meter and tank stock pages are being introduced.
        </p>
      </Card>
    </div>
  );
}
