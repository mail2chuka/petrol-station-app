import Card from '@/components/Card';

export default function DailyAuditorDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Daily Auditor Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Review daily transactions, discrepancies, and submit audit comments.</p>
      </div>

      <Card title="Next Step">
        <p className="text-sm text-slate-700">
          Daily auditor tools are being introduced in phases. Core role access is active.
        </p>
      </Card>
    </div>
  );
}
