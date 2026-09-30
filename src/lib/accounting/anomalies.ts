import { getDb } from '@/db/client';
import { sql } from 'drizzle-orm';

// Anomaly detection for the local ledger — duplicate transactions, unusual
// amounts, unbalanced journal entries, and unusually-timed entries. These are
// statistics and heuristics computed live from your own transaction history
// (per-vendor/customer averages, journal-entry balance checks), not a trained
// machine-learning model. Every field is recalculated from scratch on each
// call, so the results always reflect whatever has been entered up to that
// moment — no separate training step or model-hosting infrastructure needed,
// and no extra credentials beyond the DATABASE_URL this app already requires.

export type AnomalySeverity = 'high' | 'medium' | 'low';

export interface Anomaly {
  /** Stable per-row id, used as the React key — not a database id. */
  id: string;
  severity: AnomalySeverity;
  category: string;
  description: string;
  date: string;
  amount?: number;
}

const SEVERITY_RANK: Record<AnomalySeverity, number> = { high: 0, medium: 1, low: 2 };

/** How close in time two transactions of the same amount/party need to be to be flagged as a possible duplicate. */
const DUPLICATE_WINDOW_DAYS = 3;
/** Minimum number of prior transactions for a vendor/customer before "unusual amount" comparisons are meaningful. */
const MIN_HISTORY_FOR_OUTLIER = 4;
/** How many standard deviations from that party's average counts as "unusual". */
const OUTLIER_Z_SCORE = 2.5;
/** Weekend-dated entries are only worth surfacing if they're recent. */
const WEEKEND_LOOKBACK_DAYS = 90;
/** Caps how many rows each detector returns, so one noisy category can't drown out the rest. */
const MAX_ROWS_PER_DETECTOR = 50;

function money(v: string | number): string {
  return `$${Number(v).toFixed(2)}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function detectAnomalies(): Promise<Anomaly[]> {
  const results = await Promise.all([
    findUnbalancedJournalEntries(),
    findDuplicateInvoices(),
    findDuplicateBills(),
    findDuplicateExpenses(),
    findOutlierInvoices(),
    findOutlierBills(),
    findOutlierExpenses(),
    findWeekendEntries(),
  ]);

  return results
    .flat()
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.date.localeCompare(a.date));
}

/** Data-integrity check: every journal entry's debits and credits should match exactly. */
async function findUnbalancedJournalEntries(): Promise<Anomaly[]> {
  const db = getDb();
  const rows = await db.execute<{
    id: string;
    txn_date: string;
    private_note: string | null;
    total_debits: string;
    total_credits: string;
  }>(sql`
    SELECT je.id, je.txn_date::text AS txn_date, je.private_note,
      COALESCE(SUM(CASE WHEN jl.posting_type = 'Debit' THEN jl.amount ELSE 0 END), 0) AS total_debits,
      COALESCE(SUM(CASE WHEN jl.posting_type = 'Credit' THEN jl.amount ELSE 0 END), 0) AS total_credits
    FROM journal_entries je
    JOIN journal_lines jl ON jl.journal_entry_id = je.id
    GROUP BY je.id, je.txn_date, je.private_note
    HAVING ABS(
      COALESCE(SUM(CASE WHEN jl.posting_type = 'Debit' THEN jl.amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN jl.posting_type = 'Credit' THEN jl.amount ELSE 0 END), 0)
    ) > 0.01
    ORDER BY je.txn_date DESC
    LIMIT ${MAX_ROWS_PER_DETECTOR}
  `);
  return rows.map((row) => {
    const debits = Number(row.total_debits);
    const credits = Number(row.total_credits);
    return {
      id: `unbalanced-je:${row.id}`,
      severity: 'high',
      category: 'Unbalanced journal entry',
      description: `Journal entry${row.private_note ? ` "${row.private_note}"` : ''} has debits of ${money(debits)} but credits of ${money(credits)} — these should match.`,
      date: row.txn_date,
      amount: Math.abs(debits - credits),
    };
  });
}

async function findDuplicateInvoices(): Promise<Anomaly[]> {
  const db = getDb();
  const rows = await db.execute<{
    doc_a: string | null;
    doc_b: string | null;
    customer_name: string;
    total: string;
    date_b: string;
  }>(sql`
    WITH invoice_totals AS (
      SELECT i.id, i.customer_id, i.txn_date, i.doc_number, COALESCE(SUM(il.amount), 0) AS total
      FROM invoices i
      LEFT JOIN invoice_lines il ON il.invoice_id = i.id
      GROUP BY i.id, i.customer_id, i.txn_date, i.doc_number
    )
    SELECT a.doc_number AS doc_a, b.doc_number AS doc_b, c.display_name AS customer_name,
      a.total AS total, b.txn_date::text AS date_b
    FROM invoice_totals a
    JOIN invoice_totals b ON a.customer_id = b.customer_id AND a.id < b.id
      AND a.total > 0 AND ABS(a.total - b.total) < 0.01
      AND ABS(a.txn_date - b.txn_date) <= ${DUPLICATE_WINDOW_DAYS}
    JOIN customers c ON c.id = a.customer_id
    ORDER BY b.txn_date DESC
    LIMIT ${MAX_ROWS_PER_DETECTOR}
  `);
  return rows.map((row) => ({
    id: `dup-invoice:${row.doc_a}:${row.doc_b}:${row.date_b}`,
    severity: 'medium',
    category: 'Possible duplicate invoice',
    description: `Invoice ${row.doc_a ?? '(no number)'} and ${row.doc_b ?? '(no number)'} for ${row.customer_name} are both ${money(row.total)}, dated within ${DUPLICATE_WINDOW_DAYS} days of each other — worth checking these aren't the same invoice entered twice.`,
    date: row.date_b,
    amount: Number(row.total),
  }));
}

