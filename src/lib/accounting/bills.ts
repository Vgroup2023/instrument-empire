import { getDb } from '@/db/client';
import type { Page } from '@/lib/paging';
import { bills, billLines, billPayments, vendors, accounts } from '@/db/schema';
import { and, eq, inArray, desc, sql } from 'drizzle-orm';
import { formatCurrency } from '@/lib/format';
import type { AccountExpenseLine, ExpenseLineInput } from '@/lib/quickbooks/expenseLineTypes';
import {
  ConflictError,
  MAX_MONEY,
  NotFoundError,
  ValidationError,
  asRecord,
  dateNotBefore,
  money,
  optIsoDate,
  round2 as roundMoney,
  todayIso,
  uuid,
} from '@/lib/validation';
import { requireAccounts, requireAccount, requireVendor, parseExpenseLines, BANK_ACCOUNT_TYPES, EXPENSE_ACCOUNT_TYPES, type Executor, type Tx } from '@/lib/accounting/entryRules';
import { nextDocNumber } from '@/lib/accounting/docNumbers';
import { assertNotFuture } from '@/lib/accounting/invoices';

export type { ExpenseLineInput };

// This is the standalone, database-backed Bills ledger — the app's own
// source of truth, not QuickBooks. See src/lib/quickbooks/bills.ts and
// billPayments.ts for the (optional, separate) QuickBooks-backed equivalent.

export interface Bill {
  Id: string;
  /** Kept for UI compatibility with the QuickBooks-backed pages — not a real optimistic-concurrency token here. */
  SyncToken: string;
  DocNumber?: string;
  TxnDate: string;
  DueDate?: string;
  VendorRef: { value: string; name?: string };
  Line: AccountExpenseLine[];
  TotalAmt: number;
  Balance: number;
  CurrencyRef?: { value: string };
  ExchangeRate?: number;
  Approved: boolean;
  ScheduledPaymentDate?: string;
}

type BillRow = typeof bills.$inferSelect;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Pass the open transaction as `ex` when reading back something just written inside it (see invoices.ts).
async function attachDetails(rows: BillRow[], ex: Executor = getDb()): Promise<Bill[]> {
  if (rows.length === 0) return [];
  const db = ex;
  const ids = rows.map((r) => r.id);
  const vendorIds = [...new Set(rows.map((r) => r.vendorId))];

  const [lineRows, paymentRows, vendorRows] = await Promise.all([
    db.select().from(billLines).where(inArray(billLines.billId, ids)),
    db.select({ billId: billPayments.billId, amount: billPayments.amount }).from(billPayments).where(inArray(billPayments.billId, ids)),
    db.select({ id: vendors.id, displayName: vendors.displayName }).from(vendors).where(inArray(vendors.id, vendorIds)),
  ]);

  const accountIds = [...new Set(lineRows.map((l) => l.accountId))];
  const accountRows = accountIds.length
    ? await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(inArray(accounts.id, accountIds))
    : [];
  const accountNameById = new Map(accountRows.map((a) => [a.id, a.name]));
  const vendorNameById = new Map(vendorRows.map((v) => [v.id, v.displayName]));

  const linesByBill = new Map<string, typeof lineRows>();
  for (const line of lineRows) {
    const list = linesByBill.get(line.billId) ?? [];
    list.push(line);
    linesByBill.set(line.billId, list);
  }
  const paidByBill = new Map<string, number>();
  for (const p of paymentRows) {
    paidByBill.set(p.billId, (paidByBill.get(p.billId) ?? 0) + Number(p.amount));
  }

  return rows.map((row) => {
    const lineRowsForBill = [...(linesByBill.get(row.id) ?? [])].sort((a, b) => a.lineNumber - b.lineNumber);
    const line: AccountExpenseLine[] = lineRowsForBill.map((l) => ({
      Id: l.id,
      DetailType: 'AccountBasedExpenseLineDetail',
      Amount: Number(l.amount),
      Description: l.description ?? undefined,
      AccountBasedExpenseLineDetail: { AccountRef: { value: l.accountId, name: accountNameById.get(l.accountId) } },
    }));
    const totalAmt = round2(line.reduce((sum, l) => sum + l.Amount, 0));
    const paid = paidByBill.get(row.id) ?? 0;
    return {
      Id: row.id,
      SyncToken: row.updatedAt.getTime().toString(),
      DocNumber: row.docNumber ?? undefined,
      TxnDate: row.txnDate,
      DueDate: row.dueDate ?? undefined,
      VendorRef: { value: row.vendorId, name: vendorNameById.get(row.vendorId) },
      Line: line,
      TotalAmt: totalAmt,
      Balance: round2(totalAmt - paid),
      CurrencyRef: { value: row.currencyCode },
      ExchangeRate: Number(row.exchangeRate),
      Approved: row.approved,
      ScheduledPaymentDate: row.scheduledPaymentDate ?? undefined,
    };
  });
}

