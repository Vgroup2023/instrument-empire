'use client';

import { useId, useState } from 'react';

/** Passphrase input with a show/hide toggle. Still a plain form field, so sign-in works without JavaScript. */
export function PasswordField({ invalid }: { invalid: boolean }) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        Passphrase
      </label>
      <div className="relative">
        <input
          id={id}
          name="password"
          type={shown ? 'text' : 'password'}
          required
          autoFocus
          autoComplete="current-password"
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 pr-16 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 aria-[invalid=true]:border-red-400"
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          className="absolute inset-y-0 right-0 rounded-r-lg px-3 text-xs font-medium text-slate-500 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}