async function findDuplicateBills(): Promise<Anomaly[]> {
  const db = getDb();
  const rows = await db.execute<{
    doc_a: string | null;
    doc_b: string | null;
    vendor_name: string;
    total: string;
    date_b: string;
  }>(sql`
    WITH bill_totals AS (
      SELECT b.id, b.vendor_id, b.txn_date, b.doc_number, COALESCE(SUM(bl.amount), 0) AS total
      FROM bills b
      LEFT JOIN bill_lines bl ON bl.bill_id = b.id
      GROUP BY b.id, b.vendor_id, b.txn_date, b.doc_number
    )
    SELECT a.doc_number AS doc_a, b.doc_number AS doc_b, v.display_name AS vendor_name,
      a.total AS total, b.txn_date::text AS date_b
    FROM bill_totals a
    JOIN bill_totals b ON a.vendor_id = b.vendor_id AND a.id < b.id
      AND a.total > 0 AND ABS(a.total - b.total) < 0.01
      AND ABS(a.txn_date - b.txn_date) <= ${DUPLICATE_WINDOW_DAYS}
    JOIN vendors v ON v.id = a.vendor_id
    ORDER BY b.txn_date DESC
    LIMIT ${MAX_ROWS_PER_DETECTOR}
  `);
  return rows.map((row) => ({
    id: `dup-bill:${row.doc_a}:${row.doc_b}:${row.date_b}`,
    severity: 'medium',
    category: 'Possible duplicate bill',
    description: `Bill ${row.doc_a ?? '(no number)'} and ${row.doc_b ?? '(no number)'} from ${row.vendor_name} are both ${money(row.total)}, dated within ${DUPLICATE_WINDOW_DAYS} days of each other — worth checking these aren't the same bill entered twice.`,
    date: row.date_b,
    amount: Number(row.total),
  }));
}

async function findDuplicateExpenses(): Promise<Anomaly[]> {
  const db = getDb();
  const rows = await db.execute<{
    doc_a: string | null;
    doc_b: string | null;
    vendor_name: string | null;
    total: string;
    date_b: string;
  }>(sql`
    WITH expense_totals AS (
      SELECT e.id, e.vendor_id, e.txn_date, e.doc_number, COALESCE(SUM(el.amount), 0) AS total
      FROM expenses e
      LEFT JOIN expense_lines el ON el.expense_id = e.id
      GROUP BY e.id, e.vendor_id, e.txn_date, e.doc_number
    )
    SELECT a.doc_number AS doc_a, b.doc_number AS doc_b, v.display_name AS vendor_name,
      a.total AS total, b.txn_date::text AS date_b
    FROM expense_totals a
    JOIN expense_totals b ON a.vendor_id = b.vendor_id AND a.id < b.id
      AND a.vendor_id IS NOT NULL
      AND a.total > 0 AND ABS(a.total - b.total) < 0.01
      AND ABS(a.txn_date - b.txn_date) <= ${DUPLICATE_WINDOW_DAYS}
    LEFT JOIN vendors v ON v.id = a.vendor_id
    ORDER BY b.txn_date DESC
    LIMIT ${MAX_ROWS_PER_DETECTOR}
  `);
  return rows.map((row) => ({
    id: `dup-expense:${row.doc_a}:${row.doc_b}:${row.date_b}`,
    severity: 'medium',
    category: 'Possible duplicate expense',
    description: `Expense ${row.doc_a ?? '(no number)'} and ${row.doc_b ?? '(no number)'}${row.vendor_name ? ` from ${row.vendor_name}` : ''} are both ${money(row.total)}, dated within ${DUPLICATE_WINDOW_DAYS} days of each other.`,
    date: row.date_b,
    amount: Number(row.total),
  }));
}

