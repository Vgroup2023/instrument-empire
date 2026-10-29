'use client';

import { useEffect, useRef, useState } from 'react';
import { wfCall } from './api';

interface Result {
  action: 'in' | 'out';
  name: string;
  at: string;
  shiftHours?: number;
  weekHours: number;
}

const KEY = 'clock-staff-id';

export function ClockClient() {
  const [staffCode, setStaffCode] = useState('');
  const [pin, setPin] = useState('');
  const [meal, setMeal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Remember the staff ID (never the PIN) on this phone so it is one less thing to type.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage can only happen after hydration
      if (saved) setStaffCode(saved);
    } catch {
      /* private window: fine */
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const r = await wfCall<{ result: Result }>('/api/clock', 'POST', { staffCode, pin, mealMinutes: meal === '' ? undefined : Number(meal) });
      setResult(r.result);
      try {
        localStorage.setItem(KEY, staffCode.trim().toUpperCase());
      } catch {
        /* ignore */
      }
      // Hide the result after a while: the next person to pick up the phone should not see it.
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setResult(null), 20_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPin('');
      setMeal('');
      setBusy(false);
    }
  }

  const time = result ? new Date(result.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-8">
      <h1 className="mb-1 text-center text-2xl font-semibold text-slate-900">Time clock</h1>
      <p className="mb-6 text-center text-sm text-slate-500">Enter your staff ID and PIN. If you are clocked in, this clocks you out.</p>
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label htmlFor="staff" className="mb-1 block text-sm font-medium text-slate-700">Staff ID</label>
          <input id="staff" value={staffCode} onChange={(e) => setStaffCode(e.target.value.toUpperCase())} autoComplete="off" autoCapitalize="characters" maxLength={20}
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
        </div>
        <div>
          <label htmlFor="pin" className="mb-1 block text-sm font-medium text-slate-700">PIN</label>
          <input id="pin" type="password" inputMode="numeric" pattern="[0-9]*" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete="off" maxLength={8}
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg tracking-widest outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
        </div>
        <div>
          <label htmlFor="meal" className="mb-1 block text-sm font-medium text-slate-700">Meal break taken, in minutes <span className="font-normal text-slate-400">(only when clocking out)</span></label>
          <input id="meal" inputMode="numeric" value={meal} onChange={(e) => setMeal(e.target.value.replace(/\D/g, ''))} maxLength={3} placeholder="30"
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
        </div>
        <button type="submit" disabled={busy || !staffCode || pin.length < 4}
          className="w-full rounded-lg bg-royal-gradient px-4 py-3.5 text-lg font-semibold text-white hover:brightness-110 disabled:opacity-50">
          {busy ? 'One moment…' : 'Clock in / out'}
        </button>
      </form>
      <div aria-live="polite" className="mt-4">
        {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {result ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
            <p className="text-lg font-semibold">{result.action === 'in' ? 'Clocked in' : 'Clocked out'}, {result.name}</p>
            <p className="text-sm">at {time}{result.shiftHours !== undefined ? `. This shift: ${result.shiftHours.toFixed(2)} hours.` : '.'} This week so far: {result.weekHours.toFixed(2)} hours.</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
