import { getDb } from '@/db/client';
import type { Page } from '@/lib/paging';
import { expenses, expenseLines, vendors, accounts } from '@/db/schema';
import { eq, inArray, desc, sql } from 'drizzle-orm';
import type { AccountExpenseLine, ExpenseLineInput } from '@/lib/quickbooks/expenseLineTypes';
import {
  MAX_MONEY,
  NotFoundError,
  ValidationError,
  asRecord,
  isoDate,
  oneOf,
  optIsoDate,
  optUuid,
  round2 as roundMoney,
  todayIso,
  uuid,
} from '@/lib/validation';
import { requireAccount, requireAccounts, requireVendor, parseExpenseLines, EXPENSE_ACCOUNT_TYPES, PAYMENT_ACCOUNT_TYPES, type Executor } from '@/lib/accounting/entryRules';
import { nextDocNumber } from '@/lib/accounting/docNumbers';

export type { ExpenseLineInput };

// This is the standalone, database-backed Expenses ledger — the app's own
// source of truth, not QuickBooks. See src/lib/quickbooks/expenses.ts for
// the (optional, separate) QuickBooks-backed equivalent.

export type PaymentType = 'Cash' | 'Check' | 'CreditCard';

/** Money paid immediately (cash, debit, credit card, check) straight out of a bank/credit card account — distinct from a Bill, which is owed for later. */
export interface Expense {
  Id: string;
  /** Kept for UI compatibility with the QuickBooks-backed pages — not a real optimistic-concurrency token here. */
  SyncToken: string;
  DocNumber?: string;
  TxnDate: string;
  PaymentType: PaymentType;
  AccountRef: { value: string; name?: string };
  EntityRef?: { value: string; name?: string; type?: string };
  Line: AccountExpenseLine[];
  TotalAmt: number;
}

type ExpenseRow = typeof expenses.$inferSelect;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Pass the open transaction as `ex` when reading back something just written inside it (see invoices.ts).
async function attachDetails(rows: ExpenseRow[], ex: Executor = getDb()): Promise<Expense[]> {
  if (rows.length === 0) return [];
  const db = ex;
  const ids = rows.map((r) => r.id);
  const paymentAccountIds = [...new Set(rows.map((r) => r.paymentAccountId))];
  const vendorIds = [...new Set(rows.map((r) => r.vendorId).filter((id): id is string => Boolean(id)))];

  const [lineRows, paymentAccountRows, vendorRows] = await Promise.all([
    db.select().from(expenseLines).where(inArray(expenseLines.expenseId, ids)),
    db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(inArray(accounts.id, paymentAccountIds)),
    vendorIds.length
      ? db.select({ id: vendors.id, displayName: vendors.displayName }).from(vendors).where(inArray(vendors.id, vendorIds))
      : Promise.resolve([]),
  ]);

  const lineAccountIds = [...new Set(lineRows.map((l) => l.accountId))];
  const lineAccountRows = lineAccountIds.length
    ? await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(inArray(accounts.id, lineAccountIds))
    : [];
  const lineAccountNameById = new Map(lineAccountRows.map((a) => [a.id, a.name]));
  const paymentAccountNameById = new Map(paymentAccountRows.map((a) => [a.id, a.name]));
  const vendorNameById = new Map(vendorRows.map((v) => [v.id, v.displayName]));

  const linesByExpense = new Map<string, typeof lineRows>();
  for (const line of lineRows) {
    const list = linesByExpense.get(line.expenseId) ?? [];
    list.push(line);
    linesByExpense.set(line.expenseId, list);
  }

  return rows.map((row) => {
    const lineRowsForExpense = [...(linesByExpense.get(row.id) ?? [])].sort((a, b) => a.lineNumber - b.lineNumber);
    const line: AccountExpenseLine[] = lineRowsForExpense.map((l) => ({
      Id: l.id,
      DetailType: 'AccountBasedExpenseLineDetail',
      Amount: Number(l.amount),
      Description: l.description ?? undefined,
      AccountBasedExpenseLineDetail: { AccountRef: { value: l.accountId, name: lineAccountNameById.get(l.accountId) } },
    }));
    return {
      Id: row.id,
      SyncToken: row.updatedAt.getTime().toString(),
      DocNumber: row.docNumber ?? undefined,
      TxnDate: row.txnDate,
      PaymentType: row.paymentType,
      AccountRef: { value: row.paymentAccountId, name: paymentAccountNameById.get(row.paymentAccountId) },
      EntityRef: row.vendorId ? { value: row.vendorId, name: vendorNameById.get(row.vendorId), type: 'Vendor' } : undefined,
      Line: line,
      TotalAmt: round2(line.reduce((sum, l) => sum + l.Amount, 0)),
    };
  });
}

