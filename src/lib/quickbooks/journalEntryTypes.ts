// Split out from journalEntries.ts so client components (the line editor,
// the form dialog) can import the pure line-shape types and balance-check
// helper without pulling in qboFetch's server-only next/headers chain into
// the client bundle — same reasoning as salesTypes.ts for invoices/estimates.

export type PostingType = 'Debit' | 'Credit';

export interface JournalLine {
  Id?: string;
  Description?: string;
  Amount: number;
  DetailType: 'JournalEntryLineDetail';
  JournalEntryLineDetail: {
    PostingType: PostingType;
    AccountRef: { value: string; name?: string };
  };
}

export interface JournalLineInput {
  accountId: string;
  accountName?: string;
  postingType: PostingType;
  amount: number;
  description?: string;
}

export function toQboJournalLines(lines: JournalLineInput[]): JournalLine[] {
  return lines.map((line) => ({
    Amount: line.amount,
    Description: line.description || undefined,
    DetailType: 'JournalEntryLineDetail',
    JournalEntryLineDetail: {
      PostingType: line.postingType,
      AccountRef: { value: line.accountId, name: line.accountName },
    },
  }));
}

/**
 * A journal entry only balances the books if total debits equal total
 * credits — QuickBooks itself enforces this, but checking here first gives
 * a clear error instead of a raw API rejection.
 */
export function balanceOf(lines: JournalLineInput[]): { debits: number; credits: number; isBalanced: boolean } {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const debits = round2(
    lines.filter((l) => l.postingType === 'Debit').reduce((sum, l) => sum + l.amount, 0),
  );
  const credits = round2(
    lines.filter((l) => l.postingType === 'Credit').reduce((sum, l) => sum + l.amount, 0),
  );
  return { debits, credits, isBalanced: debits === credits && debits > 0 };
}
