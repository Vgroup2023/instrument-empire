import { qboFetch, qboQuery } from '@/lib/quickbooks/client';

export interface Account {
  Id: string;
  SyncToken: string;
  Name: string;
  AccountType: string;
  AccountSubType?: string;
  AcctNum?: string;
  Description?: string;
  Active: boolean;
  Classification?: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  CurrentBalance?: number;
}

/** Lists every account — active and inactive — same as QuickBooks' own Chart of Accounts view. */
export async function listAccounts(): Promise<Account[]> {
  return qboQuery<Account>('SELECT * FROM Account ORDERBY AccountType, Name MAXRESULTS 1000');
}

export async function getAccount(id: string): Promise<Account> {
  const data = await qboFetch<{ Account: Account }>(`account/${id}`);
  return data.Account;
}

export interface CreateAccountInput {
  name: string;
  accountType: string;
  accountSubType: string;
  acctNum?: string;
  description?: string;
}

export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const data = await qboFetch<{ Account: Account }>('account', {
    method: 'POST',
    body: {
      Name: input.name,
      AccountType: input.accountType,
      AccountSubType: input.accountSubType,
      AcctNum: input.acctNum || undefined,
      Description: input.description || undefined,
    },
  });
  return data.Account;
}

export interface UpdateAccountInput {
  id: string;
  syncToken: string;
  name?: string;
  acctNum?: string;
  description?: string;
  /** Deactivate/reactivate — QuickBooks has no hard-delete for accounts. */
  active?: boolean;
}

export async function updateAccount(input: UpdateAccountInput): Promise<Account> {
  const data = await qboFetch<{ Account: Account }>('account', {
    method: 'POST',
    body: {
      Id: input.id,
      SyncToken: input.syncToken,
      sparse: true,
      Name: input.name,
      AcctNum: input.acctNum,
      Description: input.description,
      Active: input.active,
    },
  });
  return data.Account;
}
