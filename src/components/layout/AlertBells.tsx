'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { NavIcon } from './NavIcon';

// Two bells like a mail and alerts tray: urgent findings from the agents, and work waiting on a person.
// The counts are fetched after the page has shown, so the top bar never holds a page back.
export function AlertBells() {
  const [counts, setCounts] = useState<{ urgent: number; waiting: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/dashboard/alerts', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setCounts(d))
        .catch(() => {});
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const bell = (href: string, label: string, n: number, icon: string) => (
    <Link prefetch={false} href={href} aria-label={n ? `${label}: ${n}` : label} className="relative rounded-lg p-2 text-[#0f2447] hover:bg-slate-100">
      <NavIcon name={icon} size={22} />
      {n > 0 ? (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">{n > 99 ? '99+' : n}</span>
      ) : null}
    </Link>
  );
  return (
    <div className="flex items-center">
      {bell('/dashboard/agents', 'Urgent agent findings', counts?.urgent ?? 0, 'bell')}
      {bell('/dashboard/orders', 'Work waiting on you', counts?.waiting ?? 0, 'inbox')}
    </div>
  );
}
