import { getDb } from '@/db/client';
import { accounts } from '@/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DateRange } from '@/lib/dateRanges';
import { recordAuditLog } from '@/lib/accounting/auditLog';

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

/** A single debit or credit posting to a GL account, collected from every transaction type below. */
interface Posting {
  accountId: string;
  postingType: 'Debit' | 'Credit';
  amount: number;
}

/**
 * Folds every transaction type into GL postings: journal entries directly,
 * plus Invoices (credit to the product's income account), Bills (debit to
 * the line's account), Expenses (debit to the line's account, credit to the
 * payment account), invoice/bill Payments (debit/credit the bank account),
 * and Transfers (credit the source, debit the destination). Accounts
 * Receivable/Payable are deliberately not posted here — see reports.ts,
 * which computes those directly from invoice/bill balances instead.
 *
 * When `range` is given, only postings dated within it are counted, so the
 * result reflects account activity for that period rather than an
 * all-time balance.
 */
async function collectPostings(range?: DateRange): Promise<Posting[]> {
  const db = getDb();
  const start = range?.startDate ?? null;
  const end = range?.endDate ?? null;

  // One round trip instead of seven: each branch below already projects
  // (account_id, posting_type, amount) directly, matching Posting exactly,
  // so no per-row post-processing is needed either. Combining these was a
  // deliberate fix for request latency — issuing this fan-out as separate
  // sequential queries per report (and this gets called 2-3x per Insights
  // page load) was slow enough over the network to trip Postgres's own
  // statement_timeout, even against an otherwise-empty database.
  const rows = await db.execute<{ account_id: string; posting_type: 'Debit' | 'Credit'; amount: string }>(sql`
    SELECT account_id, posting_type, amount FROM (
      SELECT jl.account_id AS account_id, jl.posting_type AS posting_type, jl.amount AS amount
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_entry_id = je.id
      WHERE (${start}::date IS NULL OR je.txn_date >= ${start}::date)
        AND (${end}::date IS NULL OR je.txn_date <= ${end}::date)

      UNION ALL

      SELECT p.income_account_id AS account_id, 'Credit'::posting_type AS posting_type, il.amount AS amount
      FROM invoice_lines il
      JOIN invoices i ON il.invoice_id = i.id
      LEFT JOIN products p ON il.product_id = p.id
      WHERE p.income_account_id IS NOT NULL
        AND (${start}::date IS NULL OR i.txn_date >= ${start}::date)
        AND (${end}::date IS NULL OR i.txn_date <= ${end}::date)

      UNION ALL

      SELECT bl.account_id AS account_id, 'Debit'::posting_type AS posting_type, bl.amount AS amount
      FROM bill_lines bl
      JOIN bills b ON bl.bill_id = b.id
      WHERE (${start}::date IS NULL OR b.txn_date >= ${start}::date)
        AND (${end}::date IS NULL OR b.txn_date <= ${end}::date)

      UNION ALL

      SELECT el.account_id AS account_id, 'Debit'::posting_type AS posting_type, el.amount AS amount
      FROM expense_lines el
      JOIN expenses e ON el.expense_id = e.id
      WHERE (${start}::date IS NULL OR e.txn_date >= ${start}::date)
        AND (${end}::date IS NULL OR e.txn_date <= ${end}::date)

      UNION ALL

      SELECT e.payment_account_id AS account_id, 'Credit'::posting_type AS posting_type, el.amount AS amount
      FROM expense_lines el
      JOIN expenses e ON el.expense_id = e.id
      WHERE (${start}::date IS NULL OR e.txn_date >= ${start}::date)
        AND (${end}::date IS NULL OR e.txn_date <= ${end}::date)

      UNION ALL

      SELECT ip.deposit_account_id AS account_id, 'Debit'::posting_type AS posting_type, ip.amount AS amount
      FROM invoice_payments ip
      WHERE (${start}::date IS NULL OR ip.payment_date >= ${start}::date)
        AND (${end}::date IS NULL OR ip.payment_date <= ${end}::date)

      UNION ALL

      SELECT bp.bank_account_id AS account_id, 'Credit'::posting_type AS posting_type, bp.amount AS amount
      FROM bill_payments bp
      WHERE (${start}::date IS NULL OR bp.payment_date >= ${start}::date)
        AND (${end}::date IS NULL OR bp.payment_date <= ${end}::date)

      UNION ALL

      SELECT t.from_account_id AS account_id, 'Credit'::posting_type AS posting_type, t.amount AS amount
      FROM transfers t
      WHERE (${start}::date IS NULL OR t.txn_date >= ${start}::date)
        AND (${end}::date IS NULL OR t.txn_date <= ${end}::date)

      UNION ALL

      SELECT t.to_account_id AS account_id, 'Debit'::posting_type AS posting_type, t.amount AS amount
      FROM transfers t
      WHERE (${start}::date IS NULL OR t.txn_date >= ${start}::date)
        AND (${end}::date IS NULL OR t.txn_date <= ${end}::date)
    ) postings
    WHERE account_id IS NOT NULL
  `);

  return rows.map((row) => ({
    accountId: row.account_id,
    postingType: row.posting_type,
    amount: Number(row.amount),
  }));
}

