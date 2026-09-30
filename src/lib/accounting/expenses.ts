import { getDb } from '@/db/client';
import { expenses, expenseLines, vendors, accounts } from '@/db/schema';
import { eq, inArray, desc, sql } from 'drizzle-orm';
import type { AccountExpenseLine, ExpenseLineInput } from '@/lib/quickbooks/expenseLineTypes';

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

async function nextDocNumber(): Promise<string> {
  const db = getDb();
  const [row] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(expenses);
  return `EXP-${String((row?.count ?? 0) + 1).padStart(4, '0')}`;
}

async function attachDetails(rows: ExpenseRow[]): Promise<Expense[]> {
  if (rows.length === 0) return [];
  const db = getDb();
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

export async function getExpense(id: string): Promise<Expense> {
  const db = getDb();
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!row) throw new Error('Expense not found.');
  const [expense] = await attachDetails([row]);
  return expense;
}

function validateLines(lines: ExpenseLineInput[]): void {
  const valid = lines.filter((l) => l.accountId && l.amount > 0);
  if (valid.length === 0) throw new Error('Add at least one expense line with an amount.');
}

function toLineInsertRows(lines: ExpenseLineInput[]) {
  return lines
    .filter((l) => l.accountId && l.amount > 0)
    .map((line, index) => ({
      accountId: line.accountId,
      description: line.description || null,
      amount: line.amount.toFixed(2),
      lineNumber: index + 1,
    }));
}

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
  validateLines(input.lines);
  const db = getDb();
  const docNumber = await nextDocNumber();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(expenses)
      .values({
        docNumber,
        txnDate: input.txnDate || new Date().toISOString().slice(0, 10),
        paymentAccountId: input.paymentAccountId,
        paymentType: input.paymentType,
        vendorId: input.vendorId || null,
      })
      .returning();
    await tx.insert(expenseLines).values(toLineInsertRows(input.lines).map((line) => ({ ...line, expenseId: row.id })));
    const [expense] = await attachDetails([row]);
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
  if (input.lines) validateLines(input.lines);
  const db = getDb();
  return db.transaction(async (tx) => {
    const patch: Partial<ExpenseRow> = { updatedAt: new Date() };
    if (input.txnDate !== undefined) patch.txnDate = input.txnDate;
    if (input.paymentAccountId !== undefined) patch.paymentAccountId = input.paymentAccountId;
    if (input.paymentType !== undefined) patch.paymentType = input.paymentType;
    if (input.vendorId !== undefined) patch.vendorId = input.vendorId || null;

    const [row] = await tx.update(expenses).set(patch).where(eq(expenses.id, input.id)).returning();
    if (!row) throw new Error('Expense not found.');

    if (input.lines) {
      await tx.delete(expenseLines).where(eq(expenseLines.expenseId, input.id));
      await tx.insert(expenseLines).values(toLineInsertRows(input.lines).map((line) => ({ ...line, expenseId: row.id })));
    }
    const [expense] = await attachDetails([row]);
    return expense;
  });
}

export async function deleteExpense(id: string): Promise<void> {
  const db = getDb();
  // expense_lines cascade-deletes via its ON DELETE CASCADE foreign key.
  const deleted = await db.delete(expenses).where(eq(expenses.id, id)).returning({ id: expenses.id });
  if (deleted.length === 0) throw new Error('Expense not found.');
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
