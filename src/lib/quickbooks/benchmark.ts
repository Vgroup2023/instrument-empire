import { providers } from '@/lib/config';
import type { BalanceSheetSummary, ProfitabilitySummary } from '@/lib/quickbooks/reports';
import { buildMockBenchmark } from '@/lib/quickbooks/mock/benchmark';

export type BenchmarkUnit = 'percent' | 'currency' | 'ratio';

export interface BenchmarkMetric {
  key: string;
  label: string;
  unit: BenchmarkUnit;
  higherIsBetter: boolean;
  yourValue: number;
  peerMedian: number;
}

export interface BenchmarkResult {
  industry: string;
  region: string;
  peerCompanyCount: number;
  generatedAt: string;
  metrics: BenchmarkMetric[];
  /** True until BENCHMARK_PROVIDER=live is wired up — the peer-side numbers are illustrative, not real Intuit benchmark data. */
  isEstimate: boolean;
}

/**
 * Industry benchmarking requires Intuit's benchmarking product, which is
 * provisioned separately from the standard Accounting API scope. Until that
 * is wired up (BENCHMARK_PROVIDER=live), "yourValue" on each metric is
 * computed from your actual connected P&L/balance sheet, but the peer-side
 * numbers are illustrative placeholders — clearly flagged via isEstimate
 * so they're never mistaken for real industry data when making decisions.
 */
export async function getBenchmark(
  profitability: ProfitabilitySummary,
  balanceSheet: BalanceSheetSummary,
): Promise<BenchmarkResult> {
  if (providers.benchmark === 'live') {
    throw new Error(
      'BENCHMARK_PROVIDER=live is set, but no live benchmarking integration has been wired up yet. ' +
        'Implement the call in src/lib/quickbooks/benchmark.ts once Intuit benchmarking access is provisioned.',
    );
  }
  return buildMockBenchmark(profitability, balanceSheet);
}
