import ReportsWorkspace from '@/components/materials/ReportsWorkspace';

export default function MaterialsAuditorReportsPage() {
  return (
    <ReportsWorkspace
      audience="Auditor"
      title="Income and Debt Reports"
      subtitle="Inspect cash movement, fulfilled sales value, and debt exposure across any reporting window, with optional customer and product filters."
    />
  );
}