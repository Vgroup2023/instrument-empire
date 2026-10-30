'use client';

import { useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { type NavGroup } from './navGroups';

// Each section header is a button with an arrow that opens and closes the pages under it. Which
// sections are closed is remembered in this browser, so the menu comes back the way it was left.
// Everything starts open (and the server renders it open), so a first visit shows every page.

const STORE_KEY = 'nav-closed-sections-v1';
const listeners = new Set<() => void>();
let memory: string | null = null;

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
};

function read(): string {
  if (memory !== null) return memory;
  try {
    return localStorage.getItem(STORE_KEY) ?? '';
  } catch {
    return '';
  }
}

function write(value: string) {
  memory = value;
  try {
    localStorage.setItem(STORE_KEY, value);
  } catch {
    // Storage can be blocked (private windows). The menu still works for this visit.
  }
  listeners.forEach((l) => l());
}

const closedTitles = (raw: string) => new Set(raw ? raw.split('|') : []);

function isActive(pathname: string, href: string) {
  return href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);
}

function slug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

// Pages are fetched from the server when you open them. Starting that a moment early, when a pointer rests on a link or a
// finger touches it, means the page's loading screen is already there when you click, and the server has had a head start.
// Done per link on intent only, so loading the menu itself still makes no server calls.
const warmed = new Set<string>();

export function NavLinksList({ groups }: { groups: NavGroup[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const warm = (href: string) => {
    if (warmed.has(href)) return;
    warmed.add(href);
    router.prefetch(href);
  };
  const raw = useSyncExternalStore(subscribe, read, () => '');
  const closed = closedTitles(raw);

  // Going to a page inside a closed section opens that section, so the current page is never hidden.
  useEffect(() => {
    const current = closedTitles(read());
    const owner = groups.find((g) => g.items.some((i) => isActive(pathname, i.href)));
    if (owner && current.delete(owner.title)) write([...current].join('|'));
  }, [pathname, groups]);

  function toggle(title: string) {
    const next = closedTitles(read());
    if (!next.delete(title)) next.add(title);
    write([...next].join('|'));
  }

  return (
    <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-4" aria-label="Main menu">
      {groups.map((group) => (
        <Section key={group.title || 'root'} group={group} pathname={pathname} open={!closed.has(group.title)} onToggle={() => toggle(group.title)} onWarm={warm} />
      ))}
    </nav>
  );
}

function Section({ group, pathname, open, onToggle, onWarm }: { group: NavGroup; pathname: string; open: boolean; onToggle: () => void; onWarm: (href: string) => void }) {
  const id = `nav-section-${slug(group.title || 'root')}`;
  const hasActive = group.items.some((i) => isActive(pathname, i.href));
  return (
    <div>
      {group.title ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={id}
          className={cn(
            'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
            hasActive ? 'text-slate-100' : 'text-steel-500 hover:text-slate-100',
          )}
        >
          <span>{group.title}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={cn('shrink-0 transition-transform duration-200 motion-reduce:transition-none', open ? 'rotate-90' : 'rotate-0')}
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      ) : null}
      {/* A grid row that animates between 0fr and 1fr closes the section smoothly without measuring heights. */}
      <div
        id={id}
        className={cn('grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
        // Closed links must not be reachable with the Tab key either.
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-0.5 pb-1 pt-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  // No background prefetch: the menu has many links, and each prefetch
                  // was a server call fired the moment the page loaded.
                  prefetch={false}
                  key={item.href}
                  href={item.href}
                  onMouseEnter={() => onWarm(item.href)}
                  onFocus={() => onWarm(item.href)}
                  onTouchStart={() => onWarm(item.href)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition',
                    active ? 'bg-white/20 text-white shadow-sm ring-1 ring-white/25' : 'text-slate-200 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <span aria-hidden className="w-6 shrink-0 text-center text-[17px] leading-none">{item.icon}</span>
                  <span className="min-w-0 truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
