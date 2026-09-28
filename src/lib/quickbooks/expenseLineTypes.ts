// Shared by bills.ts and expenses.ts — both Bill and Purchase (expense) line
// items use the same AccountBasedExpenseLineDetail shape. Kept dependency-free
// (no qboFetch/session import) so client components can import the pure
// input type and line-conversion helper without pulling next/headers into
// the browser bundle — same reasoning as salesTypes.ts and
// journalEntryTypes.ts.

export interface ExpenseLineInput {
  accountId: string;
  accountName?: string;
  description?: string;
  amount: number;
}

export interface AccountExpenseLine {
  Id?: string;
  DetailType: 'AccountBasedExpenseLineDetail';
  Amount: number;
  Description?: string;
  AccountBasedExpenseLineDetail: {
    AccountRef: { value: string; name?: string };
  };
}

export function toQboExpenseLines(lines: ExpenseLineInput[]): AccountExpenseLine[] {
  return lines.map((line) => ({
    DetailType: 'AccountBasedExpenseLineDetail',
    Amount: line.amount,
    Description: line.description || undefined,
    AccountBasedExpenseLineDetail: {
      AccountRef: { value: line.accountId, name: line.accountName },
    },
  }));
}
