import { getDb } from '@/db/client';
import { transfers, accounts } from '@/db/schema';
import { eq, inArray, desc } from 'drizzle-orm';

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

async function attachDetails(rows: TransferRow[]): Promise<Transfer[]> {
  if (rows.length === 0) return [];
  const db = getDb();
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

function validate(input: { fromAccountId: string; toAccountId: string; amount: number }): void {
  if (input.fromAccountId === input.toAccountId) throw new Error('Choose two different accounts.');
  if (!input.amount || input.amount <= 0) throw new Error('Enter an amount greater than zero.');
}

export async function createTransfer(input: CreateTransferInput): Promise<Transfer> {
  validate(input);
  const db = getDb();
  const [row] = await db
    .insert(transfers)
    .values({
      txnDate: input.txnDate || new Date().toISOString().slice(0, 10),
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: input.amount.toFixed(2),
      memo: input.memo || null,
    })
    .returning();
  const [transfer] = await attachDetails([row]);
  return transfer;
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
  const db = getDb();
  const [existing] = await db.select().from(transfers).where(eq(transfers.id, input.id));
  if (!existing) throw new Error('Transfer not found.');

  const fromAccountId = input.fromAccountId ?? existing.fromAccountId;
  const toAccountId = input.toAccountId ?? existing.toAccountId;
  const amount = input.amount ?? Number(existing.amount);
  validate({ fromAccountId, toAccountId, amount });

  const patch: Partial<TransferRow> = { fromAccountId, toAccountId, amount: amount.toFixed(2) };
  if (input.txnDate !== undefined) patch.txnDate = input.txnDate;
  if (input.memo !== undefined) patch.memo = input.memo || null;

  const [row] = await db.update(transfers).set(patch).where(eq(transfers.id, input.id)).returning();
  const [transfer] = await attachDetails([row]);
  return transfer;
}

export async function deleteTransfer(id: string): Promise<void> {
  const db = getDb();
  const deleted = await db.delete(transfers).where(eq(transfers.id, id)).returning({ id: transfers.id });
  if (deleted.length === 0) throw new Error('Transfer not found.');
}
