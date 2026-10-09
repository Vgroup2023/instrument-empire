import { getDb } from '@/db/client';
import { accounts } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import type { DateRange } from '@/lib/dateRanges';
import { ValidationError, NotFoundError } from '@/lib/validation';

// Bank reconciliation via CSV import — this app has no bank feed connection,
// so the statement has to come from a file you export from your bank and
// upload here. Matching is a straightforward amount + nearby-date heuristic
// against transactions already recorded in this app against the chosen
// account (invoice payments, bill payments, expenses, transfers) — not an
// AI model and not a live bank connection. Nothing is persisted: each
// upload is a one-time comparison, not a saved reconciliation session.

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / (1000 * 60 * 60 * 24)));
}

// ---------------------------------------------------------------------------
// CSV parsing — tolerant of quoted fields, a missing header row, $/comma
// formatting, and parenthesized negatives (a common bank-export convention).
// ---------------------------------------------------------------------------

export interface StatementLine {
  date: string;
  description: string;
  amount: number;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

function parseAmount(raw: string): number {
  let s = raw.trim().replace(/[$,]/g, '');
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  const n = Number(s);
  if (Number.isNaN(n)) throw new ValidationError(`couldn't parse amount "${raw}"`);
  return negative ? -n : n;
}

function parseDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, mm, dd, yyyyRaw] = m;
    const yyyy = yyyyRaw.length === 2 ? `20${yyyyRaw}` : yyyyRaw;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  throw new ValidationError(`couldn't parse date "${raw}"`);
}

export function parseStatementCsv(csvText: string): StatementLine[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new ValidationError('The statement is empty.');

  const rows = lines.map(parseCsvLine);
  const headerRow = rows[0].map((h) => h.toLowerCase());
  const dateIdx = headerRow.findIndex((h) => h.includes('date'));
  const descIdx = headerRow.findIndex((h) => h.includes('desc') || h.includes('memo') || h.includes('payee') || h.includes('name'));
  const amountIdx = headerRow.findIndex((h) => h.includes('amount'));

  const hasHeader = dateIdx !== -1 && amountIdx !== -1;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const dIdx = hasHeader ? dateIdx : 0;
  const descI = hasHeader ? descIdx : 1;
  const aIdx = hasHeader ? amountIdx : 2;

  return dataRows.map((row, index) => {
    try {
      return {
        date: parseDate(row[dIdx] ?? ''),
        description: (row[descI] ?? '').trim() || '(no description)',
        amount: parseAmount(row[aIdx] ?? ''),
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'invalid data';
      throw new ValidationError(`Row ${index + 1} of the statement: ${reason}.`);
    }
  });
}

// ---------------------------------------------------------------------------
// Ledger transactions — everything already recorded against the chosen
// account, signed so a deposit is positive and a withdrawal is negative,
// matching typical bank-statement convention.
// ---------------------------------------------------------------------------

export interface LedgerTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
}

export async function listLedgerTransactionsForAccount(accountId: string, range: DateRange): Promise<LedgerTransaction[]> {
  const db = getDb();
  const rows = await db.execute<{ id: string; txn_date: string; amount: string; description: string }>(sql`
    SELECT ip.id::text AS id, ip.payment_date::text AS txn_date, ip.amount AS amount,
      ('Payment from ' || c.display_name) AS description
    FROM invoice_payments ip
    JOIN invoices i ON ip.invoice_id = i.id
    JOIN customers c ON i.customer_id = c.id
    WHERE ip.deposit_account_id = ${accountId}
      AND ip.payment_date BETWEEN ${range.startDate}::date AND ${range.endDate}::date

    UNION ALL

    SELECT bp.id::text AS id, bp.payment_date::text AS txn_date, (-bp.amount) AS amount,
      ('Payment to ' || v.display_name) AS description
    FROM bill_payments bp
    JOIN vendors v ON bp.vendor_id = v.id
    WHERE bp.bank_account_id = ${accountId}
      AND bp.payment_date BETWEEN ${range.startDate}::date AND ${range.endDate}::date

    UNION ALL

    SELECT e.id::text AS id, e.txn_date::text AS txn_date, (-COALESCE(SUM(el.amount), 0)) AS amount,
      ('Expense' || COALESCE(': ' || vd.display_name, '')) AS description
    FROM expenses e
    LEFT JOIN expense_lines el ON el.expense_id = e.id
    LEFT JOIN vendors vd ON e.vendor_id = vd.id
    WHERE e.payment_account_id = ${accountId}
      AND e.txn_date BETWEEN ${range.startDate}::date AND ${range.endDate}::date
    GROUP BY e.id, e.txn_date, vd.display_name

    UNION ALL

    SELECT (t.id::text || '-out') AS id, t.txn_date::text AS txn_date, (-t.amount) AS amount,
      ('Transfer out' || COALESCE(': ' || t.memo, '')) AS description
    FROM transfers t
    WHERE t.from_account_id = ${accountId}
      AND t.txn_date BETWEEN ${range.startDate}::date AND ${range.endDate}::date

    UNION ALL

    SELECT (t.id::text || '-in') AS id, t.txn_date::text AS txn_date, t.amount AS amount,
      ('Transfer in' || COALESCE(': ' || t.memo, '')) AS description
    FROM transfers t
    WHERE t.to_account_id = ${accountId}
      AND t.txn_date BETWEEN ${range.startDate}::date AND ${range.endDate}::date
  `);
  return rows.map((row) => ({ id: row.id, date: row.txn_date, description: row.description, amount: Number(row.amount) }));
}

