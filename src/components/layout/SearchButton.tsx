'use client';

import { openCommandPalette } from './KeyboardShortcuts';
import { NavIcon } from './NavIcon';

/** The search box in the top bar. It opens the page search (the same one as Ctrl or Command K). */
export function SearchButton() {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      aria-label="Search pages (Ctrl or Command K)"
      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-100 hover:bg-white/10 md:w-64 md:justify-between md:border md:border-white/25 md:bg-white/10 md:px-3"
    >
      <span className="hidden text-[13px] md:inline">Search anything…</span>
      <NavIcon name="search" size={18} className="text-slate-200" />
    </button>
  );
}