export async function listBills(): Promise<Bill[]> {
  const db = getDb();
  const rows = await db.select().from(bills).orderBy(desc(bills.txnDate), desc(bills.createdAt));
  return attachDetails(rows);
}

/** The newest `limit` rows after skipping `offset`, plus the overall count, so a tab can open fast and load more on request. */
export async function listBillsPage(limit: number, offset: number): Promise<Page<Bill>> {
  const db = getDb();
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(bills).orderBy(desc(bills.txnDate), desc(bills.createdAt)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(bills),
  ]);
  return { items: await attachDetails(rows), total: n };
}

export async function getBill(id: string, ex: Executor = getDb()): Promise<Bill> {
  uuid(id, 'Bill');
  const [row] = await ex.select().from(bills).where(eq(bills.id, id));
  if (!row) throw new NotFoundError('Bill not found.');
  const [bill] = await attachDetails([row], ex);
  return bill;
}

function toLineInsertRows(lines: ExpenseLineInput[]) {
  return lines.map((line, index) => ({
    accountId: line.accountId,
    description: line.description || null,
    amount: line.amount.toFixed(2),
    lineNumber: index + 1,
  }));
}

function checkedTotal(lines: ExpenseLineInput[]): number {
  const total = roundMoney(lines.reduce((sum, l) => sum + l.amount, 0));
  if (total > MAX_MONEY) throw new ValidationError('The bill total is too large.');
  return total;
}

/** Takes the row for update, so nothing else can change, approve or pay this bill while we check and write. */
async function lockBill(tx: Tx, id: string): Promise<{ txnDate: string; approved: boolean }> {
  const rows = await tx.execute<{ txn_date: string; approved: boolean }>(sql`select txn_date, approved from bills where id = ${id} for update`);
  if (!rows[0]) throw new NotFoundError('Bill not found.');
  return { txnDate: String(rows[0].txn_date), approved: Boolean(rows[0].approved) };
}

export interface CreateBillInput {
  vendorId: string;
  vendorName?: string;
  txnDate?: string;
  dueDate?: string;
  lines: ExpenseLineInput[];
}

export async function createBill(input: CreateBillInput): Promise<Bill> {
  const raw = asRecord(input, 'The bill');
  const vendorId = uuid(raw.vendorId, 'Vendor');
  const lines = parseExpenseLines(raw.lines);
  checkedTotal(lines);
  const txnDate = optIsoDate(raw.txnDate, 'Bill date') ?? todayIso();
  const dueDate = optIsoDate(raw.dueDate, 'Due date');
  dateNotBefore(dueDate, txnDate, 'The due date', 'the bill date');

  const db = getDb();
  return db.transaction(async (tx) => {
    await requireVendor(tx, vendorId);
    await requireAccounts(tx, lines.map((l) => l.accountId), 'An account on this bill', EXPENSE_ACCOUNT_TYPES);
    const docNumber = await nextDocNumber(tx, 'bill', 'BILL');
    const [row] = await tx.insert(bills).values({ docNumber, vendorId, txnDate, dueDate: dueDate ?? null }).returning();
    await tx.insert(billLines).values(toLineInsertRows(lines).map((line) => ({ ...line, billId: row.id })));
    const [bill] = await attachDetails([row], tx);
    return bill;
  });
}

export interface UpdateBillInput {
  id: string;
  /** Accepted for call-site compatibility with the QuickBooks-backed version; unused here. */
  syncToken?: string;
  dueDate?: string;
  vendorId?: string;
  vendorName?: string;
  lines?: ExpenseLineInput[];
}

