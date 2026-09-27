import { listEmployees, getPayrollSummary } from '@/lib/quickbooks/payroll';
import { PayrollPageClient } from '@/components/payroll/PayrollPageClient';

export const dynamic = 'force-dynamic';

export default async function PayrollPage() {
  const [employees, summary] = await Promise.all([listEmployees(), getPayrollSummary()]);
  return <PayrollPageClient initialEmployees={employees} summary={summary} />;
}
