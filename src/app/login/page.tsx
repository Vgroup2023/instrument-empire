import { redirect } from 'next/navigation';
import { BRAND } from '@/lib/brand';
import { PasswordField } from '@/components/auth/PasswordField';
import { AccountFields } from '@/components/auth/AccountFields';
import { getCurrentUser, legacyAllowed } from '@/lib/auth/current';
import { safeNext } from '@/lib/safeNext';
import { ssoConfig } from '@/lib/auth/sso';

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
  const isConfigError = params.error === 'config';
  const isAccountError = params.error === 'account';
  const isPassphraseOff = params.error === 'passphrase_off';

  // Already signed in: skip the form.
  let signedIn = false;
  try {
    signedIn = (await getCurrentUser()) !== null;
  } catch {
    // SESSION_SECRET missing or cookie unreadable: show the form.
  }
  if (signedIn) redirect(next);

  // Once people have their own accounts the shared passphrase is switched off; sign-in is by email and password.
  let accounts = false;
  try {
    accounts = (await legacyAllowed()).anyUsers;
  } catch {
    // The database is unreachable: fall back to the passphrase form so the owner is never locked out.
  }
  const sso = ssoConfig();
  const isSsoError = params.error === 'sso';
  const isSsoNoAccount = params.error === 'sso_no_account';
  const passphraseWorks = !accounts || process.env.PASSPHRASE_LOGIN === 'on';

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
            <p className="mt-1 text-sm text-slate-500">{accounts ? 'Use your email and password.' : 'Enter the passphrase to open your workspace.'}</p>
          </div>

          <div aria-live="polite">
            {isConfigError ? (
              <p id="login-error" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                Sign-in is not set up on the server (APP_PASSWORD or SESSION_SECRET is missing). Ask your administrator to check the environment settings and redeploy.
              </p>
            ) : isRateLimited ? (
              <p id="login-error" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                Too many attempts. Wait a few minutes before trying again.
              </p>
            ) : isPassphraseOff ? (
              <p id="login-error" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                The shared passphrase has been switched off. Sign in with your own email and password.
              </p>
            ) : isSsoNoAccount ? (
              <p id="login-error" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                That account is not set up here. Ask your administrator to add you, then try again.
              </p>
            ) : isSsoError ? (
              <p id="login-error" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                Single sign-on did not work. Try again, or use your email and password.
              </p>
            ) : isAccountError ? (
              <p id="login-error" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                That email and password do not match an active account.
              </p>
            ) : hasError ? (
              <p id="login-error" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                That passphrase isn&apos;t right. Try again.
              </p>
            ) : null}
          </div>

          {sso ? (
            <div className={accounts ? 'mb-5' : 'mb-5 border-b border-slate-200 pb-5'}>
              <a
                href={`/api/auth/sso/start?next=${encodeURIComponent(next)}`}
                className="flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                Sign in with {sso.name}
              </a>
              {accounts ? <p className="mt-3 text-center text-xs text-slate-500">or use your email and password</p> : null}
            </div>
          ) : null}

          {accounts ? (
            <form action="/api/login" method="POST" className="space-y-4">
              <input type="hidden" name="next" value={next} />
              <AccountFields invalid={isAccountError} />
              <button
                type="submit"
                className="w-full rounded-lg bg-royal-gradient px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                Sign in
              </button>
              <p className="text-xs text-slate-500">Forgot your password? Ask your administrator for a new link.</p>
            </form>
          ) : null}

          {passphraseWorks ? (
            <details open={!accounts} className={accounts ? 'mt-5 border-t border-slate-200 pt-4' : ''}>
              {accounts ? <summary className="cursor-pointer text-xs font-medium text-slate-500">Use the shared passphrase instead</summary> : null}
              <form action="/api/login" method="POST" className="mt-3 space-y-4">
                <input type="hidden" name="next" value={next} />
                <PasswordField invalid={hasError} />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-royal-gradient px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  Sign in
                </button>
              </form>
              {!accounts ? (
                <p className="mt-6 text-xs text-slate-500">
                  This app uses one shared passphrase until you set up accounts. Once you are in, open <b>Team</b> to create your own account and add your people.
                </p>
              ) : null}
            </details>
          ) : null}
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
          {BRAND.connections.heading}
        </h2>
        <p className="mx-auto mt-1 max-w-3xl text-center text-sm leading-relaxed text-slate-300 lg:mx-0 lg:text-left">
          {BRAND.connections.statement}
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BRAND.connections.items.map((c) => (
            <li key={c.title} className="rounded-xl2 border border-white/15 bg-black/30 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                <span aria-hidden>{c.icon}</span>
                {c.title}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{c.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-center text-sm text-slate-300 lg:text-left">{BRAND.connections.note}</p>
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
