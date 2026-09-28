import { qboFetch, qboQuery } from '@/lib/quickbooks/client';
import { toQboExpenseLines, type AccountExpenseLine, type ExpenseLineInput } from '@/lib/quickbooks/expenseLineTypes';

export type { ExpenseLineInput };

export type PaymentType = 'Cash' | 'Check' | 'CreditCard';

/**
 * Maps to QuickBooks' Purchase entity — an expense paid immediately (cash,
 * debit, credit card, check) straight out of a bank/credit card account.
 * This is distinct from a Bill, which is money owed to be paid later.
 */
export interface Expense {
  Id: string;
  SyncToken: string;
  DocNumber?: string;
  TxnDate: string;
  PaymentType: PaymentType;
  AccountRef: { value: string; name?: string };
  EntityRef?: { value: string; name?: string; type?: string };
  Line: AccountExpenseLine[];
  TotalAmt: number;
}

export async function listExpenses(): Promise<Expense[]> {
  return qboQuery<Expense>('SELECT * FROM Purchase ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS 200');
}

export async function getExpense(id: string): Promise<Expense> {
  const data = await qboFetch<{ Purchase: Expense }>(`purchase/${id}`);
  return data.Purchase;
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
  const data = await qboFetch<{ Purchase: Expense }>('purchase', {
    method: 'POST',
    body: {
      AccountRef: { value: input.paymentAccountId, name: input.paymentAccountName },
      PaymentType: input.paymentType,
      EntityRef: input.vendorId ? { value: input.vendorId, name: input.vendorName, type: 'Vendor' } : undefined,
      TxnDate: input.txnDate,
      Line: toQboExpenseLines(input.lines),
    },
  });
  return data.Purchase;
}

export interface UpdateExpenseInput {
  id: string;
  syncToken: string;
  txnDate?: string;
  lines?: ExpenseLineInput[];
  paymentAccountId?: string;
  paymentAccountName?: string;
  paymentType?: PaymentType;
  vendorId?: string;
  vendorName?: string;
}

export async function updateExpense(input: UpdateExpenseInput): Promise<Expense> {
  const data = await qboFetch<{ Purchase: Expense }>('purchase', {
    method: 'POST',
    body: {
      Id: input.id,
      SyncToken: input.syncToken,
      sparse: true,
      TxnDate: input.txnDate,
      Line: input.lines ? toQboExpenseLines(input.lines) : undefined,
      AccountRef: input.paymentAccountId
        ? { value: input.paymentAccountId, name: input.paymentAccountName }
        : undefined,
      PaymentType: input.paymentType,
      EntityRef: input.vendorId ? { value: input.vendorId, name: input.vendorName, type: 'Vendor' } : undefined,
    },
  });
  return data.Purchase;
}

export async function deleteExpense(id: string, syncToken: string): Promise<void> {
  await qboFetch('purchase', {
    method: 'POST',
    query: { operation: 'delete' },
    body: { Id: id, SyncToken: syncToken },
  });
}
