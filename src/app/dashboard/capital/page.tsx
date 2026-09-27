import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { getLoans, getPeerLendingBenchmarks } from '@/lib/quickbooks/capital';
import { formatCurrency, formatDate, formatPercent } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function CapitalPage() {
  const [loans, benchmarks] = await Promise.all([getLoans(), getPeerLendingBenchmarks()]);
  const activeLoans = loans.filter((l) => l.status === 'active');
  const totalOutstanding = activeLoans.reduce((s, l) => s + l.outstandingBalance, 0);
  const totalMonthlyPayment = activeLoans.reduce((s, l) => s + l.monthlyPayment, 0);
  const nextPaymentDate = activeLoans
    .map((l) => l.nextPaymentDate)
    .filter((d): d is string => Boolean(d))
    .sort()[0];

  return (
    <div className="space-y-8">
      <PageHeader
        title="QuickBooks Capital"
        description="Your loans and how your borrowing terms compare to similar businesses."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active loans" value={String(activeLoans.length)} />
        <StatCard label="Total outstanding" value={formatCurrency(totalOutstanding)} />
        <StatCard label="Monthly payment total" value={formatCurrency(totalMonthlyPayment)} />
        <StatCard label="Next payment due" value={formatDate(nextPaymentDate)} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Loans</CardTitle>
            <CardDescription>All QuickBooks Capital financing on this account.</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Product</Th>
                <Th className="text-right">Original amount</Th>
                <Th className="text-right">Outstanding</Th>
                <Th className="text-right">APR</Th>
                <Th className="text-right">Monthly payment</Th>
                <Th>Next payment</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {loans.map((loan) => (
                <Tr key={loan.id}>
                  <Td className="font-medium text-slate-50">{loan.product}</Td>
                  <Td className="text-right">{formatCurrency(loan.originalAmount)}</Td>
                  <Td className="text-right">{formatCurrency(loan.outstandingBalance)}</Td>
                  <Td className="text-right">{formatPercent(loan.apr)}</Td>
                  <Td className="text-right">{loan.monthlyPayment ? formatCurrency(loan.monthlyPayment) : '—'}</Td>
                  <Td>{formatDate(loan.nextPaymentDate ?? undefined)}</Td>
                  <Td>
                    <Badge tone={loan.status === 'active' ? 'brand' : 'success'}>
                      {loan.status === 'active' ? 'Active' : 'Paid off'}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Peer lending benchmarks</CardTitle>
            <CardDescription>How your borrowing terms compare to similar businesses.</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          {benchmarks.map((metric) => (
            <div key={metric.metric} className="flex items-center justify-between text-sm">
              <span className="w-52 shrink-0 font-medium text-slate-200">{metric.metric}</span>
              <div className="flex flex-1 items-center gap-6">
                <span className="text-brand-700">
                  You:{' '}
                  <span className="font-semibold">
                    {metric.unit === 'percent' ? formatPercent(metric.yourValue) : formatCurrency(metric.yourValue)}
                  </span>
                </span>
                <span className="text-slate-500">
                  Peer median:{' '}
                  <span className="font-medium text-slate-300">
                    {metric.unit === 'percent' ? formatPercent(metric.peerMedian) : formatCurrency(metric.peerMedian)}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
