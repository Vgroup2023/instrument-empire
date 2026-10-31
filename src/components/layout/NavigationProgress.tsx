'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Spinner } from '@/components/ui/Spinner';

/** How long a page may take before the spinner appears, in milliseconds. */
export const SLOW_AFTER_MS = 3000;
/** The indicator gives up after this long, so a navigation that never finishes cannot leave it showing forever. */
const GIVE_UP_AFTER_MS = 30_000;

type Nav = { id: number; from: string };

/**
 * Shows that something is happening between pages. From the moment a link is clicked or a form is sent, a thin bar runs
 * across the top (after a brief pause, so quick changes do not flash it). If the next page has not arrived after
 * three seconds, a spinner with a short message appears too, so nobody thinks the app has frozen.
 */
function Inner() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const key = `${pathname}?${search}`;
  const keyRef = useRef(key);
  const seq = useRef(0);
  const [nav, setNav] = useState<Nav | null>(null);
  const [slowId, setSlowId] = useState<number | null>(null);
  const [giveUpId, setGiveUpId] = useState<number | null>(null);

  // The page has changed, so whatever was loading is done. (Done on the next tick: it is a reaction to the page changing.)
  useEffect(() => {
    keyRef.current = key;
    const t = setTimeout(() => setNav(null), 0);
    return () => clearTimeout(t);
  }, [key]);

  useEffect(() => {
    function start() {
      seq.current += 1;
      setNav({ id: seq.current, from: keyRef.current });
    }
    // Links: a left click on a same-site link to a different page, not opened in a new tab or window.
    function onClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
      let url: URL;
      try { url = new URL(a.href, window.location.href); } catch { return; }
      if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    }
    // Forms the browser sends itself (the app's own fetch-based forms stop the default and are skipped).
    function onSubmit(e: SubmitEvent) {
      if (e.defaultPrevented) return;
      const form = e.target as HTMLFormElement | null;
      if (!form || (form.target && form.target !== '_self')) return;
      start();
    }
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit);
    };
  }, []);

  useEffect(() => {
    if (!nav) return;
    const slow = setTimeout(() => setSlowId(nav.id), SLOW_AFTER_MS);
    const giveUp = setTimeout(() => setGiveUpId(nav.id), GIVE_UP_AFTER_MS);
    return () => { clearTimeout(slow); clearTimeout(giveUp); };
  }, [nav]);

  const pending = nav !== null && nav.from === key && giveUpId !== nav.id;
  const slow = pending && slowId === nav.id;
  if (!pending) return null;

  return (
    <>
      <div aria-hidden className="nav-bar pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden print:hidden"><span /></div>
      {slow ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex justify-center px-4 print:hidden">
          <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl2 border border-slate-200 bg-white px-4 py-3 shadow-lg">
            <Spinner size={22} />
            <div>
              <p className="text-sm font-semibold text-slate-900">Loading…</p>
              <p className="text-xs text-slate-600">This is taking a little longer than usual. Thanks for waiting.</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function NavigationProgress() {
  // useSearchParams needs a Suspense boundary above it so static pages can still be built.
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
