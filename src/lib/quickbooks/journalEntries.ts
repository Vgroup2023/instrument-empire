import { qboFetch, qboQuery } from '@/lib/quickbooks/client';
import { toQboJournalLines, balanceOf, type JournalLine, type JournalLineInput } from '@/lib/quickbooks/journalEntryTypes';

export interface JournalEntry {
  Id: string;
  SyncToken: string;
  DocNumber?: string;
  TxnDate: string;
  PrivateNote?: string;
  Line: JournalLine[];
}

export async function listJournalEntries(): Promise<JournalEntry[]> {
  return qboQuery<JournalEntry>('SELECT * FROM JournalEntry ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS 200');
}

export async function getJournalEntry(id: string): Promise<JournalEntry> {
  const data = await qboFetch<{ JournalEntry: JournalEntry }>(`journalentry/${id}`);
  return data.JournalEntry;
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
  const data = await qboFetch<{ JournalEntry: JournalEntry }>('journalentry', {
    method: 'POST',
    body: {
      TxnDate: input.txnDate,
      PrivateNote: input.memo || undefined,
      Line: toQboJournalLines(input.lines),
    },
  });
  return data.JournalEntry;
}

export interface UpdateJournalEntryInput {
  id: string;
  syncToken: string;
  txnDate?: string;
  memo?: string;
  lines?: JournalLineInput[];
}

export async function updateJournalEntry(input: UpdateJournalEntryInput): Promise<JournalEntry> {
  if (input.lines && !balanceOf(input.lines).isBalanced) {
    throw new Error('Total debits must equal total credits before this can be saved.');
  }
  const data = await qboFetch<{ JournalEntry: JournalEntry }>('journalentry', {
    method: 'POST',
    body: {
      Id: input.id,
      SyncToken: input.syncToken,
      sparse: true,
      TxnDate: input.txnDate,
      PrivateNote: input.memo,
      Line: input.lines ? toQboJournalLines(input.lines) : undefined,
    },
  });
  return data.JournalEntry;
}

export async function deleteJournalEntry(id: string, syncToken: string): Promise<void> {
  await qboFetch('journalentry', {
    method: 'POST',
    query: { operation: 'delete' },
    body: { Id: id, SyncToken: syncToken },
  });
}
