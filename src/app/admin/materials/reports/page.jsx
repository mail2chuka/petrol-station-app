import ReportsWorkspace from '@/components/materials/ReportsWorkspace';

export default function AdminMaterialsReportsPage() {
  return (
    <ReportsWorkspace
      audience="Admin"
      title="Sales and Cash Flow Reports"
      subtitle="Track materials sales by day, month, or any custom period, then narrow the results to a customer or product when you need to inspect a specific slice of the business."
    />
  );
}