export async function updateBill(input: UpdateBillInput): Promise<Bill> {
  const raw = asRecord(input, 'The bill');
  const id = uuid(raw.id, 'Bill');
  const lines = raw.lines !== undefined ? parseExpenseLines(raw.lines) : undefined;
  const newTotal = lines ? checkedTotal(lines) : undefined;
  const dueDate = raw.dueDate !== undefined ? (optIsoDate(raw.dueDate, 'Due date') ?? null) : undefined;
  const vendorId = raw.vendorId !== undefined ? uuid(raw.vendorId, 'Vendor') : undefined;

  const db = getDb();
  return db.transaction(async (tx) => {
    const current = await lockBill(tx, id);
    if (dueDate) dateNotBefore(dueDate, current.txnDate, 'The due date', 'the bill date');
    if (vendorId) await requireVendor(tx, vendorId);
    const patch: Partial<BillRow> = { updatedAt: new Date() };
    if (dueDate !== undefined) patch.dueDate = dueDate;
    if (vendorId !== undefined) patch.vendorId = vendorId;

    if (lines) {
      await requireAccounts(tx, lines.map((l) => l.accountId), 'An account on this bill', EXPENSE_ACCOUNT_TYPES);
      const [paid] = await tx
        .select({ total: sql<string>`coalesce(sum(${billPayments.amount}), 0)` })
        .from(billPayments)
        .where(eq(billPayments.billId, id));
      const alreadyPaid = roundMoney(Number(paid?.total ?? 0));
      if (newTotal !== undefined && newTotal < alreadyPaid) {
        throw new ConflictError(
          `${formatCurrency(alreadyPaid)} has already been paid on this bill, which is more than the new total of ${formatCurrency(newTotal)}. Remove or adjust the payment first.`,
        );
      }
      // Changing what an approved bill says it costs means it must be approved again.
      if (current.approved) {
        patch.approved = false;
        patch.scheduledPaymentDate = null;
      }
    }

    const [row] = await tx.update(bills).set(patch).where(eq(bills.id, id)).returning();
    if (!row) throw new NotFoundError('Bill not found.');
    if (lines) {
      await tx.delete(billLines).where(eq(billLines.billId, id));
      await tx.insert(billLines).values(toLineInsertRows(lines).map((line) => ({ ...line, billId: row.id })));
    }
    const [bill] = await attachDetails([row], tx);
    return bill;
  });
}

export async function deleteBill(id: string): Promise<void> {
  uuid(id, 'Bill');
  const db = getDb();
  await db.transaction(async (tx) => {
    await lockBill(tx, id);
    const existingPayments = await tx.select({ id: billPayments.id }).from(billPayments).where(eq(billPayments.billId, id));
    if (existingPayments.length > 0) {
      throw new ConflictError('This bill has a payment recorded against it — remove the payment first.');
    }
    // bill_lines cascade-deletes via its ON DELETE CASCADE foreign key.
    await tx.delete(bills).where(eq(bills.id, id));
  });
}

export async function duplicateBill(id: string): Promise<Bill> {
  uuid(id, 'Bill');
  const db = getDb();
  return db.transaction(async (tx) => {
    const [original] = await tx.select().from(bills).where(eq(bills.id, id));
    if (!original) throw new NotFoundError('Bill not found.');
    const originalLines = await tx.select().from(billLines).where(eq(billLines.billId, id));
    const docNumber = await nextDocNumber(tx, 'bill', 'BILL');
    // A copy is a new bill: it starts unapproved and dated today.
    const [row] = await tx
      .insert(bills)
      .values({ docNumber, vendorId: original.vendorId, txnDate: todayIso(), dueDate: original.dueDate })
      .returning();
    if (originalLines.length > 0) {
      await tx.insert(billLines).values(
        originalLines
          .sort((a, b) => a.lineNumber - b.lineNumber)
          .map((line, index) => ({
            billId: row.id,
            accountId: line.accountId,
            description: line.description,
            amount: line.amount,
            lineNumber: index + 1,
          })),
      );
    }
    const [bill] = await attachDetails([row], tx);
    return bill;
  });
}

