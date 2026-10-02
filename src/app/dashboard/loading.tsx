// Next shows this the moment a dashboard page starts rendering, so the browser
// gets bytes straight away. Without it, a page waiting on a slow database sends
// nothing at all, and the host reports "Inactivity Timeout".
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-4">
      <div className="h-6 w-48 rounded bg-slate-200" />
      <div className="h-4 w-80 max-w-full rounded bg-slate-100" />
      <div className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl2 border border-slate-200 bg-slate-50" />
        ))}
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
