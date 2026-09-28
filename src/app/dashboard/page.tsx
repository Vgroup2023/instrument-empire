import { ConnectBanner } from '@/components/ConnectBanner';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { QuickAccessGrid } from '@/components/dashboard/QuickAccessGrid';
import { isQboConnected } from '@/lib/quickbooks/client';
import { getProfitAndLoss, getCashFlow, getBalanceSheet } from '@/lib/quickbooks/reports';
import { getBenchmark } from '@/lib/quickbooks/benchmark';
import { formatCurrency, formatPercent } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function DashboardHomePage() {
  const connected = await isQboConnected();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Everything for the accounts department, in one place. Jump to a section, or see today's financial insights below."
      />
      <div className="mb-8">
        <QuickAccessGrid excludeHref="/dashboard" />
      </div>
      <ConnectBanner />

      <h2 className="mb-4 text-base font-semibold text-slate-900">Financial insights</h2>
      {connected ? <InsightsBody /> : <NotConnectedPlaceholder />}
    </div>
  );
}

function NotConnectedPlaceholder() {
  return (
    <EmptyState
      title="No QuickBooks data yet"
      description="Connect QuickBooks above to see profitability, cash flow, balance sheet, and benchmarking for your business."
    />
  );
}

async function InsightsBody() {
  let error: string | null = null;
  let profitability: Awaited<ReturnType<typeof getProfitAndLoss>> | null = null;
  let cashFlow: Awaited<ReturnType<typeof getCashFlow>> | null = null;
  let balanceSheet: Awaited<ReturnType<typeof getBalanceSheet>> | null = null;

  try {
    [profitability, cashFlow, balanceSheet] = await Promise.all([
      getProfitAndLoss('this-year'),
      getCashFlow('this-year'),
      getBalanceSheet('this-year'),
    ]);
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load QuickBooks reports.';
  }

  if (error || !profitability || !cashFlow || !balanceSheet) {
    return (
      <EmptyState
        title="Couldn't load your reports"
        description={error ?? 'Please try again in a moment.'}
      />
    );
  }

  const grossMarginPct = profitability.totalIncome
    ? (profitability.grossProfit / profitability.totalIncome) * 100
    : 0;
  const netMarginPct = profitability.totalIncome
    ? (profitability.netIncome / profitability.totalIncome) * 100
    : 0;

  const benchmark = await getBenchmark(profitability, balanceSheet).catch(() => null);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Profitability (year to date)</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total income" value={formatCurrency(profitability.totalIncome)} />
          <StatCard
            label="Gross profit"
            value={formatCurrency(profitability.grossProfit)}
            hint={formatPercent(grossMarginPct) + ' margin'}
          />
          <StatCard label="Total expenses" value={formatCurrency(profitability.totalExpenses)} />
          <StatCard
            label="Net income"
            value={formatCurrency(profitability.netIncome)}
            hint={formatPercent(netMarginPct) + ' margin'}
            delta={{ value: formatPercent(netMarginPct), positive: profitability.netIncome >= 0 }}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Cash flow (year to date)</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Operating cash flow" value={formatCurrency(cashFlow.operatingCashFlow)} />
          <StatCard label="Investing cash flow" value={formatCurrency(cashFlow.investingCashFlow)} />
          <StatCard label="Financing cash flow" value={formatCurrency(cashFlow.financingCashFlow)} />
          <StatCard
            label="Net change in cash"
            value={formatCurrency(cashFlow.netCashIncrease)}
            delta={{ value: '', positive: cashFlow.netCashIncrease >= 0 }}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Balance sheet health (as of {balanceSheet.asOfDate})
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total assets" value={formatCurrency(balanceSheet.totalAssets)} />
          <StatCard label="Total liabilities" value={formatCurrency(balanceSheet.totalLiabilities)} />
          <StatCard label="Total equity" value={formatCurrency(balanceSheet.totalEquity)} />
          <StatCard
            label="Current ratio"
            value={balanceSheet.currentRatio !== null ? balanceSheet.currentRatio.toFixed(2) : '—'}
            hint="current assets ÷ current liabilities"
          />
        </div>
      </section>

      {benchmark ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                How you compare
                {benchmark.isEstimate ? <Badge tone="warning">Estimated</Badge> : null}
              </CardTitle>
              <CardDescription>
                {benchmark.isEstimate
                  ? `Illustrative peer figures for ${benchmark.region} — connect real industry benchmarking (see Settings) for actual peer data.`
                  : `${benchmark.industry} · ${benchmark.region} · ${benchmark.peerCompanyCount} similar businesses`}
              </CardDescription>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            {benchmark.metrics.map((metric) => {
              const youAhead = metric.higherIsBetter
                ? metric.yourValue >= metric.peerMedian
                : metric.yourValue <= metric.peerMedian;
              const format = (v: number) =>
                metric.unit === 'percent'
                  ? formatPercent(v)
                  : metric.unit === 'currency'
                    ? formatCurrency(v)
                    : v.toFixed(2);
              return (
                <div key={metric.key} className="flex items-center justify-between gap-4 text-sm">
                  <span className="w-40 shrink-0 font-medium text-slate-700">{metric.label}</span>
                  <div className="flex flex-1 items-center gap-6">
                    <span className={youAhead ? 'text-emerald-600' : 'text-slate-500'}>
                      You: <span className="font-semibold">{format(metric.yourValue)}</span>
                    </span>
                    <span className="text-slate-400">
                      Peer median: <span className="font-medium text-slate-600">{format(metric.peerMedian)}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
