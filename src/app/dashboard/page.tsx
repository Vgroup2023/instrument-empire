import { PrintButton } from '@/components/ui/PrintButton';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { RetryCard, ClearRetryFlag } from '@/components/dashboard/RetryCard';
import { describeError } from '@/lib/errors';
import { Suspense } from 'react';
import Link from 'next/link';
import { MasterTabGrid } from '@/components/dashboard/MasterTabGrid';
import { getTabStatus, type TabStatus } from '@/lib/tabStatus';
import { withTimeout } from '@/lib/withTimeout';
import { getProfitAndLossAndCashFlow, getBalanceSheet } from '@/lib/accounting/reports';
import { getBenchmark } from '@/lib/quickbooks/benchmark';
import { formatCurrency, formatPercent } from '@/lib/format';
import { NavIcon } from '@/components/layout/NavIcon';
import { getOverview } from '@/lib/dashboard/overview';
import { KpiRow, SalesCard, OrdersCard, ActivityCard, InventoryCard, CustomerCard, TeamCard, FinancialCard, OperationalBar } from '@/components/dashboard/overview/OverviewCards';

export const dynamic = 'force-dynamic';

export default function DashboardHomePage() {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f2447]">Dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-500">Overview of your business operations</p>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <Suspense fallback={null}>
            <MonthPill />
          </Suspense>
          <PrintButton />
        </div>
      </div>

      {/* Everything above the fold loads in one go and streams in; the tab guide and reports below do not wait for it. */}
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewBody />
      </Suspense>

      <h2 className="mb-1 mt-12 text-lg font-bold text-[#0f2447]">All tabs</h2>
      <p className="mb-5 text-sm text-slate-500">Every tab in the left menu, with what needs attention today.</p>
      <Suspense
        fallback={
          <div className="mb-10">
            <MasterTabGrid badges={{}} excludeHref="/dashboard" />
          </div>
        }
      >
        <LiveTabs />
      </Suspense>

      <h2 className="mb-4 text-lg font-bold text-[#0f2447]">Financial insights</h2>
      <Suspense fallback={<p className="text-sm text-slate-500">Loading your reports…</p>}>
        <InsightsBody />
      </Suspense>
    </div>
  );
}

async function MonthPill() {
  const o = await getOverview().catch(() => null);
  if (!o) return null;
  const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-card">
      {fmt(o.monthStart)} – {fmt(o.today)}, {o.today.slice(0, 4)}
      <NavIcon name="calendar" size={16} className="text-slate-500" />
    </span>
  );
}

async function OverviewBody() {
  const o = await getOverview();
  return (
    <div className="space-y-5">
      <KpiRow o={o} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-9">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-9">
            <div className="lg:col-span-5"><SalesCard o={o} /></div>
            <div className="lg:col-span-4"><OrdersCard o={o} /></div>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <InventoryCard o={o} />
            <CustomerCard o={o} />
            <TeamCard o={o} />
          </div>
        </div>
        <div className="space-y-5 xl:col-span-3">
          <ActivityCard o={o} />
          <Suspense fallback={<FinancialCard revenue={0} expenses={0} net={0} available={false} />}>
            <FinancialOverview />
          </Suspense>
        </div>
      </div>
      <OperationalBar o={o} />
    </div>
  );
}

async function FinancialOverview() {
  let figures: { revenue: number; expenses: number; net: number } | null = null;
  try {
    const { profitability } = await withTimeout(getProfitAndLossAndCashFlow('this-month'), 6000, 'The month took too long to load.');
    figures = { revenue: profitability.totalIncome, expenses: profitability.totalExpenses, net: profitability.netIncome };
  } catch {
    figures = null;
  }
  return <FinancialCard revenue={figures?.revenue ?? 0} expenses={figures?.expenses ?? 0} net={figures?.net ?? 0} available={figures !== null} />;
}

function OverviewSkeleton() {
  const block = (h: string) => <div className={`animate-pulse rounded-2xl border border-slate-200/80 bg-white ${h}`} />;
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading the dashboard">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i}>{block('h-[104px]')}</div>)}</div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-9">{block('h-[320px]')}{block('h-[200px]')}</div>
        <div className="space-y-5 xl:col-span-3">{block('h-[320px]')}{block('h-[160px]')}</div>
      </div>
      {block('h-[72px]')}
    </div>
  );
}

async function LiveTabs() {
  // Counts are a convenience: if the database is slow or down the tabs still show.
  let status: TabStatus = { badges: {}, attention: [] };
  try {
    status = await withTimeout(getTabStatus(), 3500, 'Tab counts took too long.');
  } catch {
    // leave the empty defaults
  }

  return (
    <>
      {status.attention.length ? (
        <section aria-label="Needs attention" className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {status.attention.map((a) => (
            <Link
              prefetch={false}
              key={a.label}
              href={a.href}
              className={`flex items-center justify-between rounded-xl2 border px-4 py-3 shadow-card transition hover:shadow-md ${
                a.tone === 'danger' ? 'border-red-200 bg-red-50' : 'border-gold-200 bg-gold-50'
              }`}
            >
              <span className="text-sm font-medium text-slate-800">{a.label}</span>
              <span className={`text-2xl font-semibold ${a.tone === 'danger' ? 'text-red-700' : 'text-gold-700'}`}>{a.count}</span>
            </Link>
          ))}
        </section>
      ) : null}
      <div className="mb-10">
        <MasterTabGrid badges={status.badges} excludeHref="/dashboard" />
      </div>
    </>
  );
}

async function InsightsBody() {
  let error: string | null = null;
  let profitability: Awaited<ReturnType<typeof getProfitAndLossAndCashFlow>>['profitability'] | null = null;
  let cashFlow: Awaited<ReturnType<typeof getProfitAndLossAndCashFlow>>['cashFlow'] | null = null;
  let balanceSheet: Awaited<ReturnType<typeof getBalanceSheet>> | null = null;

  try {
    const [plAndCashFlow, balanceSheetResult] = await withTimeout(
      Promise.all([getProfitAndLossAndCashFlow('this-year'), getBalanceSheet('this-year')]),
      7000,
      'Your reports took too long to load. The database may be slow or unreachable.',
    );
    profitability = plAndCashFlow.profitability;
    cashFlow = plAndCashFlow.cashFlow;
    balanceSheet = balanceSheetResult;
  } catch (err) {
    error = describeError(err, 'Failed to load reports.');
  }

  if (error || !profitability || !cashFlow || !balanceSheet) {
    return (
      <RetryCard
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
      <ClearRetryFlag />
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
