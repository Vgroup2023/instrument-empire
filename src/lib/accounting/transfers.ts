import { getDb } from '@/db/client';
import { transfers, accounts } from '@/db/schema';
import { eq, inArray, desc, sql } from 'drizzle-orm';
import type { Page } from '@/lib/paging';
import {
  MAX_MONEY,
  NotFoundError,
  ValidationError,
  asRecord,
  isoDate,
  money,
  optIsoDate,
  optText,
  todayIso,
  uuid,
} from '@/lib/validation';
import { requireAccounts, type Executor } from '@/lib/accounting/entryRules';

// This is the standalone, database-backed Transfers ledger — the app's own
// source of truth, not QuickBooks. See src/lib/quickbooks/transfers.ts for
// the (optional, separate) QuickBooks-backed equivalent.

/** Moving money between two of your own accounts. */
export interface Transfer {
  Id: string;
  /** Kept for UI compatibility with the QuickBooks-backed pages — not a real optimistic-concurrency token here. */
  SyncToken: string;
  TxnDate: string;
  Amount: number;
  FromAccountRef: { value: string; name?: string };
  ToAccountRef: { value: string; name?: string };
  PrivateNote?: string;
}

type TransferRow = typeof transfers.$inferSelect;

async function attachDetails(rows: TransferRow[], ex: Executor = getDb()): Promise<Transfer[]> {
  if (rows.length === 0) return [];
  const db = ex;
  const accountIds = [...new Set(rows.flatMap((r) => [r.fromAccountId, r.toAccountId]))];
  const accountRows = await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(inArray(accounts.id, accountIds));
  const nameById = new Map(accountRows.map((a) => [a.id, a.name]));

  return rows.map((row) => ({
    Id: row.id,
    SyncToken: row.createdAt.getTime().toString(),
    TxnDate: row.txnDate,
    Amount: Number(row.amount),
    FromAccountRef: { value: row.fromAccountId, name: nameById.get(row.fromAccountId) },
    ToAccountRef: { value: row.toAccountId, name: nameById.get(row.toAccountId) },
    PrivateNote: row.memo ?? undefined,
  }));
}

/** The newest `limit` transfers after skipping `offset`, plus the overall count, so the tab can open fast and load more on request. */
export async function listTransfersPage(limit: number, offset: number): Promise<Page<Transfer>> {
  const db = getDb();
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(transfers).orderBy(desc(transfers.txnDate), desc(transfers.createdAt)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(transfers),
  ]);
  return { items: await attachDetails(rows), total: n };
}

export async function listTransfers(): Promise<Transfer[]> {
  const db = getDb();
  const rows = await db.select().from(transfers).orderBy(desc(transfers.txnDate), desc(transfers.createdAt));
  return attachDetails(rows);
}

export interface CreateTransferInput {
  fromAccountId: string;
  fromAccountName?: string;
  toAccountId: string;
  toAccountName?: string;
  amount: number;
  txnDate?: string;
  memo?: string;
}

export async function createTransfer(input: CreateTransferInput): Promise<Transfer> {
  const raw = asRecord(input, 'The transfer');
  const fromAccountId = uuid(raw.fromAccountId, 'From account');
  const toAccountId = uuid(raw.toAccountId, 'To account');
  if (fromAccountId === toAccountId) throw new ValidationError('Choose two different accounts.');
  const amount = money(raw.amount, 'Amount');
  if (amount > MAX_MONEY) throw new ValidationError('The amount is too large.');
  const txnDate = optIsoDate(raw.txnDate, 'Transfer date') ?? todayIso();
  const memo = optText(raw.memo, 'Memo', 500);

  const db = getDb();
  return db.transaction(async (tx) => {
    await requireAccounts(tx, [fromAccountId], 'The from account');
    await requireAccounts(tx, [toAccountId], 'The to account');
    const [row] = await tx
      .insert(transfers)
      .values({ txnDate, fromAccountId, toAccountId, amount: amount.toFixed(2), memo: memo ?? null })
      .returning();
    const [transfer] = await attachDetails([row], tx);
    return transfer;
  });
}

export interface UpdateTransferInput {
  id: string;
  /** Accepted for call-site compatibility with the QuickBooks-backed version; unused here. */
  syncToken?: string;
  fromAccountId?: string;
  fromAccountName?: string;
  toAccountId?: string;
  toAccountName?: string;
  amount?: number;
  txnDate?: string;
  memo?: string;
}

export async function updateTransfer(input: UpdateTransferInput): Promise<Transfer> {
  const raw = asRecord(input, 'The transfer');
  const id = uuid(raw.id, 'Transfer');
  const db = getDb();
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(transfers).where(eq(transfers.id, id)).for('update');
    if (!existing) throw new NotFoundError('Transfer not found.');

    const fromAccountId = raw.fromAccountId !== undefined ? uuid(raw.fromAccountId, 'From account') : existing.fromAccountId;
    const toAccountId = raw.toAccountId !== undefined ? uuid(raw.toAccountId, 'To account') : existing.toAccountId;
    if (fromAccountId === toAccountId) throw new ValidationError('Choose two different accounts.');
    const amount = raw.amount !== undefined ? money(raw.amount, 'Amount') : Number(existing.amount);
    if (amount > MAX_MONEY) throw new ValidationError('The amount is too large.');
    if (fromAccountId !== existing.fromAccountId) await requireAccounts(tx, [fromAccountId], 'The from account');
    if (toAccountId !== existing.toAccountId) await requireAccounts(tx, [toAccountId], 'The to account');

    const patch: Partial<TransferRow> = { fromAccountId, toAccountId, amount: amount.toFixed(2) };
    if (raw.txnDate !== undefined) patch.txnDate = isoDate(raw.txnDate, 'Transfer date');
    if (raw.memo !== undefined) patch.memo = optText(raw.memo, 'Memo', 500) ?? null;

    const [row] = await tx.update(transfers).set(patch).where(eq(transfers.id, id)).returning();
    const [transfer] = await attachDetails([row], tx);
    return transfer;
  });
}

export async function deleteTransfer(id: string): Promise<void> {
  uuid(id, 'Transfer');
  const db = getDb();
  const deleted = await db.delete(transfers).where(eq(transfers.id, id)).returning({ id: transfers.id });
  if (deleted.length === 0) throw new NotFoundError('Transfer not found.');
}
