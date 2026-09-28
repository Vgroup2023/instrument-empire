import { qboFetch, qboQuery } from '@/lib/quickbooks/client';
import { toQboLines, stripForDuplicate, type LineItemInput, type SalesDocLine } from '@/lib/quickbooks/salesTypes';

export interface Invoice {
  Id: string;
  SyncToken: string;
  DocNumber?: string;
  TxnDate: string;
  DueDate?: string;
  CustomerRef: { value: string; name?: string };
  BillEmail?: { Address: string };
  Line: SalesDocLine[];
  TotalAmt: number;
  Balance: number;
  EmailStatus?: string;
  InvoiceLink?: string;
}

export async function listInvoices(): Promise<Invoice[]> {
  return qboQuery<Invoice>('SELECT * FROM Invoice ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS 200');
}

export async function getInvoice(id: string): Promise<Invoice> {
  const data = await qboFetch<{ Invoice: Invoice }>(`invoice/${id}`);
  return data.Invoice;
}

export interface CreateInvoiceInput {
  customerId: string;
  customerName?: string;
  email?: string;
  txnDate?: string;
  dueDate?: string;
  lines: LineItemInput[];
}

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  const data = await qboFetch<{ Invoice: Invoice }>('invoice', {
    method: 'POST',
    body: {
      CustomerRef: { value: input.customerId, name: input.customerName },
      TxnDate: input.txnDate,
      DueDate: input.dueDate,
      BillEmail: input.email ? { Address: input.email } : undefined,
      Line: toQboLines(input.lines),
    },
  });
  return data.Invoice;
}

export interface UpdateInvoiceInput {
  id: string;
  syncToken: string;
  dueDate?: string;
  email?: string;
  lines?: LineItemInput[];
  customerId?: string;
  customerName?: string;
}

export async function updateInvoice(input: UpdateInvoiceInput): Promise<Invoice> {
  const data = await qboFetch<{ Invoice: Invoice }>('invoice', {
    method: 'POST',
    body: {
      Id: input.id,
      SyncToken: input.syncToken,
      sparse: true,
      DueDate: input.dueDate,
      BillEmail: input.email ? { Address: input.email } : undefined,
      CustomerRef: input.customerId ? { value: input.customerId, name: input.customerName } : undefined,
      Line: input.lines ? toQboLines(input.lines) : undefined,
    },
  });
  return data.Invoice;
}

/** Emails the invoice to the given address (or the customer's address on file if omitted). */
export async function sendInvoice(id: string, email?: string): Promise<Invoice> {
  const data = await qboFetch<{ Invoice: Invoice }>(`invoice/${id}/send`, {
    method: 'POST',
    query: email ? { sendTo: email } : {},
  });
  return data.Invoice;
}

/**
 * There's no separate "reminder" endpoint in the public Accounting API —
 * a reminder is just re-sending the same invoice email to prompt payment.
 */
export async function sendInvoiceReminder(id: string, email?: string): Promise<Invoice> {
  return sendInvoice(id, email);
}

export async function duplicateInvoice(id: string): Promise<Invoice> {
  // Fetched as a loosely-typed record (not just the narrow Invoice shape
  // above) so fields this app doesn't otherwise model — sales tax,
  // discounts, memos, terms, class, currency — still get preserved.
  const original = (await qboFetch<{ Invoice: Record<string, unknown> }>(`invoice/${id}`)).Invoice;
  const body = stripForDuplicate(original, { TxnDate: new Date().toISOString().slice(0, 10) });
  const data = await qboFetch<{ Invoice: Invoice }>('invoice', { method: 'POST', body });
  return data.Invoice;
}

export async function voidInvoice(id: string, syncToken: string): Promise<Invoice> {
  const data = await qboFetch<{ Invoice: Invoice }>('invoice', {
    method: 'POST',
    query: { operation: 'void' },
    body: { Id: id, SyncToken: syncToken },
  });
  return data.Invoice;
}
