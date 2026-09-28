import { getDb } from '@/db/client';
import { accounts, journalLines } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

// This is the standalone, database-backed Chart of Accounts — the app's own
// source of truth, not QuickBooks. See src/lib/quickbooks/chartOfAccounts.ts
// for the (optional, separate) QuickBooks-backed equivalent.

export type Classification = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

/** Which of QuickBooks' familiar top-level account types map to which classification, for balance-sign purposes. */
const CLASSIFICATION_BY_TYPE: Record<string, Classification> = {
  Bank: 'Asset',
  'Accounts Receivable': 'Asset',
  'Other Current Asset': 'Asset',
  'Fixed Asset': 'Asset',
  'Other Asset': 'Asset',
  'Accounts Payable': 'Liability',
  'Credit Card': 'Liability',
  'Long Term Liability': 'Liability',
  'Other Current Liability': 'Liability',
  Equity: 'Equity',
  Income: 'Revenue',
  'Cost of Goods Sold': 'Expense',
  Expense: 'Expense',
  'Other Expense': 'Expense',
};

const DEBIT_NORMAL: ReadonlySet<Classification> = new Set(['Asset', 'Expense']);

export interface Account {
  Id: string;
  /** Kept for UI compatibility with the QuickBooks-backed pages — not a real optimistic-concurrency token here. */
  SyncToken: string;
  Name: string;
  AccountType: string;
  AccountSubType?: string;
  AcctNum?: string;
  Description?: string;
  Active: boolean;
  Classification?: Classification;
  CurrentBalance?: number;
}

type AccountRow = typeof accounts.$inferSelect;

function toAccount(row: AccountRow, balance: number): Account {
  return {
    Id: row.id,
    SyncToken: row.updatedAt.getTime().toString(),
    Name: row.name,
    AccountType: row.accountType,
    AccountSubType: row.accountSubType ?? undefined,
    AcctNum: row.acctNum ?? undefined,
    Description: row.description ?? undefined,
    Active: row.active,
    Classification: CLASSIFICATION_BY_TYPE[row.accountType],
    CurrentBalance: balance,
  };
}

/**
 * Sums every journal-entry posting per account. As later phases add
 * Bills/Invoices/Expenses/Transfers to the ledger, this must be extended to
 * fold in their postings too, or account balances will drift from reality.
 */
async function getAccountBalances(): Promise<Map<string, number>> {
  const db = getDb();
  const [accountRows, lineRows] = await Promise.all([
    db.select({ id: accounts.id, accountType: accounts.accountType }).from(accounts),
    db
      .select({
        accountId: journalLines.accountId,
        postingType: journalLines.postingType,
        amount: journalLines.amount,
      })
      .from(journalLines),
  ]);

  const classificationById = new Map(accountRows.map((a) => [a.id, CLASSIFICATION_BY_TYPE[a.accountType]]));
  const balances = new Map<string, number>();
  for (const line of lineRows) {
    const classification = classificationById.get(line.accountId);
    const isDebitNormal = classification ? DEBIT_NORMAL.has(classification) : true;
    const amount = Number(line.amount);
    const signedDelta = line.postingType === 'Debit' ? amount : -amount;
    const delta = isDebitNormal ? signedDelta : -signedDelta;
    balances.set(line.accountId, (balances.get(line.accountId) ?? 0) + delta);
  }
  return balances;
}

/** Lists every account — active and inactive — same as QuickBooks' own Chart of Accounts view. */
export async function listAccounts(): Promise<Account[]> {
  const db = getDb();
  const [rows, balances] = await Promise.all([
    db.select().from(accounts).orderBy(accounts.accountType, accounts.name),
    getAccountBalances(),
  ]);
  return rows.map((row) => toAccount(row, balances.get(row.id) ?? 0));
}

export async function getAccount(id: string): Promise<Account> {
  const db = getDb();
  const [row] = await db.select().from(accounts).where(eq(accounts.id, id));
  if (!row) throw new Error('Account not found.');
  const balances = await getAccountBalances();
  return toAccount(row, balances.get(row.id) ?? 0);
}

export interface CreateAccountInput {
  name: string;
  accountType: string;
  accountSubType: string;
  acctNum?: string;
  description?: string;
}

export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const db = getDb();
  const [row] = await db
    .insert(accounts)
    .values({
      name: input.name,
      accountType: input.accountType,
      accountSubType: input.accountSubType,
      acctNum: input.acctNum || null,
      description: input.description || null,
    })
    .returning();
  return toAccount(row, 0);
}

export interface UpdateAccountInput {
  id: string;
  /** Accepted for call-site compatibility with the QuickBooks-backed version; unused here. */
  syncToken?: string;
  name?: string;
  acctNum?: string;
  description?: string;
  /** Deactivate/reactivate — QuickBooks has no hard-delete for accounts, and neither does this app. */
  active?: boolean;
}

export async function updateAccount(input: UpdateAccountInput): Promise<Account> {
  const db = getDb();
  const patch: Partial<AccountRow> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.acctNum !== undefined) patch.acctNum = input.acctNum || null;
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.active !== undefined) patch.active = input.active;

  const [row] = await db.update(accounts).set(patch).where(eq(accounts.id, input.id)).returning();
  if (!row) throw new Error('Account not found.');
  const balances = await getAccountBalances();
  return toAccount(row, balances.get(row.id) ?? 0);
}

export interface GlAccount {
  Id: string;
  Name: string;
}

async function listAccountsByType(types: string[]): Promise<GlAccount[]> {
  const db = getDb();
  const rows = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(and(inArray(accounts.accountType, types), eq(accounts.active, true)))
    .orderBy(accounts.name);
  return rows.map((r) => ({ Id: r.id, Name: r.name }));
}

/** Lists Expense / Cost of Goods Sold / Other Expense accounts, so "record a bill" can let the user pick which one a line posts to. */
export async function listExpenseAccounts(): Promise<GlAccount[]> {
  return listAccountsByType(['Expense', 'Cost of Goods Sold', 'Other Expense']);
}

/** Lists Bank accounts, so "pay bill" can let the user pick which account the payment actually comes out of. */
export async function listBankAccounts(): Promise<GlAccount[]> {
  return listAccountsByType(['Bank']);
}

/** Lists Bank and Credit Card accounts — the accounts real money can move out of or between. Used for expenses and transfers. */
export async function listPaymentAccounts(): Promise<GlAccount[]> {
  return listAccountsByType(['Bank', 'Credit Card']);
}