// ---------------------------------------------------------------------------
// Matching — greedy nearest-date match within a window, for each statement
// line against the remaining unclaimed ledger transactions of the same
// amount (within a cent, to absorb rounding).
// ---------------------------------------------------------------------------

const MATCH_WINDOW_DAYS = 7;
const AMOUNT_TOLERANCE = 0.01;

export interface MatchedPair {
  statement: StatementLine;
  ledger: LedgerTransaction;
  dateDifferenceDays: number;
}

export function matchStatementToLedger(
  statementLines: StatementLine[],
  ledgerTransactions: LedgerTransaction[],
): {
  matched: MatchedPair[];
  unmatchedStatementLines: StatementLine[];
  unmatchedLedgerTransactions: LedgerTransaction[];
} {
  const remainingLedger = [...ledgerTransactions];
  const matched: MatchedPair[] = [];
  const unmatchedStatementLines: StatementLine[] = [];

  for (const line of statementLines) {
    let bestIndex = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < remainingLedger.length; i++) {
      const candidate = remainingLedger[i];
      if (Math.abs(candidate.amount - line.amount) > AMOUNT_TOLERANCE) continue;
      const diff = daysBetween(line.date, candidate.date);
      if (diff <= MATCH_WINDOW_DAYS && diff < bestDiff) {
        bestDiff = diff;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0) {
      matched.push({ statement: line, ledger: remainingLedger[bestIndex], dateDifferenceDays: bestDiff });
      remainingLedger.splice(bestIndex, 1);
    } else {
      unmatchedStatementLines.push(line);
    }
  }

  return { matched, unmatchedStatementLines, unmatchedLedgerTransactions: remainingLedger };
}

export interface ReconciliationResult {
  accountId: string;
  accountName: string;
  statementRange: DateRange;
  matched: MatchedPair[];
  unmatchedStatementLines: StatementLine[];
  unmatchedLedgerTransactions: LedgerTransaction[];
  statementTotal: number;
  ledgerTotal: number;
}

export async function reconcileStatement(accountId: string, csvText: string): Promise<ReconciliationResult> {
  const statementLines = parseStatementCsv(csvText);
  if (statementLines.length === 0) throw new ValidationError('No transaction rows found in the statement.');

  const dates = [...statementLines.map((l) => l.date)].sort();
  const range: DateRange = {
    startDate: shiftDate(dates[0], -MATCH_WINDOW_DAYS),
    endDate: shiftDate(dates[dates.length - 1], MATCH_WINDOW_DAYS),
  };

  const db = getDb();
  const [accountRow] = await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.id, accountId));
  if (!accountRow) throw new NotFoundError('Account not found.');

  const ledgerTransactions = await listLedgerTransactionsForAccount(accountId, range);
  const { matched, unmatchedStatementLines, unmatchedLedgerTransactions } = matchStatementToLedger(
    statementLines,
    ledgerTransactions,
  );

  return {
    accountId: accountRow.id,
    accountName: accountRow.name,
    statementRange: { startDate: dates[0], endDate: dates[dates.length - 1] },
    matched,
    unmatchedStatementLines,
    unmatchedLedgerTransactions,
    statementTotal: round2(statementLines.reduce((sum, l) => sum + l.amount, 0)),
    ledgerTotal: round2(ledgerTransactions.reduce((sum, l) => sum + l.amount, 0)),
  };
}
