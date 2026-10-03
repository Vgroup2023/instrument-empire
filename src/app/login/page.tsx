import { redirect } from 'next/navigation';
import { BRAND } from '@/lib/brand';
import { getClientSystems } from '@/config/clientSystems';
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

  const clients = getClientSystems();

  return (
    <div className="safe-top safe-bottom min-h-dvh bg-silver-black px-4 py-10 lg:py-14">
      {/* On a phone the order is headline, sign-in, then the details, so signing in is never buried. */}
      <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-8 lg:grid-cols-[1.15fr_1fr]">
        <header className="text-center lg:col-start-1 lg:row-start-1 lg:text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/globlex-logo-520.v1.webp"
            width={520}
            height={347}
            fetchPriority="high"
            alt="Globlex AI — The AI Architect Co."
            className="mx-auto mb-5 w-full min-w-0 max-w-[220px] lg:mx-0"
          />
          <p className="text-sm font-semibold uppercase tracking-widest text-sky-300">{BRAND.tagline}</p>
          <p className="mt-1 text-lg font-semibold text-slate-200">{BRAND.name}</p>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">{BRAND.headline}</h1>
        </header>

        <main className="mx-auto w-full max-w-sm self-start rounded-xl2 bg-white p-8 shadow-xl lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-6 lg:max-w-md">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-900">Sign in</h2>
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

          <p className="mt-6 text-xs text-slate-500">
            This app uses one shared passphrase for the whole team. Ask your administrator if you don&apos;t have it.
          </p>
        </main>

        <section aria-label="What it does" className="lg:col-start-1 lg:row-start-2">
          <p className="mx-auto max-w-xl text-center text-base leading-relaxed text-slate-200 lg:mx-0 lg:text-left">{BRAND.intro}</p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {BRAND.pillars.map((p) => (
              <li key={p.title} className="rounded-xl2 border border-white/15 bg-black/30 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-white">
                  <span aria-hidden>{p.icon}</span>
                  {p.title}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{p.body}</p>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-center text-sm text-slate-300 lg:text-left">
            <span className="font-semibold text-white">{BRAND.trust}</span> {BRAND.trustDetail}
          </p>
        </section>
      </div>

      <section aria-labelledby="erp-heading" className="mx-auto mt-14 max-w-6xl">
        <h2 id="erp-heading" className="text-center text-xl font-semibold text-white lg:text-left">
          Connect to your business ERP
        </h2>
        <p className="mt-1 text-center text-sm text-slate-300 lg:text-left">
          Globlex AI clients: open your business&apos;s master ERP system directly.
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <li key={c.id}>
              {c.href ? (
                <a
                  href={c.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex h-full flex-col justify-between gap-3 rounded-xl2 border border-sky-300/40 bg-black/30 p-4 transition hover:border-sky-300 hover:bg-black/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
                >
                  <span>
                    <span className="block text-base font-semibold text-white">{c.name}</span>
                    <span className="mt-0.5 block text-sm text-slate-300">{c.descriptor}</span>
                  </span>
                  <span className="text-sm font-semibold text-sky-300 group-hover:underline">Open ERP →</span>
                </a>
              ) : (
                <div className="flex h-full flex-col justify-between gap-3 rounded-xl2 border border-white/15 bg-black/20 p-4">
                  <span>
                    <span className="block text-base font-semibold text-white">{c.name}</span>
                    <span className="mt-0.5 block text-sm text-slate-300">{c.descriptor}</span>
                  </span>
                  <span className="text-sm text-slate-300">Link coming soon</span>
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-center text-sm text-slate-300 lg:text-left">
          Don&apos;t see your business? Ask your Globlex AI administrator to add your connection.
        </p>
      </section>

      <footer className="mx-auto mt-12 flex max-w-6xl flex-col items-center gap-2 text-sm text-slate-300 lg:flex-row lg:justify-between">
        <span>{BRAND.byline}</span>
        <a href="/install" className="underline-offset-4 hover:text-white hover:underline">
          Install the app on this device
        </a>
      </footer>
    </div>
  );
}
