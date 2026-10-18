'use client';

// Shown instead of Next's generic "This page couldn't load" so a failure says what happened.
// The reference code matches the line in the host's function logs.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-lg font-semibold text-slate-900">This page hit a problem</h1>
      <p className="mt-2 text-sm text-slate-600">Try again. If it keeps happening, send support the reference below.</p>
      {error.digest ? <p className="mt-3 break-all rounded bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700">Reference: {error.digest}</p> : null}
      <div className="mt-5 flex justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Try again</button>
        <a href="/login" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Back to sign in</a>
      </div>
    </div>
  );
}
