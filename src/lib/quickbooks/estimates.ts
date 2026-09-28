import { qboFetch, qboQuery } from '@/lib/quickbooks/client';
import { toQboLines, stripForDuplicate, type LineItemInput, type SalesDocLine } from '@/lib/quickbooks/salesTypes';

export interface Estimate {
  Id: string;
  SyncToken: string;
  DocNumber?: string;
  TxnDate: string;
  ExpirationDate?: string;
  CustomerRef: { value: string; name?: string };
  BillEmail?: { Address: string };
  Line: SalesDocLine[];
  TotalAmt: number;
  TxnStatus?: string;
  EmailStatus?: string;
}

export async function listEstimates(): Promise<Estimate[]> {
  return qboQuery<Estimate>('SELECT * FROM Estimate ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS 200');
}

export async function getEstimate(id: string): Promise<Estimate> {
  const data = await qboFetch<{ Estimate: Estimate }>(`estimate/${id}`);
  return data.Estimate;
}

export interface CreateEstimateInput {
  customerId: string;
  customerName?: string;
  email?: string;
  txnDate?: string;
  expirationDate?: string;
  lines: LineItemInput[];
}

export async function createEstimate(input: CreateEstimateInput): Promise<Estimate> {
  const data = await qboFetch<{ Estimate: Estimate }>('estimate', {
    method: 'POST',
    body: {
      CustomerRef: { value: input.customerId, name: input.customerName },
      TxnDate: input.txnDate,
      ExpirationDate: input.expirationDate,
      BillEmail: input.email ? { Address: input.email } : undefined,
      Line: toQboLines(input.lines),
    },
  });
  return data.Estimate;
}

export interface UpdateEstimateInput {
  id: string;
  syncToken: string;
  expirationDate?: string;
  email?: string;
  lines?: LineItemInput[];
}

export async function updateEstimate(input: UpdateEstimateInput): Promise<Estimate> {
  const data = await qboFetch<{ Estimate: Estimate }>('estimate', {
    method: 'POST',
    body: {
      Id: input.id,
      SyncToken: input.syncToken,
      sparse: true,
      ExpirationDate: input.expirationDate,
      BillEmail: input.email ? { Address: input.email } : undefined,
      Line: input.lines ? toQboLines(input.lines) : undefined,
    },
  });
  return data.Estimate;
}

export async function sendEstimate(id: string, email?: string): Promise<Estimate> {
  const data = await qboFetch<{ Estimate: Estimate }>(`estimate/${id}/send`, {
    method: 'POST',
    query: email ? { sendTo: email } : {},
  });
  return data.Estimate;
}

export async function duplicateEstimate(id: string): Promise<Estimate> {
  // Loosely-typed fetch (not just the narrow Estimate shape above) so
  // fields this app doesn't otherwise model — tax, discounts, memos,
  // terms, class, currency — still get preserved on the duplicate.
  const original = (await qboFetch<{ Estimate: Record<string, unknown> }>(`estimate/${id}`)).Estimate;
  const body = stripForDuplicate(original, { TxnDate: new Date().toISOString().slice(0, 10) });
  const data = await qboFetch<{ Estimate: Estimate }>('estimate', { method: 'POST', body });
  return data.Estimate;
}
