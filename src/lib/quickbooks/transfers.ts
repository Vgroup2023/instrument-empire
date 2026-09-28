import { qboFetch, qboQuery } from '@/lib/quickbooks/client';

/** Maps to QuickBooks' Transfer entity — moving money between two of your own accounts. */
export interface Transfer {
  Id: string;
  SyncToken: string;
  TxnDate: string;
  Amount: number;
  FromAccountRef: { value: string; name?: string };
  ToAccountRef: { value: string; name?: string };
  PrivateNote?: string;
}

export async function listTransfers(): Promise<Transfer[]> {
  return qboQuery<Transfer>('SELECT * FROM Transfer ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS 200');
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

export async function createTransfer(input: CreateTransferInput): Promise<Transfer> {
  const data = await qboFetch<{ Transfer: Transfer }>('transfer', {
    method: 'POST',
    body: {
      FromAccountRef: { value: input.fromAccountId, name: input.fromAccountName },
      ToAccountRef: { value: input.toAccountId, name: input.toAccountName },
      Amount: input.amount,
      TxnDate: input.txnDate,
      PrivateNote: input.memo || undefined,
    },
  });
  return data.Transfer;
}

export interface UpdateTransferInput {
  id: string;
  syncToken: string;
  fromAccountId?: string;
  fromAccountName?: string;
  toAccountId?: string;
  toAccountName?: string;
  amount?: number;
  txnDate?: string;
  memo?: string;
}

export async function updateTransfer(input: UpdateTransferInput): Promise<Transfer> {
  const data = await qboFetch<{ Transfer: Transfer }>('transfer', {
    method: 'POST',
    body: {
      Id: input.id,
      SyncToken: input.syncToken,
      sparse: true,
      FromAccountRef: input.fromAccountId ? { value: input.fromAccountId, name: input.fromAccountName } : undefined,
      ToAccountRef: input.toAccountId ? { value: input.toAccountId, name: input.toAccountName } : undefined,
      Amount: input.amount,
      TxnDate: input.txnDate,
      PrivateNote: input.memo,
    },
  });
  return data.Transfer;
}

export async function deleteTransfer(id: string, syncToken: string): Promise<void> {
  await qboFetch('transfer', {
    method: 'POST',
    query: { operation: 'delete' },
    body: { Id: id, SyncToken: syncToken },
  });
}
