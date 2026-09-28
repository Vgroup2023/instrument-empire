import { resolvePeriod, type PeriodKey, type DateRange } from '@/lib/dateRanges';
import { sumBalancesByAccountType } from '@/lib/accounting/chartOfAccounts';
import { listInvoices } from '@/lib/accounting/invoices';
import { listBills } from '@/lib/accounting/bills';

// This is the standalone, database-backed reports engine — the app's own
// source of truth, computed from the local ledger (Chart of Accounts +
// Invoices/Bills/Expenses/Transfers/Payments), not QuickBooks. See
// src/lib/quickbooks/reports.ts for the (optional, separate) QuickBooks
// Reports-API-backed equivalent. Interfaces here match that module's
// field-for-field, so src/lib/quickbooks/benchmark.ts's getBenchmark() keeps
// working unmodified against locally-computed summaries.

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A date far enough back that no real transaction predates it — used as the lower bound for "as of" (all-time-to-date) queries. */
const EPOCH = '1900-01-01';

function sumTypes(totals: Map<string, number>, types: string[]): number {
  return types.reduce((sum, type) => sum + (totals.get(type) ?? 0), 0);
}

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
  const range = resolvePeriod(period);
  const typeTotals = await sumBalancesByAccountType(range);

  const totalIncome = round2(typeTotals.get('Income') ?? 0);
  const costOfGoodsSold = round2(typeTotals.get('Cost of Goods Sold') ?? 0);
  const totalExpenses = round2(sumTypes(typeTotals, ['Expense', 'Other Expense']));
  const grossProfit = round2(totalIncome - costOfGoodsSold);
  const netIncome = round2(grossProfit - totalExpenses);

  return { totalIncome, costOfGoodsSold, grossProfit, totalExpenses, netIncome, startDate: range.startDate, endDate: range.endDate };
}

export interface CashFlowSummary {
  operatingCashFlow: number;
  investingCashFlow: number;
  financingCashFlow: number;
  netCashIncrease: number;
  startDate: string;
  endDate: string;
}

// Investing/financing are classified by whole account type rather than by
// proportionally allocating each transaction — a deliberate simplification.
// Operating cash flow is then the residual (netCashIncrease - investing -
// financing), so the three always reconcile exactly even though the
// investing/financing split is approximate.
const INVESTING_TYPES = ['Fixed Asset', 'Other Asset'];
const FINANCING_TYPES = ['Equity', 'Long Term Liability'];

