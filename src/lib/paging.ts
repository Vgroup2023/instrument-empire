// Shared by the long list tabs (Invoices, Bills, Estimates, Expenses, Journal
// entries). A tab opens with the newest PAGE_SIZE rows and the person loads
// more on request, so a ledger with tens of thousands of rows opens as fast
// as an empty one. A request without `limit` still returns everything, which
// keeps scripts and reports working unchanged.

export const PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 1000;

export interface Page<T> {
  items: T[];
  total: number;
}

/** Reads ?limit= and ?offset= from a URL. Returns null when no limit was asked for (meaning: everything). Bad values are clamped, never an error. */
export function parsePaging(params: URLSearchParams): { limit: number; offset: number } | null {
  const rawLimit = params.get('limit');
  if (rawLimit === null) return null;
  const limit = Math.min(Math.max(Math.trunc(Number(rawLimit)) || PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const offset = Math.max(Math.trunc(Number(params.get('offset'))) || 0, 0);
  return { limit, offset };
}