// ---------------------------------------------------------------------------
// AP approval queue — a bill must be approved (optionally with a planned pay
// date) before it can be paid. This never moves money on its own: approving
// just unlocks the existing Pay action, which still records a payment only
// when a person clicks it.
// ---------------------------------------------------------------------------

export interface ApproveBillInput {
  id: string;
  scheduledPaymentDate?: string;
}

export async function approveBill(input: ApproveBillInput): Promise<Bill> {
  const raw = asRecord(input, 'The approval');
  const id = uuid(raw.id, 'Bill');
  const scheduled = optIsoDate(raw.scheduledPaymentDate, 'Planned payment date');
  const db = getDb();
  return db.transaction(async (tx) => {
    await lockBill(tx, id);
    const [row] = await tx
      .update(bills)
      .set({ approved: true, scheduledPaymentDate: scheduled ?? null, updatedAt: new Date() })
      .where(eq(bills.id, id))
      .returning();
    if (!row) throw new NotFoundError('Bill not found.');
    const [bill] = await attachDetails([row], tx);
    return bill;
  });
}

export async function unapproveBill(id: string): Promise<Bill> {
  uuid(id, 'Bill');
  const db = getDb();
  return db.transaction(async (tx) => {
    await lockBill(tx, id);
    const [paid] = await tx.select({ id: billPayments.id }).from(billPayments).where(eq(billPayments.billId, id)).limit(1);
    if (paid) throw new ConflictError('This bill already has a payment recorded, so its approval can no longer be withdrawn.');
    const [row] = await tx
      .update(bills)
      .set({ approved: false, scheduledPaymentDate: null, updatedAt: new Date() })
      .where(eq(bills.id, id))
      .returning();
    if (!row) throw new NotFoundError('Bill not found.');
    const [bill] = await attachDetails([row], tx);
    return bill;
  });
}

// ---------------------------------------------------------------------------
// Bill payments — paying a bill from a real bank account.
// ---------------------------------------------------------------------------

export interface PayBillInput {
  billId: string;
  /** How much of the bill's remaining balance to pay — defaults to the full balance in the UI. */
  amount: number;
  paymentDate?: string;
  /** The Bank account the payment comes out of. */
  bankAccountId: string;
}

export async function payBill(input: PayBillInput): Promise<Bill> {
  const raw = asRecord(input, 'The payment');
  const billId = uuid(raw.billId, 'Bill');
  const amount = money(raw.amount, 'Payment amount');
  const paymentDate = optIsoDate(raw.paymentDate, 'Payment date') ?? todayIso();
  assertNotFuture(paymentDate, 'The payment date');
  const bankAccountId = uuid(raw.bankAccountId, 'Bank account');

  const db = getDb();
  return db.transaction(async (tx) => {
    // Lock the bill, then read its balance: simultaneous payments are handled one at a time, so the second
    // one sees the first and cannot take the bill below zero.
    const { approved } = await lockBill(tx, billId);
    if (!approved) throw new ConflictError('This bill must be approved before it can be paid.');
    await requireAccount(tx, bankAccountId, 'The bank account', BANK_ACCOUNT_TYPES);
    const [lineTotal] = await tx
      .select({ total: sql<string>`coalesce(sum(${billLines.amount}), 0)` })
      .from(billLines)
      .where(eq(billLines.billId, billId));
    const [paidTotal] = await tx
      .select({ total: sql<string>`coalesce(sum(${billPayments.amount}), 0)` })
      .from(billPayments)
      .where(eq(billPayments.billId, billId));
    const balance = roundMoney(Number(lineTotal?.total ?? 0) - Number(paidTotal?.total ?? 0));
    if (amount > balance + 0.004) {
      throw new ConflictError(`Payment can't exceed the balance due (${formatCurrency(balance)}).`);
    }
    const [bill] = await tx.select({ vendorId: bills.vendorId }).from(bills).where(eq(bills.id, billId));
    await tx.insert(billPayments).values({ billId, vendorId: bill.vendorId, amount: amount.toFixed(2), paymentDate, bankAccountId });
    return getBill(billId, tx);
  });
}
