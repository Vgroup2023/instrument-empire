'use client';

import { useState } from 'react';
import { MAX_PAGE_SIZE, PAGE_SIZE } from '@/lib/paging';

/**
 * State for a long list tab that opens with its newest rows and loads more
 * on request. `refresh` reloads everything loaded so far (so an edit never
 * collapses the list back to the first page).
 */
export function usePagedList<T extends { Id: string }, Meta = unknown>(
  endpoint: string,
  key: string,
  initial: T[],
  initialTotal: number,
  /** Extra URL parameters such as `status=unpaid`, for a list that can be filtered on the server. */
  initialQuery = '',
  initialMeta?: Meta,
) {
  const [items, setItems] = useState(initial);
  const [total, setTotal] = useState(initialTotal);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQueryState] = useState(initialQuery);
  const [meta, setMeta] = useState<Meta | undefined>(initialMeta);

  async function fetchPage(limit: number, offset: number, q = query): Promise<{ rows: T[]; total: number } | null> {
    const res = await fetch(`${endpoint}?limit=${limit}&offset=${offset}${q ? `&${q}` : ''}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.counts !== undefined) setMeta(data.counts as Meta);
    return { rows: data[key] as T[], total: typeof data.total === 'number' ? data.total : (data[key] as T[]).length };
  }

  /** Switches the filter and shows the first page of the new view. Returns false when it could not load, leaving the old view. */
  async function setQuery(q: string): Promise<boolean> {
    const page = await fetchPage(PAGE_SIZE, 0, q);
    if (!page) return false;
    setQueryState(q);
    setItems(page.rows);
    setTotal(page.total);
    return true;
  }

  async function refresh(): Promise<T[] | null> {
    const page = await fetchPage(Math.min(Math.max(items.length, PAGE_SIZE), MAX_PAGE_SIZE), 0);
    if (!page) return null;
    setItems(page.rows);
    setTotal(page.total);
    return page.rows;
  }

  async function loadMore(): Promise<boolean> {
    setLoadingMore(true);
    try {
      const page = await fetchPage(PAGE_SIZE, items.length);
      if (!page) return false;
      setItems((current) => {
        const seen = new Set(current.map((row) => row.Id));
        return [...current, ...page.rows.filter((row) => !seen.has(row.Id))];
      });
      setTotal(page.total);
      return true;
    } finally {
      setLoadingMore(false);
    }
  }

  return { items, total, meta, query, setQuery, hasMore: items.length < total, loadingMore, refresh, loadMore };
}