/**
 * Flags a transaction whose amount is far from that customer/vendor's own
 * historical average (z-score against a population standard deviation
 * computed from every one of their transactions, including this one — a
 * standard simplification for this kind of live, no-training-step check).
 * Requires at least MIN_HISTORY_FOR_OUTLIER transactions for that party so a
 * brand-new relationship's first few invoices/bills don't get flagged.
 */
async function findOutlierInvoices(): Promise<Anomaly[]> {
  const db = getDb();
  const rows = await db.execute<{
    doc_number: string | null;
    customer_name: string;
    total: string;
    avg_total: string;
    txn_date: string;
  }>(sql`
    WITH invoice_totals AS (
      SELECT i.id, i.customer_id, i.txn_date, i.doc_number, COALESCE(SUM(il.amount), 0) AS total
      FROM invoices i
      LEFT JOIN invoice_lines il ON il.invoice_id = i.id
      GROUP BY i.id, i.customer_id, i.txn_date, i.doc_number
    ),
    stats AS (
      SELECT *,
        AVG(total) OVER (PARTITION BY customer_id) AS avg_total,
        STDDEV_POP(total) OVER (PARTITION BY customer_id) AS stddev_total,
        COUNT(*) OVER (PARTITION BY customer_id) AS n
      FROM invoice_totals
    )
    SELECT s.doc_number, c.display_name AS customer_name, s.total, s.avg_total, s.txn_date::text AS txn_date
    FROM stats s
    JOIN customers c ON c.id = s.customer_id
    WHERE s.n >= ${MIN_HISTORY_FOR_OUTLIER} AND s.stddev_total > 0
      AND ABS(s.total - s.avg_total) / s.stddev_total > ${OUTLIER_Z_SCORE}
    ORDER BY s.txn_date DESC
    LIMIT ${MAX_ROWS_PER_DETECTOR}
  `);
  return rows.map((row) => {
    const total = Number(row.total);
    const avg = Number(row.avg_total);
    const direction = total > avg ? 'higher' : 'lower';
    return {
      id: `outlier-invoice:${row.doc_number}:${row.txn_date}:${row.customer_name}`,
      severity: 'medium',
      category: 'Unusual invoice amount',
      description: `Invoice ${row.doc_number ?? '(no number)'} for ${row.customer_name} is ${money(total)} — much ${direction} than this customer's usual ${money(avg)}.`,
      date: row.txn_date,
      amount: total,
    };
  });
}

async function findOutlierBills(): Promise<Anomaly[]> {
  const db = getDb();
  const rows = await db.execute<{
    doc_number: string | null;
    vendor_name: string;
    total: string;
    avg_total: string;
    txn_date: string;
  }>(sql`
    WITH bill_totals AS (
      SELECT b.id, b.vendor_id, b.txn_date, b.doc_number, COALESCE(SUM(bl.amount), 0) AS total
      FROM bills b
      LEFT JOIN bill_lines bl ON bl.bill_id = b.id
      GROUP BY b.id, b.vendor_id, b.txn_date, b.doc_number
    ),
    stats AS (
      SELECT *,
        AVG(total) OVER (PARTITION BY vendor_id) AS avg_total,
        STDDEV_POP(total) OVER (PARTITION BY vendor_id) AS stddev_total,
        COUNT(*) OVER (PARTITION BY vendor_id) AS n
      FROM bill_totals
    )
    SELECT s.doc_number, v.display_name AS vendor_name, s.total, s.avg_total, s.txn_date::text AS txn_date
    FROM stats s
    JOIN vendors v ON v.id = s.vendor_id
    WHERE s.n >= ${MIN_HISTORY_FOR_OUTLIER} AND s.stddev_total > 0
      AND ABS(s.total - s.avg_total) / s.stddev_total > ${OUTLIER_Z_SCORE}
    ORDER BY s.txn_date DESC
    LIMIT ${MAX_ROWS_PER_DETECTOR}
  `);
  return rows.map((row) => {
    const total = Number(row.total);
    const avg = Number(row.avg_total);
    const direction = total > avg ? 'higher' : 'lower';
    return {
      id: `outlier-bill:${row.doc_number}:${row.txn_date}:${row.vendor_name}`,
      severity: 'medium',
      category: 'Unusual bill amount',
      description: `Bill ${row.doc_number ?? '(no number)'} from ${row.vendor_name} is ${money(total)} — much ${direction} than this vendor's usual ${money(avg)}.`,
      date: row.txn_date,
      amount: total,
    };
  });
}

