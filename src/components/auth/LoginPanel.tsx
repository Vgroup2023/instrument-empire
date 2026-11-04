'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AccountFields } from '@/components/auth/AccountFields';
import { PasswordField } from '@/components/auth/PasswordField';
import { DEFAULT_LOGIN_MODE, type LoginMode } from '@/lib/auth/loginMode';
import { safeNext } from '@/lib/safeNext';

/**
 * The sign-in card. The page around it is built ahead of time and served from the network edge, so it appears at once
 * even when the server is asleep. This card starts as the normal email-and-password form, then (a moment later) asks
 * the server which form to show, whether single sign-on is on, and whether this browser is already signed in. That
 * request also wakes the server, so by the time someone has typed their password it is ready.
 */
export function LoginView({ error, next, mode }: { error: string | null; next: string; mode: LoginMode }) {
  const { accounts, passphraseWorks, sso } = mode;
  const hasError = error === '1';
  const isConfigError = error === 'config';
  const isRateLimited = error === 'rate_limited';
  const isAccountError = error === 'account';
  const isPassphraseOff = error === 'passphrase_off';
  const isOldPassphrase = error === 'old_passphrase';
  const isSsoError = error === 'sso';
  const isSsoNoAccount = error === 'sso_no_account';
  return (
    <>
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
      ) : isOldPassphrase ? (
        <p id="login-error" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          That is the <b>old shared passphrase</b>, which no longer works. Your phone or browser probably filled it in from its saved passwords. Tap <b>Clear</b>, then type your own email and password.
        </p>
      ) : isAccountError ? (
        <p id="login-error" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          That email and password do not match an active account. On a phone, tap <b>Show</b> to check the password, and make sure no capital letter or space was added.
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
        <details className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700">iPhone or iPad filling in the wrong email or password?</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Tap <b>Clear</b> above, then type your email and password by hand (tap <b>Show</b> to check it).</li>
            <li>To remove the old saved login: open <b>Settings</b>, then <b>Passwords</b>, search for <b>globlexus</b>, and delete the old entries.</li>
            <li>After you sign in, choose <b>Save Password</b> when Safari offers, so the right one is filled in next time.</li>
          </ol>
        </details>
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
    </>
  );
}

function Live() {
  const params = useSearchParams();
  const router = useRouter();
  const error = params.get('error');
  const next = safeNext(params.get('next'));
  const [mode, setMode] = useState<LoginMode>(DEFAULT_LOGIN_MODE);

  useEffect(() => {
    let live = true;
    fetch('/api/auth/mode', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: (LoginMode & { signedIn?: boolean }) | null) => {
        if (!live || !m) return;
        // Already signed in: skip the form.
        if (m.signedIn) { router.replace(next); return; }
        setMode({ accounts: m.accounts, passphraseWorks: m.passphraseWorks, sso: m.sso });
      })
      .catch(() => { /* keep the normal form */ });
    return () => { live = false; };
  }, [next, router]);

  return <LoginView error={error} next={next} mode={mode} />;
}

export function LoginPanel() {
  // useSearchParams needs a Suspense boundary above it so the page can be built ahead of time; what is shown until then
  // is the normal form, in the page itself, so it works even before any script has run.
  return (
    <Suspense fallback={<LoginView error={null} next="/dashboard" mode={DEFAULT_LOGIN_MODE} />}>
      <Live />
    </Suspense>
  );
}
