'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Shown when a dashboard section could not load. A first failure is usually a cold server that was still opening its
 * database connections, so it retries once on its own a moment later; after that the button is the only retry.
 */
export function RetryCard({ title, description }: { title: string; description: string }) {
  const router = useRouter();
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    let already = false;
    try {
      already = sessionStorage.getItem('insights-auto-retry') === '1';
      sessionStorage.setItem('insights-auto-retry', '1');
    } catch {
      already = true;
    }
    if (already) return;
    const t = setTimeout(() => router.refresh(), 1500);
    return () => clearTimeout(t);
  }, [router]);

  // A section that loads clears the flag, so the next failure gets its own automatic retry.
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl2 border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="max-w-sm text-sm text-slate-500">{description}</p>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="mt-2 rounded-lg bg-[#0a3d66] px-4 py-2 text-sm font-semibold text-white hover:bg-[#08304f]"
      >
        Try again
      </button>
    </div>
  );
}

/** Rendered when the section loaded fine: lets the next failure retry automatically again. */
export function ClearRetryFlag() {
  useEffect(() => {
    try {
      sessionStorage.removeItem('insights-auto-retry');
    } catch {
      // ignore
    }
  }, []);
  return null;
}
