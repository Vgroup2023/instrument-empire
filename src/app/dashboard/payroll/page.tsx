import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { listEmployees, getPayrollSummary } from '@/lib/quickbooks/payroll';
import { PayrollPageClient } from '@/components/payroll/PayrollPageClient';

export const dynamic = 'force-dynamic';

export default async function PayrollPage() {
  let data: Awaited<ReturnType<typeof loadPayrollData>> | null = null;
  let loadError: unknown = null;
  try {
    data = await loadPayrollData();
  } catch (err) {
    loadError = err;
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Payroll" description="Your employee directory and payroll status." />
        <EmptyState
          title="Couldn't load payroll"
          description={loadError instanceof Error ? loadError.message : 'Please try again.'}
        />
      </div>
    );
  }

  return <PayrollPageClient initialEmployees={data.employees} summary={data.summary} />;
}

async function loadPayrollData() {
  const [employees, summary] = await Promise.all([listEmployees(), getPayrollSummary()]);
  return { employees, summary };
}
