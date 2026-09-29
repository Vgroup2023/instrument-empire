import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { getApAgingSummary, getArAgingSummary, type AgingBucketRow } from '@/lib/accounting/reports';
import { formatCurrency } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ArApPage() {
  return (
    <div>
      <PageHeader
        title="A/R & A/P aging"
        description="Who owes you money, and which bills are coming due — grouped by how overdue they are."
      />
      <ArApBody />
    </div>
  );
}

async function ArApBody() {
  let receivables: AgingBucketRow[] = [];
  let payables: AgingBucketRow[] = [];
  let error: string | null = null;

  try {
    [receivables, payables] = await Promise.all([getArAgingSummary(), getApAgingSummary()]);
  } catch (err) {
    error = describeError(err, 'Failed to load aging reports.');
  }

  if (error) {
    return <EmptyState title="Couldn't load aging reports" description={error} />;
  }

  const totalAr = sumField(receivables, 'total');
  const totalApValue = sumField(payables, 'total');
  const overdueAr = receivables.reduce((s, r) => s + r.d1to30 + r.d31to60 + r.d61to90 + r.d90plus, 0);
  const overdueAp = payables.reduce((s, r) => s + r.d1to30 + r.d31to60 + r.d61to90 + r.d90plus, 0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total receivable" value={formatCurrency(totalAr)} />
        <StatCard label="Overdue receivable" value={formatCurrency(overdueAr)} />
        <StatCard label="Total payable" value={formatCurrency(totalApValue)} />
        <StatCard label="Overdue payable" value={formatCurrency(overdueAp)} />
      </div>

      <AgingTable
        title="Accounts receivable — who owes you"
        description="Grouped by customer, oldest balances first."
        rows={receivables}
        entityLabel="Customer"
        tone="ar"
      />

      <AgingTable
        title="Accounts payable — bills coming due"
        description="Grouped by vendor, oldest balances first."
        rows={payables}
        entityLabel="Vendor"
        tone="ap"
      />
    </div>
  );
}

function sumField(rows: AgingBucketRow[], field: keyof AgingBucketRow) {
  return rows.reduce((s, r) => s + (typeof r[field] === 'number' ? (r[field] as number) : 0), 0);
}

function AgingTable({
  title,
  description,
  rows,
  entityLabel,
  tone,
}: {
  title: string;
  description: string;
  rows: AgingBucketRow[];
  entityLabel: string;
  tone: 'ar' | 'ap';
}) {
  const sorted = [...rows].sort((a, b) => b.total - a.total);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {sorted.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Nothing outstanding" description="Nice and clean — no open balances here." />
          </div>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>{entityLabel}</Th>
                <Th className="text-right">Current</Th>
                <Th className="text-right">1–30 days</Th>
                <Th className="text-right">31–60 days</Th>
                <Th className="text-right">61–90 days</Th>
                <Th className="text-right">90+ days</Th>
                <Th className="text-right">Total</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sorted.map((row) => {
                const seriouslyOverdue = row.d61to90 + row.d90plus > 0;
                return (
                  <Tr key={row.name}>
                    <Td className="font-medium text-slate-900">
                      {row.name}
                      {seriouslyOverdue ? (
                        <Badge tone={tone === 'ar' ? 'danger' : 'warning'} className="ml-2">
                          {tone === 'ar' ? 'Follow up' : 'Due soon'}
                        </Badge>
                      ) : null}
                    </Td>
                    <Td className="text-right">{formatCurrency(row.current)}</Td>
                    <Td className="text-right">{formatCurrency(row.d1to30)}</Td>
                    <Td className="text-right">{formatCurrency(row.d31to60)}</Td>
                    <Td className="text-right">{formatCurrency(row.d61to90)}</Td>
                    <Td className="text-right">{formatCurrency(row.d90plus)}</Td>
                    <Td className="text-right font-semibold text-slate-900">{formatCurrency(row.total)}</Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}
