'use client';

import { useId, useState } from 'react';

/** Email and password fields for signing in to your own account. Still plain form fields, so it works without JavaScript. */
export function AccountFields({ invalid }: { invalid: boolean }) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 aria-[invalid=true]:border-red-400';
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${id}-email`} className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
        <input id={`${id}-email`} name="email" type="email" required autoFocus autoComplete="username" aria-invalid={invalid} className={field} />
      </div>
      <div>
        <label htmlFor={`${id}-pw`} className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
        <div className="relative">
          <input id={`${id}-pw`} name="password" type={shown ? 'text' : 'password'} required autoComplete="current-password" aria-invalid={invalid} className={`${field} pr-16`} />
          <button type="button" onClick={() => setShown((s) => !s)} aria-pressed={shown} className="absolute inset-y-0 right-0 rounded-r-lg px-3 text-xs font-medium text-slate-500 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
            {shown ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
    </div>
  );
}
