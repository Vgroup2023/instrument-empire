import { getDb } from '@/db/client';
import type { Page } from '@/lib/paging';
import { journalEntries, journalLines, accounts } from '@/db/schema';
import { eq, inArray, desc, sql } from 'drizzle-orm';
import {
  type JournalLine,
  type JournalLineInput,
  type PostingType,
} from '@/lib/quickbooks/journalEntryTypes';
import { recordAuditLog } from '@/lib/accounting/auditLog';
import {
  MAX_MONEY,
  NotFoundError,
  ValidationError,
  asRecord,
  isoDate,
  list,
  money,
  oneOf,
  optIsoDate,
  optText,
  todayIso,
  uuid,
} from '@/lib/validation';
import { requireAccounts, type Executor } from '@/lib/accounting/entryRules';

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

// Pass the open transaction as `ex` when reading back something just written inside it (see invoices.ts).
async function attachLines(entryRows: JournalEntryRow[], ex: Executor = getDb()): Promise<JournalEntry[]> {
  const db = ex;
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
  const rows = await db.select().from(journalEntries).orderBy(desc(journalEntries.txnDate), desc(journalEntries.createdAt));
  return attachLines(rows);
}

/** The newest `limit` rows after skipping `offset`, plus the overall count, so a tab can open fast and load more on request. */
export async function listJournalEntriesPage(limit: number, offset: number): Promise<Page<JournalEntry>> {
  const db = getDb();
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(journalEntries).orderBy(desc(journalEntries.txnDate), desc(journalEntries.createdAt)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(journalEntries),
  ]);
  return { items: await attachLines(rows), total: n };
}

export async function getJournalEntry(id: string, ex: Executor = getDb()): Promise<JournalEntry> {
  uuid(id, 'Journal entry');
  const [row] = await ex.select().from(journalEntries).where(eq(journalEntries.id, id));
  if (!row) throw new NotFoundError('Journal entry not found.');
  const [entry] = await attachLines([row], ex);
  return entry;
}

const POSTING_TYPES = ['Debit', 'Credit'] as const;

/**
 * Validates the lines and checks the books balance *as they will be stored*
 * (to the cent, using whole cents so floating-point error can't hide a
 * one-cent difference), with at least one debit and one credit.
 */
function parseJournalLines(raw: unknown): JournalLineInput[] {
  const rows = list(raw, 'Journal lines', { min: 2 });
  let debitCents = 0;
  let creditCents = 0;
  const out = rows.map((entry, index) => {
    const n = index + 1;
    const row = asRecord(entry, `Line ${n}`);
    const line: JournalLineInput = {
      accountId: uuid(row.accountId, `Line ${n} account`),
      postingType: oneOf(row.postingType, `Line ${n} Debit/Credit`, POSTING_TYPES),
      amount: money(row.amount, `Line ${n} amount`),
      description: optText(row.description, `Line ${n} description`, 500),
    };
    const cents = Math.round(line.amount * 100);
    if (line.postingType === 'Debit') debitCents += cents;
    else creditCents += cents;
    return line;
  });
  if (debitCents === 0 || creditCents === 0) {
    throw new ValidationError('A journal entry needs at least one debit line and one credit line.');
  }
  if (debitCents !== creditCents) {
    throw new ValidationError('Total debits must equal total credits before this can be saved.');
  }
  if (debitCents / 100 > MAX_MONEY) throw new ValidationError('The journal entry total is too large.');
  return out;
}

function lineInsertRows(entryId: string, lines: JournalLineInput[]) {
  return lines.map((line, index) => ({
    journalEntryId: entryId,
    accountId: line.accountId,
    postingType: line.postingType,
    amount: line.amount.toFixed(2),
    description: line.description || null,
    lineNumber: index,
  }));
}

export interface CreateJournalEntryInput {
  txnDate?: string;
  memo?: string;
  lines: JournalLineInput[];
}

export async function createJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry> {
  const raw = asRecord(input, 'The journal entry');
  const txnDate = optIsoDate(raw.txnDate, 'Journal date') ?? todayIso();
  const memo = optText(raw.memo, 'Memo', 500);
  const lines = parseJournalLines(raw.lines);

  const db = getDb();
  return db.transaction(async (tx) => {
    await requireAccounts(tx, lines.map((l) => l.accountId), 'An account on this journal entry');
    const [entryRow] = await tx
      .insert(journalEntries)
      .values({ txnDate, privateNote: memo ?? null })
      .returning();
    await tx.insert(journalLines).values(lineInsertRows(entryRow.id, lines));
    const [entry] = await attachLines([entryRow], tx);
    await recordAuditLog({ entityType: 'journal_entry', entityId: entry.Id, action: 'create', after: entry }, tx);
    return entry;
  });
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
  const raw = asRecord(input, 'The journal entry');
  const id = uuid(raw.id, 'Journal entry');
  const txnDate = raw.txnDate !== undefined ? isoDate(raw.txnDate, 'Journal date') : undefined;
  const memo = raw.memo !== undefined ? (optText(raw.memo, 'Memo', 500) ?? null) : undefined;
  const lines = raw.lines !== undefined ? parseJournalLines(raw.lines) : undefined;

  const db = getDb();
  return db.transaction(async (tx) => {
    // Lock the entry so two simultaneous edits can't interleave their line replacement.
    const locked = await tx.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.id, id)).for('update');
    if (locked.length === 0) throw new NotFoundError('Journal entry not found.');
    const before = await getJournalEntry(id, tx);
    if (lines) await requireAccounts(tx, lines.map((l) => l.accountId), 'An account on this journal entry');

    const patch: Partial<JournalEntryRow> = { updatedAt: new Date() };
    if (txnDate !== undefined) patch.txnDate = txnDate;
    if (memo !== undefined) patch.privateNote = memo;

    const [entryRow] = await tx.update(journalEntries).set(patch).where(eq(journalEntries.id, id)).returning();
    if (lines) {
      await tx.delete(journalLines).where(eq(journalLines.journalEntryId, id));
      await tx.insert(journalLines).values(lineInsertRows(entryRow.id, lines));
    }
    const [entry] = await attachLines([entryRow], tx);
    await recordAuditLog({ entityType: 'journal_entry', entityId: entry.Id, action: 'update', before, after: entry }, tx);
    return entry;
  });
}

export async function deleteJournalEntry(id: string): Promise<void> {
  uuid(id, 'Journal entry');
  const db = getDb();
  await db.transaction(async (tx) => {
    const locked = await tx.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.id, id)).for('update');
    if (locked.length === 0) throw new NotFoundError('Journal entry not found.');
    const before = await getJournalEntry(id, tx);
    // journal_lines cascade-deletes via its ON DELETE CASCADE foreign key.
    await tx.delete(journalEntries).where(eq(journalEntries.id, id));
    await recordAuditLog({ entityType: 'journal_entry', entityId: id, action: 'delete', before }, tx);
  });
}
