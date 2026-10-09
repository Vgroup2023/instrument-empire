'use client';

import { useState } from 'react';
import { MAX_PAGE_SIZE, PAGE_SIZE } from '@/lib/paging';

/**
 * State for a long list tab that opens with its newest rows and loads more
 * on request. `refresh` reloads everything loaded so far (so an edit never
 * collapses the list back to the first page).
 */
export function usePagedList<T extends { Id: string }>(endpoint: string, key: string, initial: T[], initialTotal: number) {
  const [items, setItems] = useState(initial);
  const [total, setTotal] = useState(initialTotal);
  const [loadingMore, setLoadingMore] = useState(false);

  async function fetchPage(limit: number, offset: number): Promise<{ rows: T[]; total: number } | null> {
    const res = await fetch(`${endpoint}?limit=${limit}&offset=${offset}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return { rows: data[key] as T[], total: typeof data.total === 'number' ? data.total : (data[key] as T[]).length };
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

  return { items, total, hasMore: items.length < total, loadingMore, refresh, loadMore };
}
