import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { accounts, bankTransactions, bookkeepingRules, vendors } from '@/db/schema';
import { createExpense } from '@/lib/accounting/expenses';
import { listLedgerTransactionsForAccount, matchStatementToLedger, parseStatementCsv, type StatementLine } from '@/lib/accounting/reconciliation';
import {
  CONFIDENT,
  fingerprint,
  fromHistory,
  matchRule,
  merchantKey,
  suggestWithAi,
  vendorFromDescription,
  type ExpenseAccountOption,
  type HistoryRow,
  type Rule,
  type Suggestion,
} from '@/lib/bookkeeping/categorize';
import { ConflictError, NotFoundError, ValidationError, asRecord, optUuid, text, uuid, round2 } from '@/lib/validation';
import { EXPENSE_ACCOUNT_TYPES } from '@/lib/accounting/entryRules';
import { llmEnabled } from '@/lib/llm/json';
import { readStatementFile, statementKind, type StatementKind } from '@/lib/bookkeeping/statementFiles';

// Orchestrates the AI bookkeeping copilot: statement lines come in, each is
// matched against what is already booked, then categorized, and anything a
// person must decide lands in the review queue. A line only becomes an
// Expense when a person approves it (or a rule they marked "post without
// asking" fires). Money coming in is never auto-booked: it needs an invoice
// payment or a transfer, so it goes to review.

const MAX_LINES_PER_IMPORT = 2000;
const MAX_AI_LINES_PER_RUN = 40;

export type BankTxnStatus = 'new' | 'matched' | 'review' | 'posting' | 'posted' | 'ignored';

export interface BankTxn {
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  description: string;
  amount: number;
  status: BankTxnStatus;
  suggestedAccountId: string | null;
  suggestedAccountName: string | null;
  suggestedVendorId: string | null;
  confidence: number | null;
  source: string | null;
  reason: string | null;
  matchedRef: string | null;
  postedExpenseId: string | null;
}

export interface BookkeepingRule {
  id: string;
  pattern: string;
  accountId: string;
  accountName: string;
  vendorId: string | null;
  autoPost: boolean;
  hits: number;
}

type TxnRow = typeof bankTransactions.$inferSelect;

async function loadRules(): Promise<Rule[]> {
  const db = getDb();
  const rows = await db.select().from(bookkeepingRules);
  return rows.map((r) => ({ id: r.id, pattern: r.pattern, accountId: r.accountId, vendorId: r.vendorId, autoPost: r.autoPost }));
}

async function loadHistory(): Promise<HistoryRow[]> {
  const db = getDb();
  const rows = await db.execute<{ merchant_key: string; account_id: string; uses: string }>(sql`
    SELECT merchant_key, posted_account_id AS account_id, COUNT(*) AS uses
    FROM bank_transactions
    WHERE status = 'posted' AND posted_account_id IS NOT NULL
    GROUP BY merchant_key, posted_account_id
  `);
  return rows.map((r) => ({ merchantKey: r.merchant_key, accountId: r.account_id, uses: Number(r.uses) }));
}