export async function listExpenses(): Promise<Expense[]> {
  const db = getDb();
  const rows = await db.select().from(expenses).orderBy(desc(expenses.txnDate), desc(expenses.createdAt));
  return attachDetails(rows);
}

/** The newest `limit` rows after skipping `offset`, plus the overall count, so a tab can open fast and load more on request. */
export async function listExpensesPage(limit: number, offset: number): Promise<Page<Expense>> {
  const db = getDb();
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(expenses).orderBy(desc(expenses.txnDate), desc(expenses.createdAt)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(expenses),
  ]);
  return { items: await attachDetails(rows), total: n };
}

export async function getExpense(id: string, ex: Executor = getDb()): Promise<Expense> {
  uuid(id, 'Expense');
  const [row] = await ex.select().from(expenses).where(eq(expenses.id, id));
  if (!row) throw new NotFoundError('Expense not found.');
  const [expense] = await attachDetails([row], ex);
  return expense;
}

function toLineInsertRows(lines: ExpenseLineInput[]) {
  return lines.map((line, index) => ({
    accountId: line.accountId,
    description: line.description || null,
    amount: line.amount.toFixed(2),
    lineNumber: index + 1,
  }));
}

function checkedTotal(lines: ExpenseLineInput[]): void {
  if (roundMoney(lines.reduce((sum, l) => sum + l.amount, 0)) > MAX_MONEY) throw new ValidationError('The expense total is too large.');
}

const PAYMENT_TYPES = ['Cash', 'Check', 'CreditCard'] as const;

export interface CreateExpenseInput {
  paymentAccountId: string;
  paymentAccountName?: string;
  paymentType: PaymentType;
  vendorId?: string;
  vendorName?: string;
  txnDate?: string;
  lines: ExpenseLineInput[];
}

export async function createExpense(input: CreateExpenseInput): Promise<Expense> {
  const raw = asRecord(input, 'The expense');
  const paymentAccountId = uuid(raw.paymentAccountId, 'Payment account');
  const paymentType = oneOf(raw.paymentType, 'Payment type', PAYMENT_TYPES);
  const vendorId = optUuid(raw.vendorId, 'Vendor');
  const txnDate = optIsoDate(raw.txnDate, 'Expense date') ?? todayIso();
  const lines = parseExpenseLines(raw.lines);
  checkedTotal(lines);

  const db = getDb();
  return db.transaction(async (tx) => {
    await requireAccount(tx, paymentAccountId, 'The payment account', PAYMENT_ACCOUNT_TYPES);
    await requireAccounts(tx, lines.map((l) => l.accountId), 'An account on this expense', EXPENSE_ACCOUNT_TYPES);
    if (vendorId) await requireVendor(tx, vendorId);
    const docNumber = await nextDocNumber(tx, 'expense', 'EXP');
    const [row] = await tx
      .insert(expenses)
      .values({ docNumber, txnDate, paymentAccountId, paymentType, vendorId: vendorId ?? null })
      .returning();
    await tx.insert(expenseLines).values(toLineInsertRows(lines).map((line) => ({ ...line, expenseId: row.id })));
    const [expense] = await attachDetails([row], tx);
    return expense;
  });
}

export interface UpdateExpenseInput {
  id: string;
  /** Accepted for call-site compatibility with the QuickBooks-backed version; unused here. */
  syncToken?: string;
  txnDate?: string;
  lines?: ExpenseLineInput[];
  paymentAccountId?: string;
  paymentAccountName?: string;
  paymentType?: PaymentType;
  vendorId?: string;
  vendorName?: string;
}

