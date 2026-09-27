import type { BalanceSheetSummary, ProfitabilitySummary } from '@/lib/quickbooks/reports';
import type { BenchmarkResult } from '@/lib/quickbooks/benchmark';

// Demo peer data. In "live" mode this would come from Intuit's industry
// benchmarking product for the connected company's industry code + region.
export function buildMockBenchmark(
  profitability: ProfitabilitySummary,
  balanceSheet: BalanceSheetSummary,
): BenchmarkResult {
  const grossMarginPct = profitability.totalIncome
    ? (profitability.grossProfit / profitability.totalIncome) * 100
    : 0;
  const netMarginPct = profitability.totalIncome
    ? (profitability.netIncome / profitability.totalIncome) * 100
    : 0;

  return {
    industry: 'Musical Instruments & Supplies Retail',
    region: 'United States',
    peerCompanyCount: 412,
    generatedAt: new Date().toISOString(),
    metrics: [
      {
        key: 'gross_margin',
        label: 'Gross margin',
        unit: 'percent',
        higherIsBetter: true,
        yourValue: round1(grossMarginPct),
        peerMedian: 42.5,
      },
      {
        key: 'net_margin',
        label: 'Net margin',
        unit: 'percent',
        higherIsBetter: true,
        yourValue: round1(netMarginPct),
        peerMedian: 8.2,
      },
      {
        key: 'current_ratio',
        label: 'Current ratio',
        unit: 'ratio',
        higherIsBetter: true,
        yourValue: round2(balanceSheet.currentRatio ?? 0),
        peerMedian: 1.8,
      },
      {
        key: 'revenue',
        label: 'Annual revenue',
        unit: 'currency',
        higherIsBetter: true,
        yourValue: profitability.totalIncome,
        peerMedian: 890_000,
      },
    ],
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
