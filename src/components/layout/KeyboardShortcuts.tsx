'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { allNavItems } from '@/components/layout/navGroups';
import { GO_BY_KEY, GO_SHORTCUTS, OTHER_SHORTCUTS, isTyping } from '@/lib/shortcuts';

const OPEN_EVENT = 'open-command-palette';
const CHORD_MS = 1200;

/** Opens the search window from anywhere (the top bar button uses this). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const [mode, setMode] = useState<'closed' | 'search' | 'help'>('closed');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState(false);
  const chordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const keyFor = useMemo(() => new Map(GO_SHORTCUTS.map((s) => [s.href, s.key.toUpperCase()])), []);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allNavItems;
    const words = q.split(/\s+/);
    return allNavItems.filter((i) => {
      const hay = `${i.label} ${i.description}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [query]);

  const close = useCallback(() => {
    setMode('closed');
    setQuery('');
    setActive(0);
  }, []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  const clearChord = useCallback(() => {
    if (chordTimer.current) clearTimeout(chordTimer.current);
    chordTimer.current = null;
    setPending(false);
  }, []);

  useEffect(() => {
    const open = () => setMode('search');
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  useEffect(() => {
    if (mode === 'search') inputRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMode((m) => (m === 'search' ? 'closed' : 'search'));
        return;
      }
      if (mode !== 'closed') {
        if (e.key === 'Escape') close();
        return;
      }
      // Never steal keys from a field, a window that is open, or a browser shortcut.
      if (isTyping(e.target) || mod || e.altKey || document.querySelector('[role="dialog"]')) return;

      if (chordTimer.current) {
        const target = GO_BY_KEY.get(e.key.toLowerCase());
        clearChord();
        if (target) {
          e.preventDefault();
          router.push(target.href);
        }
        return;
      }
      if (e.key === 'g') {
        setPending(true);
        chordTimer.current = setTimeout(clearChord, CHORD_MS);
      } else if (e.key === '/') {
        e.preventDefault();
        setMode('search');
      } else if (e.key === '?') {
        e.preventDefault();
        setMode('help');
      } else if (e.key === 'n') {
        const button = Array.from(document.querySelectorAll<HTMLButtonElement>('#app-scroll button')).find(
          (b) => !b.disabled && b.textContent?.trim().startsWith('+'),
        );
        if (button) {
          e.preventDefault();
          button.click();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mode, close, clearChord, router]);

  return (
    <>
      {pending ? (
        <div role="status" className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white shadow-lg">
          Go to… press a letter (? lists them)
        </div>
      ) : null}
      {mode !== 'closed' ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
          <div className="absolute inset-0 bg-slate-900/40" onClick={close} aria-hidden />
          {mode === 'search' ? (
            <div role="dialog" aria-modal="true" aria-label="Search pages" className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl2 bg-surface shadow-xl">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, results.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === 'Enter' && results[active]) {
                    e.preventDefault();
                    go(results[active].href);
                  }
                }}
                placeholder="Go to… invoices, bills, tax, reconcile"
                aria-label="Search pages"
                className="w-full border-b border-slate-200 bg-transparent px-4 py-3 text-base outline-none"
              />
              <ul className="max-h-[50dvh] overflow-y-auto py-1" role="listbox">
                {results.length === 0 ? <li className="px-4 py-3 text-sm text-slate-500">No page matches.</li> : null}
                {results.map((item, i) => (
                  <li key={item.href} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(item.href)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${i === active ? 'bg-slate-100' : ''}`}
                    >
                      <span aria-hidden>{item.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-slate-900">{item.label}</span>
                        <span className="block truncate text-xs text-slate-500">{item.description}</span>
                      </span>
                      {keyFor.get(item.href) ? <kbd className="rounded border border-slate-300 px-1.5 text-xs text-slate-500">G {keyFor.get(item.href)}</kbd> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="relative z-10 max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-xl2 bg-surface p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">Keyboard shortcuts</h2>
                <button type="button" onClick={close} className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
                  Close
                </button>
              </div>
              <ul className="mb-4 space-y-1.5 text-sm">
                {OTHER_SHORTCUTS.map((s) => (
                  <li key={s.keys} className="flex justify-between gap-3">
                    <span className="text-slate-700">{s.label}</span>
                    <kbd className="shrink-0 rounded border border-slate-300 px-1.5 text-xs text-slate-600">{s.keys}</kbd>
                  </li>
                ))}
              </ul>
              <h3 className="mb-1.5 text-sm font-semibold text-slate-900">Go to a page: press G, then</h3>
              <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {GO_SHORTCUTS.map((s) => (
                  <li key={s.key} className="flex justify-between gap-3">
                    <span className="text-slate-700">{s.label}</span>
                    <kbd className="shrink-0 rounded border border-slate-300 px-1.5 text-xs text-slate-600">{s.key.toUpperCase()}</kbd>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
