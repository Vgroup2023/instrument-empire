'use client';

import { openCommandPalette } from './KeyboardShortcuts';

export function SearchButton() {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      aria-label="Search pages (Ctrl or Command K)"
      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-slate-50"
    >
      <span aria-hidden>🔍</span>
      <span className="hidden sm:inline">Search</span>
      <kbd className="hidden rounded border border-white/20 px-1.5 text-xs text-slate-400 lg:inline">Ctrl K</kbd>
    </button>
  );
}
