import { sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

// Drop-down lists (customer, vendor, product) used to ship every row to the browser. They now ship the first
// OPTION_LIMIT alphabetically; past that the picker shows a search box that asks the server for matches.

export const OPTION_LIMIT = 200;
export const SEARCH_LIMIT = 50;

/** A case-insensitive "contains" match with % and _ taken literally. Undefined when there is nothing to match. */
export function containsMatch(column: PgColumn, q: string | undefined): SQL | undefined {
  const term = (q ?? '').trim().slice(0, 100);
  if (!term) return undefined;
  const escaped = term.replace(/[\\%_]/g, (c) => `\\${c}`);
  return sql`${column} ilike ${'%' + escaped + '%'}`;
}