type AccountTypeRow = { id: string; accountType: string };

function balancesFromPostings(accountRows: AccountTypeRow[], postings: Posting[]): Map<string, number> {
  const classificationById = new Map(accountRows.map((a) => [a.id, CLASSIFICATION_BY_TYPE[a.accountType]]));
  const balances = new Map<string, number>();
  for (const posting of postings) {
    const classification = classificationById.get(posting.accountId);
    const isDebitNormal = classification ? DEBIT_NORMAL.has(classification) : true;
    const signedDelta = posting.postingType === 'Debit' ? posting.amount : -posting.amount;
    const delta = isDebitNormal ? signedDelta : -signedDelta;
    balances.set(posting.accountId, (balances.get(posting.accountId) ?? 0) + delta);
  }
  return balances;
}

/** Sums every posting per account (all-time, or within `range` if given), signed so each balance reads naturally for its classification. */
async function getAccountBalances(range?: DateRange): Promise<Map<string, number>> {
  const db = getDb();
  const [accountRows, postings] = await Promise.all([
    db.select({ id: accounts.id, accountType: accounts.accountType }).from(accounts),
    collectPostings(range),
  ]);
  return balancesFromPostings(accountRows, postings);
}

/**
 * Sums account balances by their raw account type (e.g. distinguishing
 * "Cost of Goods Sold" from "Expense"), for reports that need finer-grained
 * grouping than the Classification enum provides. Balances are signed to
 * read naturally for their classification, same as getAccountBalances.
 */
export async function sumBalancesByAccountType(range?: DateRange): Promise<Map<string, number>> {
  const db = getDb();
  const [accountRows, postings] = await Promise.all([
    db.select({ id: accounts.id, accountType: accounts.accountType }).from(accounts),
    collectPostings(range),
  ]);
  const balances = balancesFromPostings(accountRows, postings);

  const totals = new Map<string, number>();
  for (const account of accountRows) {
    const balance = balances.get(account.id) ?? 0;
    if (balance === 0) continue;
    totals.set(account.accountType, (totals.get(account.accountType) ?? 0) + balance);
  }
  return totals;
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
  const account = toAccount(row, 0);
  await recordAuditLog({ entityType: 'account', entityId: account.Id, action: 'create', after: account });
  return account;
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
  const before = await getAccount(input.id);
  const db = getDb();
  const patch: Partial<AccountRow> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.acctNum !== undefined) patch.acctNum = input.acctNum || null;
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.active !== undefined) patch.active = input.active;

  const [row] = await db.update(accounts).set(patch).where(eq(accounts.id, input.id)).returning();
  if (!row) throw new Error('Account not found.');
  const balances = await getAccountBalances();
  const account = toAccount(row, balances.get(row.id) ?? 0);
  await recordAuditLog({ entityType: 'account', entityId: account.Id, action: 'update', before, after: account });
  return account;
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
