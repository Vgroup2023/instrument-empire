import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { describeError } from '@/lib/errors';
import { detectAnomalies, type Anomaly, type AnomalySeverity } from '@/lib/accounting/anomalies';
import { formatCurrency, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

const SEVERITY_TONE: Record<AnomalySeverity, 'danger' | 'warning' | 'neutral'> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
};

const SEVERITY_LABEL: Record<AnomalySeverity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export default async function AnomaliesPage() {
  return (
    <div>
      <PageHeader
        title="Anomaly detection"
        description="Issues flagged automatically from your ledger — duplicate transactions, unusual amounts, unbalanced journal entries, and unusually-timed entries. Recomputed live from your data every time you open this page, using statistics from your own transaction history rather than a trained model."
      />
      <AnomaliesBody />
    </div>
  );
}

async function AnomaliesBody() {
  let anomalies: Anomaly[] = [];
  let error: string | null = null;

  try {
    anomalies = await detectAnomalies();
  } catch (err) {
    error = describeError(err, 'Failed to run anomaly detection.');
  }

  if (error) {
    return <EmptyState title="Couldn't run anomaly detection" description={error} />;
  }

  const highCount = anomalies.filter((a) => a.severity === 'high').length;
  const mediumCount = anomalies.filter((a) => a.severity === 'medium').length;
  const lowCount = anomalies.filter((a) => a.severity === 'low').length;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total flagged" value={String(anomalies.length)} />
        <StatCard label="High severity" value={String(highCount)} />
        <StatCard label="Medium severity" value={String(mediumCount)} />
        <StatCard label="Low severity" value={String(lowCount)} />
      </div>

      <Card>
        <CardBody className="p-0">
          {anomalies.length === 0 ? (
            <div className="p-6">
              <EmptyState title="All clear" description="Nothing unusual detected in your ledger right now." />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Severity</Th>
                  <Th>Category</Th>
                  <Th>Details</Th>
                  <Th>Date</Th>
                  <Th className="text-right">Amount</Th>
                </Tr>
              </Thead>
              <Tbody>
                {anomalies.map((a) => (
                  <Tr key={a.id}>
                    <Td>
                      <Badge tone={SEVERITY_TONE[a.severity]}>{SEVERITY_LABEL[a.severity]}</Badge>
                    </Td>
                    <Td className="font-medium text-slate-900">{a.category}</Td>
                    <Td className="max-w-xl text-slate-600">{a.description}</Td>
                    <Td>{formatDate(a.date)}</Td>
                    <Td className="text-right">{a.amount !== undefined ? formatCurrency(a.amount) : '—'}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
