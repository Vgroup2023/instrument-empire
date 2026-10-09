import { sql } from 'drizzle-orm';
import type { Tx } from '@/lib/accounting/entryRules';

// Document numbers (INV-0042, BILL-0007 ...) must be unique and run in order.
//
// The next number is one more than the highest number already issued. It is
// worked out inside the same transaction that saves the document, while
// holding a lock for that document type, so two people saving at the same
// instant cannot be handed the same number, and a rolled-back save leaves no
// gap. (The old way counted the rows, which repeated numbers after any delete.)
// A milestone invoice such as INV-0007-M1 counts toward INV-0007.

export type DocKind = 'invoice' | 'estimate' | 'bill' | 'expense';

const TABLES: Record<DocKind, string> = {
  invoice: 'invoices',
  estimate: 'estimates',
  bill: 'bills',
  expense: 'expenses',
};

const LOCK_KEYS: Record<DocKind, number> = { invoice: 1, estimate: 2, bill: 3, expense: 4 };
const LOCK_NAMESPACE = 7100;

export async function nextDocNumber(tx: Tx, kind: DocKind, prefix: string): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_NAMESPACE}, ${LOCK_KEYS[kind]})`);
  const table = sql.raw(TABLES[kind]);
  const pattern = `^${prefix}-([0-9]+)`;
  const rows = await tx.execute<{ next: string }>(
    sql`select coalesce(max((substring(doc_number from ${pattern}))::bigint), 0) + 1 as next from ${table}`,
  );
  const next = Number(rows[0]?.next ?? 1);
  return `${prefix}-${String(next).padStart(4, '0')}`;
}
