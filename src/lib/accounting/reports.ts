import { getDb } from '@/db/client';
import { sql } from 'drizzle-orm';
import { resolvePeriod, type PeriodKey, type DateRange } from '@/lib/dateRanges';
import { sumBalancesByAccountType } from '@/lib/accounting/chartOfAccounts';

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

function computeProfitAndLoss(typeTotals: Map<string, number>, range: DateRange): ProfitabilitySummary {
  const totalIncome = round2(typeTotals.get('Income') ?? 0);
  const costOfGoodsSold = round2(typeTotals.get('Cost of Goods Sold') ?? 0);
  const totalExpenses = round2(sumTypes(typeTotals, ['Expense', 'Other Expense']));
  const grossProfit = round2(totalIncome - costOfGoodsSold);
  const netIncome = round2(grossProfit - totalExpenses);

  return { totalIncome, costOfGoodsSold, grossProfit, totalExpenses, netIncome, startDate: range.startDate, endDate: range.endDate };
}

export async function getProfitAndLoss(period: PeriodKey = 'this-year'): Promise<ProfitabilitySummary> {
  const range = resolvePeriod(period);
  const typeTotals = await sumBalancesByAccountType(range);
  return computeProfitAndLoss(typeTotals, range);
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

function computeCashFlow(typeTotals: Map<string, number>, range: DateRange): CashFlowSummary {
  const netCashIncrease = round2(typeTotals.get('Bank') ?? 0);
  // A rise in Fixed/Other Asset balances is a use of cash (investing outflow).
  const investingCashFlow = round2(-sumTypes(typeTotals, INVESTING_TYPES));
  // A rise in Equity/Long Term Liability balances is a source of cash (financing inflow).
  const financingCashFlow = round2(sumTypes(typeTotals, FINANCING_TYPES));
  const operatingCashFlow = round2(netCashIncrease - investingCashFlow - financingCashFlow);

  return { operatingCashFlow, investingCashFlow, financingCashFlow, netCashIncrease, startDate: range.startDate, endDate: range.endDate };
}

export async function getCashFlow(period: PeriodKey = 'this-year'): Promise<CashFlowSummary> {
  const range = resolvePeriod(period);
  const typeTotals = await sumBalancesByAccountType(range);
  return computeCashFlow(typeTotals, range);
}

/**
 * P&L and Cash Flow for the same period are both derived from the same
 * underlying account-balance totals. Fetching those totals once here —
 * instead of via separate getProfitAndLoss()/getCashFlow() calls, each of
 * which re-fetches accounts and re-collects postings — halves the DB round
 * trips for pages (like the Dashboard) that show both together.
 */
export async function getProfitAndLossAndCashFlow(
  period: PeriodKey = 'this-year',
): Promise<{ profitability: ProfitabilitySummary; cashFlow: CashFlowSummary }> {
  const range = resolvePeriod(period);
  const typeTotals = await sumBalancesByAccountType(range);
  return { profitability: computeProfitAndLoss(typeTotals, range), cashFlow: computeCashFlow(typeTotals, range) };
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
 * Accounts Receivable/Payable balance = (sum of every line's amount) minus
 * (sum of every payment's amount), across ALL invoices/bills at once rather
 * than per document — there's no void/soft-delete concept here, a deleted
 * invoice or bill cascade-deletes its own lines and payments, so this global
 * aggregate is exactly equivalent to summing each document's own Balance.
 * It replaces what used to be a full listInvoices()/listBills() call here —
 * each ~5 queries joining customer names, product names, and line items the
 * balance sheet never uses — with one trivial aggregate query apiece. Worth
 * it because this runs on every Dashboard load.
 */
async function sumArBalance(): Promise<number> {
  const db = getDb();
  const [row] = await db.execute<{ balance: string | null }>(sql`
    SELECT (COALESCE((SELECT SUM(amount) FROM invoice_lines), 0)
          - COALESCE((SELECT SUM(amount) FROM invoice_payments), 0))::text AS balance
  `);
  return Number(row.balance ?? 0);
}

async function sumApBalance(): Promise<number> {
  const db = getDb();
  const [row] = await db.execute<{ balance: string | null }>(sql`
    SELECT (COALESCE((SELECT SUM(amount) FROM bill_lines), 0)
          - COALESCE((SELECT SUM(amount) FROM bill_payments), 0))::text AS balance
  `);
  return Number(row.balance ?? 0);
}

/**
 * Accounts Receivable and Accounts Payable aren't posted to the ledger as GL
 * accounts (there's no arAccountId/apAccountId on invoices/bills) — instead
 * they're computed directly from unpaid invoice/bill balances (see
 * sumArBalance/sumApBalance above). Since resolvePeriod's endDate is always
 * today, those "current" balances are already exactly "as of endDate".
 */
export async function getBalanceSheet(period: PeriodKey = 'this-year'): Promise<BalanceSheetSummary> {
  const { endDate } = resolvePeriod(period);
  const asOfRange: DateRange = { startDate: EPOCH, endDate };

  const [typeTotals, arBalanceRaw, apBalanceRaw] = await Promise.all([
    sumBalancesByAccountType(asOfRange),
    sumArBalance(),
    sumApBalance(),
  ]);
  const profitToDate = cumulativeNetIncome(typeTotals);

  const arBalance = round2(arBalanceRaw);
  const apBalance = round2(apBalanceRaw);

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

/**
 * Aging is worked out by the database: it adds up each invoice's lines and
 * payments and returns only the open balances, grouped by customer and due
 * date. Loading every invoice with its lines, customer and product names
 * just to bucket a handful of totals took seconds on a large ledger.
 */
export async function getArAgingSummary(): Promise<AgingBucketRow[]> {
  const db = getDb();
  const rows = await db.execute<{ name: string; due: string; balance: string }>(sql`
    SELECT c.display_name AS name, COALESCE(i.due_date, i.txn_date)::text AS due,
           SUM(t.total - COALESCE(p.paid, 0))::text AS balance
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    JOIN (SELECT invoice_id, SUM(amount) AS total FROM invoice_lines GROUP BY invoice_id) t ON t.invoice_id = i.id
    LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM invoice_payments GROUP BY invoice_id) p ON p.invoice_id = i.id
    WHERE t.total - COALESCE(p.paid, 0) > 0
    GROUP BY c.display_name, COALESCE(i.due_date, i.txn_date)
  `);
  return buildAgingSummary(rows.map((r) => ({ name: r.name ?? 'Unknown', balance: Number(r.balance), dueDate: r.due })));
}

export async function getApAgingSummary(): Promise<AgingBucketRow[]> {
  const db = getDb();
  const rows = await db.execute<{ name: string; due: string; balance: string }>(sql`
    SELECT v.display_name AS name, COALESCE(b.due_date, b.txn_date)::text AS due,
           SUM(t.total - COALESCE(p.paid, 0))::text AS balance
    FROM bills b
    JOIN vendors v ON v.id = b.vendor_id
    JOIN (SELECT bill_id, SUM(amount) AS total FROM bill_lines GROUP BY bill_id) t ON t.bill_id = b.id
    LEFT JOIN (SELECT bill_id, SUM(amount) AS paid FROM bill_payments GROUP BY bill_id) p ON p.bill_id = b.id
    WHERE t.total - COALESCE(p.paid, 0) > 0
    GROUP BY v.display_name, COALESCE(b.due_date, b.txn_date)
  `);
  return buildAgingSummary(rows.map((r) => ({ name: r.name ?? 'Unknown', balance: Number(r.balance), dueDate: r.due })));
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
  return (await getSalesBreakdown(period)).byCustomer;
}

export async function getSalesByProduct(period: PeriodKey = 'this-year'): Promise<SalesBreakdownRow[]> {
  return (await getSalesBreakdown(period)).byProduct;
}

/**
 * The Sales breakdown page shows both of these together, so this fetches
 * invoices once and derives both groupings from it — getSalesByCustomer()
 * and getSalesByProduct() used to each independently call listInvoices()
 * (itself ~5 joined queries), silently doubling that page's DB round trips
 * every time it loaded.
 */
export async function getSalesBreakdown(
  period: PeriodKey = 'this-year',
): Promise<{ byCustomer: SalesBreakdownRow[]; byProduct: SalesBreakdownRow[] }> {
  const { startDate, endDate } = resolvePeriod(period);
  const db = getDb();
  // Totals per customer and per product/description are added up in the database
  // (only a row per name comes back), not by loading every invoice and line.
  const [customerRows, productRows] = await Promise.all([
    db.execute<{ name: string; amount: string }>(sql`
      SELECT c.display_name AS name, SUM(il.amount)::text AS amount
      FROM invoice_lines il
      JOIN invoices i ON i.id = il.invoice_id
      JOIN customers c ON c.id = i.customer_id
      WHERE i.txn_date >= ${startDate}::date AND i.txn_date <= ${endDate}::date
      GROUP BY c.display_name
    `),
    db.execute<{ name: string; amount: string }>(sql`
      SELECT COALESCE(p.name, il.description, 'Custom item') AS name, SUM(il.amount)::text AS amount
      FROM invoice_lines il
      JOIN invoices i ON i.id = il.invoice_id
      LEFT JOIN products p ON p.id = il.product_id
      WHERE i.txn_date >= ${startDate}::date AND i.txn_date <= ${endDate}::date
      GROUP BY COALESCE(p.name, il.description, 'Custom item')
    `),
  ]);
  return {
    byCustomer: buildSalesBreakdown(customerRows.map((r) => ({ name: r.name ?? 'Unknown', amount: Number(r.amount) }))),
    byProduct: buildSalesBreakdown(productRows.map((r) => ({ name: r.name, amount: Number(r.amount) }))),
  };
}
