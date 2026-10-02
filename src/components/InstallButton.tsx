'use client';

import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type State = 'unknown' | 'ready' | 'installed' | 'unsupported';

/** Native install on Chrome/Edge/Android; other browsers get manual steps on /install. */
export function InstallButton({ className }: { className?: string }) {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [state, setState] = useState<State>('unknown');

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only check, must run after hydration
      setState('installed');
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
      setState('ready');
    };
    const onInstalled = () => setState('installed');
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    const t = setTimeout(() => setState((s) => (s === 'unknown' ? 'unsupported' : s)), 1500);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      clearTimeout(t);
    };
  }, []);

  if (state === 'installed') return <p className="text-sm text-emerald-700">Installed. Open it from your apps or home screen.</p>;
  if (state === 'ready' && event) {
    return (
      <button
        type="button"
        className={className ?? 'rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700'}
        onClick={async () => {
          await event.prompt();
          const choice = await event.userChoice;
          if (choice.outcome === 'accepted') setState('installed');
          setEvent(null);
        }}
      >
        Install app
      </button>
    );
  }
  if (state === 'unsupported') {
    return <p className="text-sm text-slate-600">Your browser has no one-tap install. Use the steps below for your device.</p>;
  }
  return <p className="text-sm text-slate-500">Checking whether this browser can install the app…</p>;
}
