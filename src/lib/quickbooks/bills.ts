import { qboFetch, qboQuery } from '@/lib/quickbooks/client';
import { stripForDuplicate } from '@/lib/quickbooks/salesTypes';
import { toQboExpenseLines, type AccountExpenseLine, type ExpenseLineInput } from '@/lib/quickbooks/expenseLineTypes';

export type { ExpenseLineInput };

export interface Bill {
  Id: string;
  SyncToken: string;
  DocNumber?: string;
  TxnDate: string;
  DueDate?: string;
  VendorRef: { value: string; name?: string };
  Line: AccountExpenseLine[];
  TotalAmt: number;
  Balance: number;
  /** Only present when this vendor bills in a currency other than the company's home currency. */
  CurrencyRef?: { value: string; name?: string };
  ExchangeRate?: number;
}

export async function listBills(): Promise<Bill[]> {
  return qboQuery<Bill>('SELECT * FROM Bill ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS 200');
}

export async function getBill(id: string): Promise<Bill> {
  const data = await qboFetch<{ Bill: Bill }>(`bill/${id}`);
  return data.Bill;
}

export interface CreateBillInput {
  vendorId: string;
  vendorName?: string;
  txnDate?: string;
  dueDate?: string;
  lines: ExpenseLineInput[];
  /** Required when the vendor bills in a non-home currency; QuickBooks rejects the create otherwise. */
  currencyCode?: string;
  exchangeRate?: number;
}

export async function createBill(input: CreateBillInput): Promise<Bill> {
  const data = await qboFetch<{ Bill: Bill }>('bill', {
    method: 'POST',
    body: {
      VendorRef: { value: input.vendorId, name: input.vendorName },
      TxnDate: input.txnDate,
      DueDate: input.dueDate,
      Line: toQboExpenseLines(input.lines),
      CurrencyRef: input.currencyCode ? { value: input.currencyCode } : undefined,
      ExchangeRate: input.exchangeRate,
    },
  });
  return data.Bill;
}

export interface UpdateBillInput {
  id: string;
  syncToken: string;
  dueDate?: string;
  vendorId?: string;
  vendorName?: string;
  lines?: ExpenseLineInput[];
}

export async function updateBill(input: UpdateBillInput): Promise<Bill> {
  const data = await qboFetch<{ Bill: Bill }>('bill', {
    method: 'POST',
    body: {
      Id: input.id,
      SyncToken: input.syncToken,
      sparse: true,
      DueDate: input.dueDate,
      VendorRef: input.vendorId ? { value: input.vendorId, name: input.vendorName } : undefined,
      Line: input.lines ? toQboExpenseLines(input.lines) : undefined,
    },
  });
  return data.Bill;
}

export async function duplicateBill(id: string): Promise<Bill> {
  // Fetched loosely-typed (not just the narrow Bill shape above) so fields
  // this app doesn't otherwise model — class, currency, memo — still carry
  // over, same reasoning as invoice/estimate duplication.
  const original = (await qboFetch<{ Bill: Record<string, unknown> }>(`bill/${id}`)).Bill;
  const body = stripForDuplicate(original, { TxnDate: new Date().toISOString().slice(0, 10) });
  const data = await qboFetch<{ Bill: Bill }>('bill', { method: 'POST', body });
  return data.Bill;
}
