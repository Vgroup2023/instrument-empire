import { getDb } from '@/db/client';
import { journalEntries, journalLines, accounts } from '@/db/schema';
import { eq, inArray, desc } from 'drizzle-orm';
import {
  balanceOf,
  type JournalLine,
  type JournalLineInput,
  type PostingType,
} from '@/lib/quickbooks/journalEntryTypes';
import { recordAuditLog } from '@/lib/accounting/auditLog';

// This is the standalone, database-backed Journal Entries ledger — the app's
// own source of truth, not QuickBooks. See src/lib/quickbooks/journalEntries.ts
// for the (optional, separate) QuickBooks-backed equivalent. The line-shape
// types and the debit/credit balance check are shared with that module since
// they're pure, provider-agnostic logic.

export interface JournalEntry {
  Id: string;
  /** Kept for UI compatibility with the QuickBooks-backed pages — not a real optimistic-concurrency token here. */
  SyncToken: string;
  DocNumber?: string;
  TxnDate: string;
  PrivateNote?: string;
  Line: JournalLine[];
}

type JournalEntryRow = typeof journalEntries.$inferSelect;

async function attachLines(entryRows: JournalEntryRow[]): Promise<JournalEntry[]> {
  const db = getDb();
  const entryIds = entryRows.map((e) => e.id);
  const lineRows = entryIds.length
    ? await db
        .select({
          id: journalLines.id,
          journalEntryId: journalLines.journalEntryId,
          accountId: journalLines.accountId,
          accountName: accounts.name,
          postingType: journalLines.postingType,
          amount: journalLines.amount,
          description: journalLines.description,
          lineNumber: journalLines.lineNumber,
        })
        .from(journalLines)
        .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
        .where(inArray(journalLines.journalEntryId, entryIds))
    : [];

  const linesByEntry = new Map<string, JournalLine[]>();
  for (const row of [...lineRows].sort((a, b) => a.lineNumber - b.lineNumber)) {
    const line: JournalLine = {
      Id: row.id,
      Amount: Number(row.amount),
      Description: row.description ?? undefined,
      DetailType: 'JournalEntryLineDetail',
      JournalEntryLineDetail: {
        PostingType: row.postingType as PostingType,
        AccountRef: { value: row.accountId, name: row.accountName },
      },
    };
    const list = linesByEntry.get(row.journalEntryId) ?? [];
    list.push(line);
    linesByEntry.set(row.journalEntryId, list);
  }

  return entryRows.map((e) => ({
    Id: e.id,
    SyncToken: e.updatedAt.getTime().toString(),
    TxnDate: e.txnDate,
    PrivateNote: e.privateNote ?? undefined,
    Line: linesByEntry.get(e.id) ?? [],
  }));
}

export async function listJournalEntries(): Promise<JournalEntry[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(journalEntries)
    .orderBy(desc(journalEntries.txnDate), desc(journalEntries.createdAt));
  return attachLines(rows);
}

export async function getJournalEntry(id: string): Promise<JournalEntry> {
  const db = getDb();
  const [row] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
  if (!row) throw new Error('Journal entry not found.');
  const [entry] = await attachLines([row]);
  return entry;
}

export interface CreateJournalEntryInput {
  txnDate?: string;
  memo?: string;
  lines: JournalLineInput[];
}

export async function createJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry> {
  if (!balanceOf(input.lines).isBalanced) {
    throw new Error('Total debits must equal total credits before this can be saved.');
  }
  const db = getDb();
  const entry = await db.transaction(async (tx) => {
    const [entryRow] = await tx
      .insert(journalEntries)
      .values({
        txnDate: input.txnDate ?? new Date().toISOString().slice(0, 10),
        privateNote: input.memo || null,
      })
      .returning();
    await tx.insert(journalLines).values(
      input.lines.map((line, index) => ({
        journalEntryId: entryRow.id,
        accountId: line.accountId,
        postingType: line.postingType,
        amount: line.amount.toFixed(2),
        description: line.description || null,
        lineNumber: index,
      })),
    );
    const [entry] = await attachLines([entryRow]);
    return entry;
  });
  await recordAuditLog({ entityType: 'journal_entry', entityId: entry.Id, action: 'create', after: entry });
  return entry;
}

export interface UpdateJournalEntryInput {
  id: string;
  /** Accepted for call-site compatibility with the QuickBooks-backed version; unused here. */
  syncToken?: string;
  txnDate?: string;
  memo?: string;
  lines?: JournalLineInput[];
}

export async function updateJournalEntry(input: UpdateJournalEntryInput): Promise<JournalEntry> {
  if (input.lines && !balanceOf(input.lines).isBalanced) {
    throw new Error('Total debits must equal total credits before this can be saved.');
  }
  const before = await getJournalEntry(input.id);
  const db = getDb();
  const entry = await db.transaction(async (tx) => {
    const patch: Partial<JournalEntryRow> = { updatedAt: new Date() };
    if (input.txnDate !== undefined) patch.txnDate = input.txnDate;
    if (input.memo !== undefined) patch.privateNote = input.memo || null;

    const [entryRow] = await tx
      .update(journalEntries)
      .set(patch)
      .where(eq(journalEntries.id, input.id))
      .returning();
    if (!entryRow) throw new Error('Journal entry not found.');

    if (input.lines) {
      await tx.delete(journalLines).where(eq(journalLines.journalEntryId, input.id));
      await tx.insert(journalLines).values(
        input.lines.map((line, index) => ({
          journalEntryId: entryRow.id,
          accountId: line.accountId,
          postingType: line.postingType,
          amount: line.amount.toFixed(2),
          description: line.description || null,
          lineNumber: index,
        })),
      );
    }
    const [entry] = await attachLines([entryRow]);
    return entry;
  });
  await recordAuditLog({ entityType: 'journal_entry', entityId: entry.Id, action: 'update', before, after: entry });
  return entry;
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const before = await getJournalEntry(id).catch(() => null);
  const db = getDb();
  // journal_lines cascade-deletes via its ON DELETE CASCADE foreign key.
  const deleted = await db.delete(journalEntries).where(eq(journalEntries.id, id)).returning({ id: journalEntries.id });
  if (deleted.length === 0) throw new Error('Journal entry not found.');
  if (before) await recordAuditLog({ entityType: 'journal_entry', entityId: id, action: 'delete', before });
}