export async function getCashFlow(period: PeriodKey = 'this-year'): Promise<CashFlowSummary> {
  const range = resolvePeriod(period);
  const typeTotals = await sumBalancesByAccountType(range);

  const netCashIncrease = round2(typeTotals.get('Bank') ?? 0);
  // A rise in Fixed/Other Asset balances is a use of cash (investing outflow).
  const investingCashFlow = round2(-sumTypes(typeTotals, INVESTING_TYPES));
  // A rise in Equity/Long Term Liability balances is a source of cash (financing inflow).
  const financingCashFlow = round2(sumTypes(typeTotals, FINANCING_TYPES));
  const operatingCashFlow = round2(netCashIncrease - investingCashFlow - financingCashFlow);

  return { operatingCashFlow, investingCashFlow, financingCashFlow, netCashIncrease, startDate: range.startDate, endDate: range.endDate };
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

const CURRENT_ASSET_TYPES = ['Bank', 'Other Current Asset'];
const NON_CURRENT_ASSET_TYPES = ['Fixed Asset', 'Other Asset'];
const CURRENT_LIABILITY_TYPES = ['Credit Card', 'Other Current Liability'];
const NON_CURRENT_LIABILITY_TYPES = ['Long Term Liability'];

/**
 * Accounts Receivable and Accounts Payable aren't posted to the ledger as GL
 * accounts (there's no arAccountId/apAccountId on invoices/bills) — instead
 * they're computed directly from unpaid invoice/bill balances, reusing
 * Invoices/Bills' already-correct current-balance logic. Since
 * resolvePeriod's endDate is always today, those "current" balances are
 * already exactly "as of endDate".
 */
export async function getBalanceSheet(period: PeriodKey = 'this-year'): Promise<BalanceSheetSummary> {
  const { endDate } = resolvePeriod(period);
  const asOfRange: DateRange = { startDate: EPOCH, endDate };

  const [typeTotals, invoicesList, billsList] = await Promise.all([
    sumBalancesByAccountType(asOfRange),
    listInvoices(),
    listBills(),
  ]);
  const profitToDate = cumulativeNetIncome(typeTotals);

  const arBalance = round2(invoicesList.reduce((sum, inv) => sum + inv.Balance, 0));
  const apBalance = round2(billsList.reduce((sum, bill) => sum + bill.Balance, 0));

  const totalCurrentAssets = round2(sumTypes(typeTotals, CURRENT_ASSET_TYPES) + arBalance);
  const totalAssets = round2(totalCurrentAssets + sumTypes(typeTotals, NON_CURRENT_ASSET_TYPES));

  const totalCurrentLiabilities = round2(sumTypes(typeTotals, CURRENT_LIABILITY_TYPES) + apBalance);
  const totalLiabilities = round2(totalCurrentLiabilities + sumTypes(typeTotals, NON_CURRENT_LIABILITY_TYPES));

  // Retained earnings aren't closed into Equity by a formal journal entry
  // here, so cumulative net income since inception is folded in directly —
  // the same treatment QuickBooks' own live Balance Sheet uses.
  const totalEquity = round2((typeTotals.get('Equity') ?? 0) + profitToDate);

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

function cumulativeNetIncome(typeTotals: Map<string, number>): number {
  const totalIncome = typeTotals.get('Income') ?? 0;
  const costOfGoodsSold = typeTotals.get('Cost of Goods Sold') ?? 0;
  const totalExpenses = sumTypes(typeTotals, ['Expense', 'Other Expense']);
  return totalIncome - costOfGoodsSold - totalExpenses;
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

type AgingBucketKey = 'current' | 'd1to30' | 'd31to60' | 'd61to90' | 'd90plus';

function daysOverdue(dateStr: string): number {
  const due = Date.parse(`${dateStr}T00:00:00Z`);
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.floor((today - due) / (1000 * 60 * 60 * 24));
}

function bucketFor(days: number): AgingBucketKey {
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1to30';
  if (days <= 60) return 'd31to60';
  if (days <= 90) return 'd61to90';
  return 'd90plus';
}

function buildAgingSummary(rows: { name: string; balance: number; dueDate: string }[]): AgingBucketRow[] {
  const byName = new Map<string, AgingBucketRow>();
  for (const row of rows) {
    if (row.balance <= 0) continue;
    const bucket = bucketFor(daysOverdue(row.dueDate));
    const existing = byName.get(row.name) ?? {
      name: row.name,
      current: 0,
      d1to30: 0,
      d31to60: 0,
      d61to90: 0,
      d90plus: 0,
      total: 0,
    };
    existing[bucket] = round2(existing[bucket] + row.balance);
    existing.total = round2(existing.total + row.balance);
    byName.set(row.name, existing);
  }
  return [...byName.values()].sort((a, b) => b.total - a.total);
}

export async function getArAgingSummary(): Promise<AgingBucketRow[]> {
  const invoicesList = await listInvoices();
  return buildAgingSummary(
    invoicesList.map((inv) => ({
      name: inv.CustomerRef.name ?? 'Unknown',
      balance: inv.Balance,
      dueDate: inv.DueDate ?? inv.TxnDate,
    })),
  );
}

export async function getApAgingSummary(): Promise<AgingBucketRow[]> {
  const billsList = await listBills();
  return buildAgingSummary(
    billsList.map((bill) => ({
      name: bill.VendorRef.name ?? 'Unknown',
      balance: bill.Balance,
      dueDate: bill.DueDate ?? bill.TxnDate,
    })),
  );
}

export interface SalesBreakdownRow {
  name: string;
  amount: number;
}

function buildSalesBreakdown(rows: { name: string; amount: number }[]): SalesBreakdownRow[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.name, (totals.get(row.name) ?? 0) + row.amount);
  }
  return [...totals.entries()]
    .map(([name, amount]) => ({ name, amount: round2(amount) }))
    .filter((row) => row.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
}

export async function getSalesByCustomer(period: PeriodKey = 'this-year'): Promise<SalesBreakdownRow[]> {
  const { startDate, endDate } = resolvePeriod(period);
  const invoicesList = await listInvoices();
  const inPeriod = invoicesList.filter((inv) => inv.TxnDate >= startDate && inv.TxnDate <= endDate);
  return buildSalesBreakdown(inPeriod.map((inv) => ({ name: inv.CustomerRef.name ?? 'Unknown', amount: inv.TotalAmt })));
}

export async function getSalesByProduct(period: PeriodKey = 'this-year'): Promise<SalesBreakdownRow[]> {
  const { startDate, endDate } = resolvePeriod(period);
  const invoicesList = await listInvoices();
  const inPeriod = invoicesList.filter((inv) => inv.TxnDate >= startDate && inv.TxnDate <= endDate);
  const rows = inPeriod.flatMap((inv) =>
    inv.Line.map((line) => ({ name: line.SalesItemLineDetail.ItemRef.name ?? 'Unknown', amount: line.Amount })),
  );
  return buildSalesBreakdown(rows);
}
