import { getDb } from '@/db/client';
import { bills, billLines, billPayments, vendors, accounts } from '@/db/schema';
import { eq, inArray, desc, sql } from 'drizzle-orm';
import { formatCurrency } from '@/lib/format';
import type { AccountExpenseLine, ExpenseLineInput } from '@/lib/quickbooks/expenseLineTypes';

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
}

type BillRow = typeof bills.$inferSelect;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function nextDocNumber(): Promise<string> {
  const db = getDb();
  const [row] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(bills);
  return `BILL-${String((row?.count ?? 0) + 1).padStart(4, '0')}`;
}

async function attachDetails(rows: BillRow[]): Promise<Bill[]> {
  if (rows.length === 0) return [];
  const db = getDb();
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
    };
  });
}

export async function listBills(): Promise<Bill[]> {
  const db = getDb();
  const rows = await db.select().from(bills).orderBy(desc(bills.txnDate), desc(bills.createdAt));
  return attachDetails(rows);
}

export async function getBill(id: string): Promise<Bill> {
  const db = getDb();
  const [row] = await db.select().from(bills).where(eq(bills.id, id));
  if (!row) throw new Error('Bill not found.');
  const [bill] = await attachDetails([row]);
  return bill;
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

export interface CreateBillInput {
  vendorId: string;
  vendorName?: string;
  txnDate?: string;
  dueDate?: string;
  lines: ExpenseLineInput[];
}

export async function createBill(input: CreateBillInput): Promise<Bill> {
  validateLines(input.lines);
  const db = getDb();
  const docNumber = await nextDocNumber();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(bills)
      .values({
        docNumber,
        vendorId: input.vendorId,
        txnDate: input.txnDate || new Date().toISOString().slice(0, 10),
        dueDate: input.dueDate || null,
      })
      .returning();
    await tx.insert(billLines).values(toLineInsertRows(input.lines).map((line) => ({ ...line, billId: row.id })));
    const [bill] = await attachDetails([row]);
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
  if (input.lines) validateLines(input.lines);
  const db = getDb();
  return db.transaction(async (tx) => {
    const patch: Partial<BillRow> = { updatedAt: new Date() };
    if (input.dueDate !== undefined) patch.dueDate = input.dueDate || null;
    if (input.vendorId !== undefined) patch.vendorId = input.vendorId;

    const [row] = await tx.update(bills).set(patch).where(eq(bills.id, input.id)).returning();
    if (!row) throw new Error('Bill not found.');

    if (input.lines) {
      await tx.delete(billLines).where(eq(billLines.billId, input.id));
      await tx.insert(billLines).values(toLineInsertRows(input.lines).map((line) => ({ ...line, billId: row.id })));
    }
    const [bill] = await attachDetails([row]);
    return bill;
  });
}

export async function deleteBill(id: string): Promise<void> {
  const db = getDb();
  const existingPayments = await db.select({ id: billPayments.id }).from(billPayments).where(eq(billPayments.billId, id));
  if (existingPayments.length > 0) {
    throw new Error('This bill has a payment recorded against it — remove the payment first.');
  }
  // bill_lines cascade-deletes via its ON DELETE CASCADE foreign key.
  const deleted = await db.delete(bills).where(eq(bills.id, id)).returning({ id: bills.id });
  if (deleted.length === 0) throw new Error('Bill not found.');
}

export async function duplicateBill(id: string): Promise<Bill> {
  const db = getDb();
  const [original] = await db.select().from(bills).where(eq(bills.id, id));
  if (!original) throw new Error('Bill not found.');
  const originalLines = await db.select().from(billLines).where(eq(billLines.billId, id));
  const docNumber = await nextDocNumber();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(bills)
      .values({
        docNumber,
        vendorId: original.vendorId,
        txnDate: new Date().toISOString().slice(0, 10),
        dueDate: original.dueDate,
      })
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
    const [bill] = await attachDetails([row]);
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
  if (input.amount <= 0) throw new Error('Payment amount must be greater than zero.');
  const bill = await getBill(input.billId);
  if (input.amount > bill.Balance + 0.005) {
    throw new Error(`Payment can't exceed the balance due (${formatCurrency(bill.Balance)}).`);
  }
  const db = getDb();
  await db.insert(billPayments).values({
    billId: input.billId,
    vendorId: bill.VendorRef.value,
    amount: input.amount.toFixed(2),
    paymentDate: input.paymentDate || new Date().toISOString().slice(0, 10),
    bankAccountId: input.bankAccountId,
  });
  return getBill(input.billId);
}
