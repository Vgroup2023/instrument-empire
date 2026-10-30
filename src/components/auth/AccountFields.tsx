'use client';

import { useId, useRef, useState } from 'react';

/** Email and password fields for signing in to your own account. Still plain form fields, so it works without JavaScript. */
export function AccountFields({ invalid }: { invalid: boolean }) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Empties both fields, including anything a phone filled in from its saved passwords.
  const clear = () => {
    box.current?.closest('form')?.reset();
    box.current?.querySelectorAll('input').forEach((i) => { i.value = ''; });
    setShown(false);
    box.current?.querySelector<HTMLInputElement>('input[name=email]')?.focus();
  };
  const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 aria-[invalid=true]:border-red-400';
  return (
    <div ref={box} className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={`${id}-email`} className="block text-sm font-medium text-slate-700">Email</label>
        <button type="button" onClick={clear} className="text-xs font-medium text-brand-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">Clear</button>
        </div>
        <input id={`${id}-email`} name="email" type="email" inputMode="email" required autoFocus autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={invalid} className={field} />
      </div>
      <div>
        <label htmlFor={`${id}-pw`} className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
        <div className="relative">
          <input id={`${id}-pw`} name="password" type={shown ? 'text' : 'password'} required autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={invalid} className={`${field} pr-16`} />
          <button type="button" onClick={() => setShown((s) => !s)} aria-pressed={shown} className="absolute inset-y-0 right-0 rounded-r-lg px-3 text-xs font-medium text-slate-500 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
            {shown ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
    </div>
  );
}
