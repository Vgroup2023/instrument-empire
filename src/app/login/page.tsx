import { redirect } from 'next/navigation';
import { BRAND } from '@/lib/brand';
import { PasswordField } from '@/components/auth/PasswordField';
import { isAppAuthenticated } from '@/lib/session';
import { safeNext } from '@/lib/safeNext';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const isRateLimited = params.error === 'rate_limited';
  const hasError = params.error === '1';

  // Already signed in: skip the form.
  let signedIn = false;
  try {
    signedIn = await isAppAuthenticated();
  } catch {
    // SESSION_SECRET missing or cookie unreadable: show the form.
  }
  if (signedIn) redirect(next);

  return (
    <div className="safe-top safe-bottom flex min-h-dvh flex-col items-center justify-center bg-silver-black px-4 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/globlex-logo-520.v1.webp" width={520} height={347} fetchPriority="high" alt="Globlex AI — The AI Architect Co." className="mb-5 w-full min-w-0 max-w-[260px]" />
      <div className="mb-8 max-w-sm text-center">
        <p className="text-2xl font-semibold text-white">{BRAND.name}</p>
        <p className="mt-1 text-sm font-semibold uppercase tracking-widest text-sky-300">{BRAND.tagline}</p>
        <p className="mt-2 text-sm text-slate-300">{BRAND.marketing}</p>
      </div>

      <main className="w-full max-w-sm rounded-xl2 bg-white p-8 shadow-xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Enter the passphrase to open your workspace.</p>
        </div>

        <form action="/api/login" method="POST" className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <PasswordField invalid={hasError} />
          <div aria-live="polite">
            {isRateLimited ? (
              <p id="login-error" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                Too many attempts. Wait a few minutes before trying again.
              </p>
            ) : hasError ? (
              <p id="login-error" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                That passphrase isn&apos;t right. Try again.
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-400">
          This app uses one shared passphrase for the whole team. Ask your administrator if you don&apos;t have it.
        </p>
      </main>

      <a href="/install" className="mt-6 text-sm text-slate-300 underline-offset-4 hover:text-white hover:underline">
        Install the app on this device
      </a>
    </div>
  );
}
