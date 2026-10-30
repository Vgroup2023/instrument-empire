'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

export function PasswordChangeForm() {
  const { notify } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== again) return setError('The two new passwords do not match.');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current, next }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || 'Could not change the password.');
      setCurrent(''); setNext(''); setAgain('');
      notify('Password changed. Other devices were signed out.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div><Label htmlFor="cur">Current password</Label><Input id="cur" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
      <div><Label htmlFor="new">New password</Label><Input id="new" type="password" required minLength={10} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
      <div><Label htmlFor="again">New password again</Label><Input id="again" type="password" required autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></div>
      <Button type="submit" loading={busy}>Change password</Button>
    </form>
  );
}
