'use client';

import { useEffect, useState } from 'react';
import { OPTION_LIMIT } from '@/lib/optionSearch';

type Kind = 'customers' | 'vendors' | 'products';

/**
 * Drop-down items for a picker. A page sends the first OPTION_LIMIT alphabetically; when it sent a full
 * batch there may be more, so `capped` turns on a search box that asks the server for matches. The item
 * already chosen is fetched by id if it is not in the batch, so an older document still shows its customer.
 */
export function useRemoteOptions<T extends { Id: string }>(kind: Kind, initial: T[], value: string) {
  const capped = initial.length >= OPTION_LIMIT;
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<T[] | null>(null);
  const [chosen, setChosen] = useState<T | null>(null);
  const term = query.trim();

  useEffect(() => {
    if (!capped || !term) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/options/${kind}?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        const data = (await res.json()) as { items?: T[] };
        if (res.ok && data.items) setFound(data.items);
      } catch {
        // Offline or cancelled: keep showing what is already there.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [kind, capped, term]);

  const missing = Boolean(value) && !initial.some((x) => x.Id === value) && chosen?.Id !== value;
  useEffect(() => {
    if (!missing) return;
    const ctl = new AbortController();
    fetch(`/api/options/${kind}?id=${encodeURIComponent(value)}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((d: { items?: T[] }) => {
        if (d.items?.[0]) setChosen(d.items[0]);
      })
      .catch(() => {});
    return () => ctl.abort();
  }, [kind, value, missing]);

  const base = term && found ? found : initial;
  const items = chosen && chosen.Id === value && !base.some((x) => x.Id === value) ? [chosen, ...base] : base;
  return { items, capped, query, setQuery };
}
