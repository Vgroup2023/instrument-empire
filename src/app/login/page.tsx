export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const next = searchParams.next ?? '/dashboard';
  const hasError = searchParams.error === '1';
  const isRateLimited = searchParams.error === 'rate_limited';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-muted px-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/globlex-ai-logo.webp" alt="Globlex AI — The AI Architect Co." className="mb-6 w-full max-w-xs" />
      <div className="w-full max-w-sm rounded-xl2 border border-slate-200 bg-surface p-8 shadow-card">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-slate-900">Accounts Copilot</h1>
          <p className="mt-1 text-sm text-slate-500">Internal financial insights &amp; actions app</p>
        </div>
        <form action="/api/login" method="POST" className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Passphrase
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              className="w-full rounded-lg border border-slate-300 bg-surface-muted px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          {isRateLimited ? (
            <p className="text-sm text-red-600">
              Too many attempts. Wait a few minutes before trying again.
            </p>
          ) : hasError ? (
            <p className="text-sm text-red-600">That passphrase isn&apos;t right. Try again.</p>
          ) : null}
          <button
            type="submit"
            className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