async function findOutlierExpenses(): Promise<Anomaly[]> {
  const db = getDb();
  const rows = await db.execute<{
    doc_number: string | null;
    vendor_name: string | null;
    total: string;
    avg_total: string;
    txn_date: string;
  }>(sql`
    WITH expense_totals AS (
      SELECT e.id, e.vendor_id, e.txn_date, e.doc_number, COALESCE(SUM(el.amount), 0) AS total
      FROM expenses e
      LEFT JOIN expense_lines el ON el.expense_id = e.id
      WHERE e.vendor_id IS NOT NULL
      GROUP BY e.id, e.vendor_id, e.txn_date, e.doc_number
    ),
    stats AS (
      SELECT *,
        AVG(total) OVER (PARTITION BY vendor_id) AS avg_total,
        STDDEV_POP(total) OVER (PARTITION BY vendor_id) AS stddev_total,
        COUNT(*) OVER (PARTITION BY vendor_id) AS n
      FROM expense_totals
    )
    SELECT s.doc_number, v.display_name AS vendor_name, s.total, s.avg_total, s.txn_date::text AS txn_date
    FROM stats s
    LEFT JOIN vendors v ON v.id = s.vendor_id
    WHERE s.n >= ${MIN_HISTORY_FOR_OUTLIER} AND s.stddev_total > 0
      AND ABS(s.total - s.avg_total) / s.stddev_total > ${OUTLIER_Z_SCORE}
    ORDER BY s.txn_date DESC
    LIMIT ${MAX_ROWS_PER_DETECTOR}
  `);
  return rows.map((row) => {
    const total = Number(row.total);
    const avg = Number(row.avg_total);
    const direction = total > avg ? 'higher' : 'lower';
    return {
      id: `outlier-expense:${row.doc_number}:${row.txn_date}:${row.vendor_name}`,
      severity: 'medium',
      category: 'Unusual expense amount',
      description: `Expense ${row.doc_number ?? '(no number)'}${row.vendor_name ? ` from ${row.vendor_name}` : ''} is ${money(total)} — much ${direction} than this vendor's usual ${money(avg)}.`,
      date: row.txn_date,
      amount: total,
    };
  });
}

/** Low-severity, informational: an entry dated on a weekend is usually fine, but occasionally means a typo in the date. */
async function findWeekendEntries(): Promise<Anomaly[]> {
  const db = getDb();
  const rows = await db.execute<{ kind: string; ref: string | null; txn_date: string }>(sql`
    SELECT 'invoice' AS kind, doc_number AS ref, txn_date::text AS txn_date FROM invoices
      WHERE EXTRACT(DOW FROM txn_date) IN (0, 6)
        AND txn_date >= CURRENT_DATE - ${WEEKEND_LOOKBACK_DAYS}::int
    UNION ALL
    SELECT 'bill' AS kind, doc_number AS ref, txn_date::text AS txn_date FROM bills
      WHERE EXTRACT(DOW FROM txn_date) IN (0, 6)
        AND txn_date >= CURRENT_DATE - ${WEEKEND_LOOKBACK_DAYS}::int
    UNION ALL
    SELECT 'expense' AS kind, doc_number AS ref, txn_date::text AS txn_date FROM expenses
      WHERE EXTRACT(DOW FROM txn_date) IN (0, 6)
        AND txn_date >= CURRENT_DATE - ${WEEKEND_LOOKBACK_DAYS}::int
    ORDER BY txn_date DESC
    LIMIT ${MAX_ROWS_PER_DETECTOR}
  `);
  return rows.map((row) => ({
    id: `weekend:${row.kind}:${row.ref}:${row.txn_date}`,
    severity: 'low',
    category: 'Weekend-dated entry',
    description: `${capitalize(row.kind)} ${row.ref ?? '(no number)'} is dated on a weekend — worth confirming the date is correct.`,
    date: row.txn_date,
  }));
}