export async function updateExpense(input: UpdateExpenseInput): Promise<Expense> {
  const raw = asRecord(input, 'The expense');
  const id = uuid(raw.id, 'Expense');
  const lines = raw.lines !== undefined ? parseExpenseLines(raw.lines) : undefined;
  if (lines) checkedTotal(lines);
  const txnDate = raw.txnDate !== undefined ? isoDate(raw.txnDate, 'Expense date') : undefined;
  const paymentAccountId = raw.paymentAccountId !== undefined ? uuid(raw.paymentAccountId, 'Payment account') : undefined;
  const paymentType = raw.paymentType !== undefined ? oneOf(raw.paymentType, 'Payment type', PAYMENT_TYPES) : undefined;
  const vendorId = raw.vendorId !== undefined ? (optUuid(raw.vendorId, 'Vendor') ?? null) : undefined;

  const db = getDb();
  return db.transaction(async (tx) => {
    if (paymentAccountId) await requireAccount(tx, paymentAccountId, 'The payment account', PAYMENT_ACCOUNT_TYPES);
    if (lines) await requireAccounts(tx, lines.map((l) => l.accountId), 'An account on this expense', EXPENSE_ACCOUNT_TYPES);
    if (vendorId) await requireVendor(tx, vendorId);
    const patch: Partial<ExpenseRow> = { updatedAt: new Date() };
    if (txnDate !== undefined) patch.txnDate = txnDate;
    if (paymentAccountId !== undefined) patch.paymentAccountId = paymentAccountId;
    if (paymentType !== undefined) patch.paymentType = paymentType;
    if (vendorId !== undefined) patch.vendorId = vendorId;

    const [row] = await tx.update(expenses).set(patch).where(eq(expenses.id, id)).returning();
    if (!row) throw new NotFoundError('Expense not found.');
    if (lines) {
      await tx.delete(expenseLines).where(eq(expenseLines.expenseId, id));
      await tx.insert(expenseLines).values(toLineInsertRows(lines).map((line) => ({ ...line, expenseId: row.id })));
    }
    const [expense] = await attachDetails([row], tx);
    return expense;
  });
}

export async function deleteExpense(id: string): Promise<void> {
  uuid(id, 'Expense');
  const db = getDb();
  // expense_lines cascade-deletes via its ON DELETE CASCADE foreign key.
  const deleted = await db.delete(expenses).where(eq(expenses.id, id)).returning({ id: expenses.id });
  if (deleted.length === 0) throw new NotFoundError('Expense not found.');
}

// ---------------------------------------------------------------------------
// Category (account) suggestions — a simple, no-training-needed heuristic:
// whichever expense/COGS account has been used most often for past expenses
// from this vendor. Not a trained ML classifier or a third-party policy
// engine (Expensify/Ramp) — just a frequency count over this app's own data,
// recomputed on every request, so it improves automatically as more expenses
// get recorded. The form only ever suggests; applying it is a manual click.
// ---------------------------------------------------------------------------

export interface ExpenseAccountSuggestion {
  accountId: string;
  accountName: string;
  /** How many past expenses from this vendor used this account — shown so the suggestion is transparent, not a black box. */
  count: number;
}

export async function suggestExpenseAccountsForVendor(vendorId: string): Promise<ExpenseAccountSuggestion[]> {
  uuid(vendorId, 'Vendor');
  const db = getDb();
  const rows = await db.execute<{ account_id: string; account_name: string; uses: string }>(sql`
    SELECT el.account_id, a.name AS account_name, COUNT(*) AS uses
    FROM expense_lines el
    JOIN expenses e ON el.expense_id = e.id
    JOIN accounts a ON a.id = el.account_id
    WHERE e.vendor_id = ${vendorId}
    GROUP BY el.account_id, a.name
    ORDER BY uses DESC
    LIMIT 3
  `);
  return rows.map((row) => ({ accountId: row.account_id, accountName: row.account_name, count: Number(row.uses) }));
}
