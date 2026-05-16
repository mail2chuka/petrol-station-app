import Card from '@/components/Card';

export default function ExternalAuditorDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">External Auditor Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Run period reviews and inspect station inflow and outflow records.</p>
      </div>

      <Card title="Next Step">
        <p className="text-sm text-slate-700">
          External auditor reporting pages are being migrated. Role routing and access control are now in place.
        </p>
      </Card>
    </div>
  );
}
