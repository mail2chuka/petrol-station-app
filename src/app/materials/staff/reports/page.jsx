import ReportsWorkspace from '@/components/materials/ReportsWorkspace';

export default function MaterialsStaffReportsPage() {
  return (
    <ReportsWorkspace
      audience="Staff"
      title="Operational Sales Reports"
      subtitle="Review order volume, quantities sold, and customer or product activity without exposing pricing or total sales values."
    />
  );
}