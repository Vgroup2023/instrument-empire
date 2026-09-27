import { qboReport } from '@/lib/quickbooks/client';
import { findTotal, reportRowsAsRecords, toNumber, type QboReport } from '@/lib/quickbooks/reportParsing';
import { resolvePeriod, type PeriodKey } from '@/lib/dateRanges';

export interface ProfitabilitySummary {
  totalIncome: number;
  costOfGoodsSold: number;
  grossProfit: number;
  totalExpenses: number;
  netIncome: number;
  startDate: string;
  endDate: string;
}

export async function getProfitAndLoss(period: PeriodKey = 'this-year'): Promise<ProfitabilitySummary> {
  const { startDate, endDate } = resolvePeriod(period);
  const report = await qboReport<QboReport>('ProfitAndLoss', { start_date: startDate, end_date: endDate });

  const totalIncome = findTotal(report, [/^total income$/i, /^income$/i]);
  const costOfGoodsSold = findTotal(report, [/^total cost of goods sold$/i, /^cost of goods sold$/i]);
  const grossProfit = findTotal(report, [/^gross profit$/i]);
  const totalExpenses = findTotal(report, [/^total expenses$/i, /^expenses$/i]);
  const netIncome = findTotal(report, [/^net income$/i, /^net operating income$/i]);

  return {
    totalIncome,
    costOfGoodsSold,
    grossProfit: grossProfit || totalIncome - costOfGoodsSold,
    totalExpenses,
    netIncome,
    startDate,
    endDate,
  };
}

export interface CashFlowSummary {
  operatingCashFlow: number;
  investingCashFlow: number;
  financingCashFlow: number;
  netCashIncrease: number;
  startDate: string;
  endDate: string;
}

export async function getCashFlow(period: PeriodKey = 'this-year'): Promise<CashFlowSummary> {
  const { startDate, endDate } = resolvePeriod(period);
  const report = await qboReport<QboReport>('CashFlow', { start_date: startDate, end_date: endDate });

  return {
    operatingCashFlow: findTotal(report, [/net cash provided by operating activities/i]),
    investingCashFlow: findTotal(report, [/net cash provided by investing activities/i]),
    financingCashFlow: findTotal(report, [/net cash provided by financing activities/i]),
    netCashIncrease: findTotal(report, [/net increase\/decrease in cash/i, /net increase in cash/i]),
    startDate,
    endDate,
  };
}

export interface BalanceSheetSummary {
  totalAssets: number;
  totalCurrentAssets: number;
  totalLiabilities: number;
  totalCurrentLiabilities: number;
  totalEquity: number;
  currentRatio: number | null;
  asOfDate: string;
}

export async function getBalanceSheet(period: PeriodKey = 'this-year'): Promise<BalanceSheetSummary> {
  const { endDate } = resolvePeriod(period);
  const report = await qboReport<QboReport>('BalanceSheet', { date: endDate });

  const totalAssets = findTotal(report, [/^total assets$/i]);
  const totalCurrentAssets = findTotal(report, [/^total current assets$/i]);
  const totalLiabilities = findTotal(report, [/^total liabilities$/i]);
  const totalCurrentLiabilities = findTotal(report, [/^total current liabilities$/i]);
  const totalEquity = findTotal(report, [/^total equity$/i]);

  return {
    totalAssets,
    totalCurrentAssets,
    totalLiabilities,
    totalCurrentLiabilities,
    totalEquity,
    currentRatio: totalCurrentLiabilities > 0 ? totalCurrentAssets / totalCurrentLiabilities : null,
    asOfDate: endDate,
  };
}

export interface AgingBucketRow {
  name: string;
  current: number;
  d1to30: number;
  d31to60: number;
  d61to90: number;
  d90plus: number;
  total: number;
}

function parseAgingReport(report: QboReport): AgingBucketRow[] {
  const columns = report.Columns?.Column ?? [];
  const findColIndex = (pattern: RegExp) => columns.findIndex((c) => pattern.test(c.ColTitle));

  const idxCurrent = findColIndex(/current/i);
  const idx1_30 = findColIndex(/1\s*-\s*30/);
  const idx31_60 = findColIndex(/31\s*-\s*60/);
  const idx61_90 = findColIndex(/61\s*-\s*90/);
  const idx90plus = findColIndex(/(90|91).*(over|up|plus)|>\s*90/i);
  const idxTotal = findColIndex(/^total$/i);

  const records = reportRowsAsRecords(report);
  return records.map((record) => {
    const values = Object.values(record);
    const at = (idx: number) => (idx >= 0 ? toNumber(values[idx]) : 0);
    return {
      name: values[0] ?? 'Unknown',
      current: at(idxCurrent),
      d1to30: at(idx1_30),
      d31to60: at(idx31_60),
      d61to90: at(idx61_90),
      d90plus: at(idx90plus),
      total: idxTotal >= 0 ? at(idxTotal) : at(idxCurrent) + at(idx1_30) + at(idx31_60) + at(idx61_90) + at(idx90plus),
    };
  });
}

export async function getArAgingSummary(): Promise<AgingBucketRow[]> {
  const report = await qboReport<QboReport>('AgedReceivables');
  return parseAgingReport(report);
}

export async function getApAgingSummary(): Promise<AgingBucketRow[]> {
  const report = await qboReport<QboReport>('AgedPayables');
  return parseAgingReport(report);
}

export interface SalesBreakdownRow {
  name: string;
  amount: number;
}

function parseSalesReport(report: QboReport): SalesBreakdownRow[] {
  const columns = report.Columns?.Column ?? [];
  let amountIdx = columns.findIndex((c) => /^total$/i.test(c.ColTitle));
  if (amountIdx < 0) amountIdx = columns.length - 1;

  const records = reportRowsAsRecords(report);
  return records
    .map((record) => {
      const values = Object.values(record);
      return { name: values[0] ?? 'Unknown', amount: toNumber(values[amountIdx]) };
    })
    .filter((row) => row.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
}

export async function getSalesByCustomer(period: PeriodKey = 'this-year'): Promise<SalesBreakdownRow[]> {
  const { startDate, endDate } = resolvePeriod(period);
  const report = await qboReport<QboReport>('CustomerIncome', { start_date: startDate, end_date: endDate });
  return parseSalesReport(report);
}

export async function getSalesByProduct(period: PeriodKey = 'this-year'): Promise<SalesBreakdownRow[]> {
  const { startDate, endDate } = resolvePeriod(period);
  const report = await qboReport<QboReport>('ItemSales', { start_date: startDate, end_date: endDate });
  return parseSalesReport(report);
}