export async function listExpenseOptions(): Promise<ExpenseAccountOption[]> {
  const db = getDb();
  const rows = await db.select({ id: accounts.id, name: accounts.name, type: accounts.accountType }).from(accounts).where(and(eq(accounts.active, true), inArray(accounts.accountType, EXPENSE_ACCOUNT_TYPES)));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportResult {
  read: number;
  added: number;
  duplicates: number;
  processed: RunResult;
}

export async function importStatement(accountIdRaw: unknown, csvTextRaw: unknown): Promise<ImportResult> {
  const csvText = text(csvTextRaw, 'Statement', { max: 2_000_000 });
  return importLines(accountIdRaw, parseStatementCsv(csvText));
}

/** An uploaded statement file (CSV, OFX/QFX, PDF or image) read into lines and imported like pasted CSV. */
export async function importStatementFile(raw: unknown): Promise<ImportResult & { kind: StatementKind }> {
  const b = asRecord(raw, 'The upload');
  const fileName = text(b.fileName, 'File name', { max: 200 });
  const mimeType = typeof b.mimeType === 'string' ? b.mimeType : '';
  const data = text(b.data, 'File', { max: 6_000_000 });
  const accountId = uuid(b.accountId, 'Account');
  const kind = statementKind(fileName, mimeType);
  const lines = await readStatementFile({ fileName, mimeType, base64: data, aiEnabled: llmEnabled() });
  return { ...(await importLines(accountId, lines)), kind: kind as StatementKind };
}

async function importLines(accountIdRaw: unknown, lines: StatementLine[]): Promise<ImportResult> {
  const accountId = uuid(accountIdRaw, 'Account');
  if (lines.length === 0) throw new ValidationError('No transaction rows found in the statement.');
  if (lines.length > MAX_LINES_PER_IMPORT) throw new ValidationError(`Import at most ${MAX_LINES_PER_IMPORT} lines at a time.`);

  const db = getDb();
  const [account] = await db.select({ id: accounts.id, type: accounts.accountType }).from(accounts).where(eq(accounts.id, accountId));
  if (!account) throw new NotFoundError('Account not found.');
  if (account.type !== 'Bank' && account.type !== 'Credit Card') throw new ValidationError('Choose a bank or credit card account.');

  // Identical lines on the same day (two coffees) get distinct fingerprints by occurrence number.
  const seen = new Map<string, number>();
  const rows = lines.map((l: StatementLine) => {
    const base = fingerprint(l.date, l.amount, l.description, 0).replace(/\|0$/, '');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return {
      accountId,
      txnDate: l.date,
      description: l.description.slice(0, 300),
      amount: round2(l.amount).toFixed(2),
      fingerprint: fingerprint(l.date, l.amount, l.description, n),
      merchantKey: merchantKey(l.description),
    };
  });
  const inserted = await db.insert(bankTransactions).values(rows).onConflictDoNothing().returning({ id: bankTransactions.id });
  const processed = await runBookkeeping();
  return { read: rows.length, added: inserted.length, duplicates: rows.length - inserted.length, processed };
}

// ---------------------------------------------------------------------------
// The run: match, categorize, route
// ---------------------------------------------------------------------------

export interface RunResult {
  matched: number;
  toReview: number;
  autoPosted: number;
  needsAttention: number;
}

export async function runBookkeeping(opts: { client?: Parameters<typeof suggestWithAi>[2]; reconsider?: boolean } = {}): Promise<RunResult> {
  const client = opts.client;
  const db = getDb();
  await releaseOrphans();
  // Lines waiting for a person carry no decision yet, so a new rule or account can improve their suggestion.
  if (opts.reconsider) await db.update(bankTransactions).set({ status: 'new', updatedAt: new Date() }).where(eq(bankTransactions.status, 'review'));
  const fresh = await db.select().from(bankTransactions).where(eq(bankTransactions.status, 'new')).orderBy(bankTransactions.txnDate);
  const result: RunResult = { matched: 0, toReview: 0, autoPosted: 0, needsAttention: 0 };
  if (fresh.length === 0) return result;

  // 1. Already in the books? Compare each account's new lines with its ledger.
  const matchedIds = new Set<string>();
  const byAccount = new Map<string, TxnRow[]>();
  for (const t of fresh) byAccount.set(t.accountId, [...(byAccount.get(t.accountId) ?? []), t]);
  const claimed = await db.select({ id: bankTransactions.postedExpenseId }).from(bankTransactions).where(sql`${bankTransactions.postedExpenseId} IS NOT NULL`);
  const claimedExpenses = new Set(claimed.map((c) => c.id).filter((x): x is string => Boolean(x)));
  for (const [accountId, list] of byAccount) {
    const dates = list.map((t) => t.txnDate).sort();
    const shift = (iso: string, d: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + d * 86_400_000).toISOString().slice(0, 10);
    const ledger = (await listLedgerTransactionsForAccount(accountId, { startDate: shift(dates[0], -7), endDate: shift(dates[dates.length - 1], 7) })).filter((l) => !claimedExpenses.has(l.id));
    const stmt = list.map((t) => ({ date: t.txnDate, description: t.description, amount: Number(t.amount), id: t.id }));
    const { matched } = matchStatementToLedger(stmt, ledger);
    for (const pair of matched) {
      const id = (pair.statement as StatementLine & { id: string }).id;
      matchedIds.add(id);
      await db.update(bankTransactions).set({ status: 'matched', matchedRef: pair.ledger.description, updatedAt: new Date() }).where(eq(bankTransactions.id, id));
      result.matched += 1;
    }
  }

  // 2. Categorize the rest.
  const rest = fresh.filter((t) => !matchedIds.has(t.id));
  if (rest.length === 0) return result;
  const [rules, history, options, vendorRows] = await Promise.all([
    loadRules(),
    loadHistory(),
    listExpenseOptions(),
    db.select({ id: vendors.id, name: vendors.displayName }).from(vendors).where(eq(vendors.active, true)),
  ]);

  const suggestions = new Map<string, Suggestion>();
  const needAi: { i: number; t: TxnRow }[] = [];
  rest.forEach((t) => {
    if (Number(t.amount) >= 0) return; // money in: a person decides what it is
    const rule = matchRule(t.description, rules);
    if (rule) {
      suggestions.set(t.id, { accountId: rule.accountId, vendorId: rule.vendorId, confidence: 99, source: 'rule', reason: `Matches your rule "${rule.pattern}".`, ruleId: rule.id, autoPost: rule.autoPost });
      return;
    }
    const hist = fromHistory(t.merchantKey, history);
    if (hist) {
      suggestions.set(t.id, hist);
      return;
    }
    if (needAi.length < MAX_AI_LINES_PER_RUN) needAi.push({ i: needAi.length, t });
  });
  if (needAi.length > 0) {
    const ai = await suggestWithAi(needAi.map((x) => ({ i: x.i, description: x.t.description, amount: Number(x.t.amount) })), options, client);
    for (const { i, t } of needAi) {
      const s = ai.get(i);
      if (s) suggestions.set(t.id, s);
    }
  }

  // 3. Route each line.
  for (const t of rest) {
    const s = suggestions.get(t.id);
    const vendorId = s?.vendorId ?? vendorFromDescription(t.description, vendorRows);
    if (s?.autoPost && Number(t.amount) < 0) {
      try {
        await postLine(t.id, { accountId: s.accountId, vendorId: vendorId ?? undefined, via: 'rule' });
        if (s.ruleId) await db.update(bookkeepingRules).set({ hits: sql`${bookkeepingRules.hits} + 1` }).where(eq(bookkeepingRules.id, s.ruleId));
        result.autoPosted += 1;
        continue;
      } catch {
        // Could not post (for example the account was deactivated): leave it for a person.
      }
    }
    const incoming = Number(t.amount) >= 0;
    await db
      .update(bankTransactions)
      .set({
        status: 'review',
        suggestedAccountId: s?.accountId ?? null,
        suggestedVendorId: vendorId,
        confidence: s?.confidence ?? null,
        source: s?.source ?? null,
        reason: s?.reason ?? (incoming ? 'Money in. Match it to an invoice payment or record it as a transfer.' : 'No rule, history or confident guess. Choose the account.'),
        updatedAt: new Date(),
      })
      .where(and(eq(bankTransactions.id, t.id), eq(bankTransactions.status, 'new')));
    result.toReview += 1;
    if (!s || s.confidence < CONFIDENT) result.needsAttention += 1;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

async function postLine(id: string, opts: { accountId: string; vendorId?: string; via: 'person' | 'rule' }): Promise<string> {
  const db = getDb();
  // Claim the line first so two clicks (or a click and a rule) can never book it twice.
  const [claimed] = await db
    .update(bankTransactions)
    .set({ status: 'posting', updatedAt: new Date() })
    .where(and(eq(bankTransactions.id, id), inArray(bankTransactions.status, ['new', 'review'])))
    .returning();
  if (!claimed) throw new ConflictError('That line was already handled.');
  const amount = Number(claimed.amount);
  try {
    if (amount >= 0) throw new ValidationError('Money coming in is not booked as an expense. Record it as an invoice payment or a transfer.');
    const [acct] = await db.select({ type: accounts.accountType }).from(accounts).where(eq(accounts.id, claimed.accountId));
    const expense = await createExpense({
      paymentAccountId: claimed.accountId,
      paymentType: acct?.type === 'Credit Card' ? 'CreditCard' : 'Cash',
      vendorId: opts.vendorId,
      txnDate: claimed.txnDate,
      lines: [{ accountId: opts.accountId, amount: Math.abs(amount), description: claimed.description }],
    });
    await db
      .update(bankTransactions)
      .set({ status: 'posted', postedAccountId: opts.accountId, postedExpenseId: expense.Id, source: claimed.source ?? (opts.via === 'rule' ? 'rule' : null), updatedAt: new Date() })
      .where(eq(bankTransactions.id, id));
    return expense.Id;
  } catch (err) {
    await db.update(bankTransactions).set({ status: opts.via === 'rule' ? 'new' : 'review', updatedAt: new Date() }).where(eq(bankTransactions.id, id));
    throw err;
  }
}

export async function approveLine(idRaw: unknown, body: unknown): Promise<{ expenseId: string; ruleCreated: boolean }> {
  const id = uuid(idRaw, 'Line');
  const b = asRecord(body);
  const accountId = uuid(b.accountId, 'Account');
  const vendorId = optUuid(b.vendorId, 'Vendor');
  const expenseId = await postLine(id, { accountId, vendorId, via: 'person' });
  let ruleCreated = false;
  if (b.makeRule === true) {
    const db = getDb();
    const [row] = await db.select({ key: bankTransactions.merchantKey }).from(bankTransactions).where(eq(bankTransactions.id, id));
    if (row && row.key !== 'UNKNOWN') {
      const existing = await db.select({ id: bookkeepingRules.id }).from(bookkeepingRules).where(sql`upper(${bookkeepingRules.pattern}) = ${row.key}`);
      if (existing.length === 0) {
        await db.insert(bookkeepingRules).values({ pattern: row.key, accountId, vendorId: vendorId ?? null });
        ruleCreated = true;
      }
    }
  }
  return { expenseId, ruleCreated };
}

export async function ignoreLine(idRaw: unknown): Promise<void> {
  const id = uuid(idRaw, 'Line');
  const db = getDb();
  const done = await db
    .update(bankTransactions)
    .set({ status: 'ignored', updatedAt: new Date() })
    .where(and(eq(bankTransactions.id, id), inArray(bankTransactions.status, ['new', 'review'])))
    .returning({ id: bankTransactions.id });
  if (done.length === 0) throw new ConflictError('That line was already handled.');
}

/** Books every waiting expense whose suggestion is confident enough. People still choose to press the button. */
export async function approveConfident(): Promise<{ posted: number; failed: number }> {
  const db = getDb();
  const rows = await db
    .select()
    .from(bankTransactions)
    .where(and(eq(bankTransactions.status, 'review'), sql`${bankTransactions.suggestedAccountId} IS NOT NULL`, sql`${bankTransactions.confidence} >= ${CONFIDENT}`, sql`${bankTransactions.amount} < 0`))
    .limit(200);
  let posted = 0;
  let failed = 0;
  for (const t of rows) {
    try {
      await postLine(t.id, { accountId: t.suggestedAccountId as string, vendorId: t.suggestedVendorId ?? undefined, via: 'person' });
      posted += 1;
    } catch {
      failed += 1;
    }
  }
  return { posted, failed };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export async function listRules(): Promise<BookkeepingRule[]> {
  const db = getDb();
  const rows = await db
    .select({ r: bookkeepingRules, accountName: accounts.name })
    .from(bookkeepingRules)
    .innerJoin(accounts, eq(accounts.id, bookkeepingRules.accountId))
    .orderBy(desc(bookkeepingRules.createdAt));
  return rows.map(({ r, accountName }) => ({ id: r.id, pattern: r.pattern, accountId: r.accountId, accountName, vendorId: r.vendorId, autoPost: r.autoPost, hits: r.hits }));
}

export async function createRule(body: unknown): Promise<void> {
  const b = asRecord(body);
  const pattern = text(b.pattern, 'Text to look for', { max: 80 }).toUpperCase();
  if (pattern.length < 3) throw new ValidationError('Use at least 3 characters so the rule does not match everything.');
  const accountId = uuid(b.accountId, 'Account');
  const db = getDb();
  const [acct] = await db.select({ type: accounts.accountType, active: accounts.active }).from(accounts).where(eq(accounts.id, accountId));
  if (!acct || !acct.active || !EXPENSE_ACCOUNT_TYPES.includes(acct.type)) throw new ValidationError('Choose an active expense account.');
  await db.insert(bookkeepingRules).values({ pattern, accountId, vendorId: optUuid(b.vendorId, 'Vendor') ?? null, autoPost: b.autoPost === true });
}

export async function updateRule(idRaw: unknown, body: unknown): Promise<void> {
  const id = uuid(idRaw, 'Rule');
  const b = asRecord(body);
  const db = getDb();
  const done = await db.update(bookkeepingRules).set({ autoPost: b.autoPost === true, updatedAt: new Date() }).where(eq(bookkeepingRules.id, id)).returning({ id: bookkeepingRules.id });
  if (done.length === 0) throw new NotFoundError('Rule not found.');
}

export async function deleteRule(idRaw: unknown): Promise<void> {
  const id = uuid(idRaw, 'Rule');
  const db = getDb();
  const done = await db.delete(bookkeepingRules).where(eq(bookkeepingRules.id, id)).returning({ id: bookkeepingRules.id });
  if (done.length === 0) throw new NotFoundError('Rule not found.');
}

// ---------------------------------------------------------------------------
// Queue and month-end readiness
// ---------------------------------------------------------------------------

export interface Overview {
  counts: Record<BankTxnStatus, number>;
  confidentWaiting: number;
  queue: BankTxn[];
  recent: BankTxn[];
  accounts: { id: string; name: string; lastDate: string | null; lines: number }[];
  readiness: { label: string; ok: boolean; detail: string }[];
  aiEnabled: boolean;
}

async function toTxns(rows: TxnRow[]): Promise<BankTxn[]> {
  if (rows.length === 0) return [];
  const db = getDb();
  const ids = [...new Set(rows.flatMap((r) => [r.accountId, r.suggestedAccountId, r.postedAccountId]).filter((x): x is string => Boolean(x)))];
  const names = new Map((await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(inArray(accounts.id, ids))).map((a) => [a.id, a.name]));
  return rows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    accountName: names.get(r.accountId) ?? '',
    date: r.txnDate,
    description: r.description,
    amount: Number(r.amount),
    status: r.status,
    suggestedAccountId: r.suggestedAccountId,
    suggestedAccountName: r.suggestedAccountId ? (names.get(r.suggestedAccountId) ?? null) : null,
    suggestedVendorId: r.suggestedVendorId,
    confidence: r.confidence,
    source: r.source,
    reason: r.reason,
    matchedRef: r.matchedRef,
    postedExpenseId: r.postedExpenseId,
  }));
}

export async function getOverview(): Promise<Overview> {
  const db = getDb();
  const [countRows, queueRows, recentRows, acctRows, [confident]] = await Promise.all([
    db.execute<{ status: BankTxnStatus; n: string }>(sql`SELECT status, COUNT(*) AS n FROM bank_transactions GROUP BY status`),
    db.select().from(bankTransactions).where(eq(bankTransactions.status, 'review')).orderBy(desc(bankTransactions.txnDate)).limit(200),
    db.select().from(bankTransactions).where(inArray(bankTransactions.status, ['posted', 'matched'])).orderBy(desc(bankTransactions.updatedAt)).limit(15),
    db.execute<{ id: string; name: string; last_date: string | null; lines: string }>(sql`
      SELECT a.id::text AS id, a.name, MAX(b.txn_date)::text AS last_date, COUNT(b.id) AS lines
      FROM accounts a JOIN bank_transactions b ON b.account_id = a.id GROUP BY a.id, a.name ORDER BY a.name`),
    db.execute<{ n: string }>(sql`SELECT COUNT(*) AS n FROM bank_transactions WHERE status='review' AND suggested_account_id IS NOT NULL AND confidence >= ${CONFIDENT} AND amount < 0`),
  ]);
  const counts: Record<BankTxnStatus, number> = { new: 0, matched: 0, review: 0, posting: 0, posted: 0, ignored: 0 };
  for (const r of countRows) counts[r.status] = Number(r.n);
  const accountsList = acctRows.map((a) => ({ id: a.id, name: a.name, lastDate: a.last_date, lines: Number(a.lines) }));

  const now = new Date();
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10);
  const monthEndLabel = new Date(`${monthEnd}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const stale = accountsList.filter((a) => !a.lastDate || a.lastDate < monthEnd);
  const readiness = [
    { label: 'Every statement line is handled', ok: counts.review === 0 && counts.new === 0, detail: counts.review + counts.new === 0 ? 'Nothing is waiting for a decision.' : `${counts.review + counts.new} line${counts.review + counts.new === 1 ? '' : 's'} still waiting.` },
    { label: `Statements reach the end of ${monthEndLabel}`, ok: accountsList.length > 0 && stale.length === 0, detail: accountsList.length === 0 ? 'No statements imported yet.' : stale.length === 0 ? 'Every imported account runs through month end.' : `Behind: ${stale.map((a) => a.name).join(', ')}.` },
    { label: 'Nothing is stuck posting', ok: counts.posting === 0, detail: counts.posting === 0 ? 'No interrupted postings.' : `${counts.posting} interrupted. Open the queue and retry.` },
  ];
  return {
    counts,
    confidentWaiting: Number(confident?.n ?? 0),
    queue: await toTxns(queueRows),
    recent: await toTxns(recentRows),
    accounts: accountsList,
    readiness,
    aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY) && process.env.DESK_LLM !== 'off',
  };
}

// An expense that was deleted frees its line, which is then sorted again from scratch.
export async function releaseOrphans(): Promise<number> {
  const db = getDb();
  const rows = await db.execute<{ id: string }>(sql`
    UPDATE bank_transactions SET status = 'new', suggested_account_id = NULL, confidence = NULL, source = NULL, reason = NULL, posted_expense_id = NULL, posted_account_id = NULL, updated_at = now()
    WHERE status = 'posted' AND posted_expense_id IS NULL RETURNING id`);
  return rows.length;
}

