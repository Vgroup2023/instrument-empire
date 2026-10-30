'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw !== again) return setError('The two passwords do not match.');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: pw }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || 'That did not work. Please try again.');
      router.replace('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Please try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <div aria-live="polite">{error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}</div>
      <div>
        <label htmlFor="pw1" className="mb-1.5 block text-sm font-medium text-slate-700">New password</label>
        <input id="pw1" type="password" required minLength={10} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus value={pw} onChange={(e) => setPw(e.target.value)} className={field} />
        <p className="mt-1 text-xs text-slate-500">At least 10 characters. A few random words work well.</p>
      </div>
      <div>
        <label htmlFor="pw2" className="mb-1.5 block text-sm font-medium text-slate-700">Type it again</label>
        <input id="pw2" type="password" required autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={again} onChange={(e) => setAgain(e.target.value)} className={field} />
      </div>
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-royal-gradient px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
        {busy ? 'Saving…' : 'Save password and sign in'}
      </button>
    </form>
  );
}
