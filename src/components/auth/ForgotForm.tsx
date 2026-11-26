'use client';

import { useState } from 'react';

/** Asks for the email, then says a link is on its way. The same message appears whether or not the email has an account. */
export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const asked = email.trim();
    try {
      const res = await fetch('/api/auth/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: asked }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || 'That did not work. Please try again.');
      setSentTo(asked);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div className="mt-5 space-y-4" aria-live="polite">
        <p className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
          If <b className="break-all">{sentTo}</b> has an account here, we have emailed it a link to choose a new password. The link works once and expires in 24 hours.
        </p>
        <p className="text-xs text-slate-500">
          It can take a few minutes to arrive, so check your spam folder. If nothing comes, wait two minutes and ask again, or{' '}
          <button type="button" onClick={() => { setSentTo(null); setEmail(''); }} className="font-medium text-brand-600 hover:underline">use a different email</button>.
        </p>
        <a href="/login" className="inline-block text-sm font-medium text-brand-600 hover:underline">Back to sign in</a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <div aria-live="polite">{error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}</div>
      <div>
        <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
        <input
          id="forgot-email"
          type="email"
          required
          autoFocus
          autoComplete="username email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
        />
      </div>
      <button type="submit" disabled={busy || !email.trim()} className="w-full rounded-lg push push-navy bg-royal-gradient px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
        {busy ? 'Sending…' : 'Send reset link'}
      </button>
      <a href="/login" className="inline-block text-sm font-medium text-brand-600 hover:underline">Back to sign in</a>
    </form>
  );
}
