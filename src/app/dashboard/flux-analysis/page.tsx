import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { describeError } from '@/lib/errors';
import { getFluxAnalysis, type FluxAnalysis } from '@/lib/accounting/fluxAnalysis';
import { formatCurrency, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function FluxAnalysisPage() {
  return (
    <div>
      <PageHeader
        title="Flux analysis"
        description="Period-over-period variance, account by account — this month to date against the full prior month, sorted by the largest dollar swing. Purely quantitative: computed fresh from your ledger, not written commentary from an AI or a connection to a third-party close-automation tool like Numeric."
      />
      <FluxAnalysisBody />
    </div>
  );
}

async function FluxAnalysisBody() {
  let analysis: FluxAnalysis | null = null;
  let error: string | null = null;

  try {
    analysis = await getFluxAnalysis();
  } catch (err) {
    error = describeError(err, 'Failed to run flux analysis.');
  }

  if (error || !analysis) {
    return <EmptyState title="Couldn't run flux analysis" description={error ?? 'Please try again in a moment.'} />;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Comparing <strong>{formatDate(analysis.current.startDate)}–{formatDate(analysis.current.endDate)}</strong> against{' '}
        <strong>{formatDate(analysis.prior.startDate)}–{formatDate(analysis.prior.endDate)}</strong>.
      </p>
      <Card>
        <CardBody className="p-0">
          {analysis.rows.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No activity to compare" description="Neither period has any posted activity yet." />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Account</Th>
                  <Th>Type</Th>
                  <Th className="text-right">This month</Th>
                  <Th className="text-right">Prior month</Th>
                  <Th className="text-right">Variance</Th>
                  <Th className="text-right">Variance %</Th>
                </Tr>
              </Thead>
              <Tbody>
                {analysis.rows.map((row) => (
                  <Tr key={row.accountId}>
                    <Td className="font-medium text-slate-900">{row.accountName}</Td>
                    <Td>
                      <Badge tone="neutral">{row.accountType}</Badge>
                    </Td>
                    <Td className="text-right">{formatCurrency(row.currentAmount)}</Td>
                    <Td className="text-right">{formatCurrency(row.priorAmount)}</Td>
                    <Td className={`text-right font-medium ${row.variance > 0 ? 'text-emerald-600' : row.variance < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                      {row.variance > 0 ? '+' : ''}
                      {formatCurrency(row.variance)}
                    </Td>
                    <Td className="text-right text-slate-500">
                      {row.variancePercent !== null ? `${row.variancePercent > 0 ? '+' : ''}${row.variancePercent}%` : '—'}
                    </Td>
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
