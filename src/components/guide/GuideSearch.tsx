'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

interface Entry {
  id: string;
  /** The section (nearest heading) this text sits under. */
  section: string;
  text: string;
  isHeading: boolean;
}

const MAX_RESULTS = 8;

/**
 * Quick search for the guide. It reads the rendered guide in the page (the .docx is converted to HTML on the
 * server), so there is no second copy of the text to keep in step. Type, pick a result from the drop-down, and
 * the page scrolls to it. Shown above the guide and again at the bottom, so it is within reach at either end.
 */
export function GuideSearch({ articleId, label }: { articleId: string; label: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Read the guide the first time the box is used, so the page itself is not slowed by it.
  function loadEntries() {
    if (entries.length) return;
    const article = document.getElementById(articleId);
    if (!article) return;
    const found: Entry[] = [];
    let section = 'Introduction';
    article.querySelectorAll<HTMLElement>('h1, h2, h3, p, li, td').forEach((el, i) => {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      const isHeading = /^H[1-3]$/.test(el.tagName);
      if (isHeading) section = text;
      if (!el.id) el.id = `${articleId}-${i}`;
      found.push({ id: el.id, section, text, isHeading });
    });
    setEntries(found);
  }

  useEffect(() => {
    function away(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const scored: { entry: Entry; score: number }[] = [];
    for (const entry of entries) {
      const hay = entry.text.toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
      // Headings first, then the shortest (most specific) lines.
      scored.push({ entry, score: (entry.isHeading ? 0 : 1000) + hay.length });
    }
    return scored.sort((a, b) => a.score - b.score).slice(0, MAX_RESULTS).map((s) => s.entry);
  }, [entries, query]);

  function go(entry: Entry) {
    const el = document.getElementById(entry.id);
    setOpen(false);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('bg-gold-100');
    setTimeout(() => el.classList.remove('bg-gold-100'), 2200);
  }

  function snippet(text: string) {
    const first = query.toLowerCase().split(/\s+/).filter(Boolean)[0] ?? '';
    const at = Math.max(text.toLowerCase().indexOf(first) - 30, 0);
    return (at > 0 ? '…' : '') + text.slice(at, at + 90) + (text.length > at + 90 ? '…' : '');
  }

  return (
    <div ref={boxRef} className="relative mx-auto w-full max-w-3xl">
      <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor={`${listId}-input`}>
        {label}
      </label>
      <input
        id={`${listId}-input`}
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        placeholder="Search the guide, e.g. invoice, payroll, sign in…"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        onChange={(e) => {
          loadEntries();
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          loadEntries();
          setOpen(true);
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
            go(results[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && query.trim() ? (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">No match. Try a shorter word.</li>
          ) : (
            results.map((r, i) => (
              <li key={r.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={cn('block w-full px-3 py-2 text-left text-sm hover:bg-slate-50', i === active && 'bg-slate-50')}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r)}
                >
                  <span className="block text-xs font-semibold uppercase tracking-wide text-brand-700">{r.section}</span>
                  <span className={cn('block text-slate-700', r.isHeading && 'font-medium text-slate-900')}>{snippet(r.text)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
