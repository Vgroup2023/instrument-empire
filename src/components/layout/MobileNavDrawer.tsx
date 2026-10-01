'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { NavLinksList } from './NavLinksList';

// Below the lg breakpoint (phones and tablets), the full always-visible
// Sidebar is hidden and this hamburger + slide-in drawer takes its place —
// same grouped nav links, just collapsed until opened, so the top bar stays
// a single compact row instead of a second horizontal tab strip.
export function MobileNavDrawer() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal can only mount client-side, after hydration
  useEffect(() => setMounted(true), []);

  // Close once a navigation actually completes (pathname changes) rather
  // than from the nav link's own onClick — closing in the same click event
  // unmounts the <Link> mid-click and can race Next's own client-side
  // transition, silently swallowing the navigation.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- closing the drawer is a response to the route changing, not a derived-state sync
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className="rounded-lg p-2 text-slate-200 hover:bg-white/10 lg:hidden"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {mounted && open
        ? createPortal(
            <div className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
                className="safe-top safe-bottom absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-header-gradient shadow-xl"
              >
                <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/globlex-ai-logo.webp"
                    alt="Globlex AI — The AI Architect Co."
                    className="h-10 w-auto min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close navigation menu"
                    className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10"
                  >
                    ✕
                  </button>
                </div>
                <NavLinksList />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
