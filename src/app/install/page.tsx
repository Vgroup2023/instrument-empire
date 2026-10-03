import type { Metadata } from 'next';
import { InstallButton } from '@/components/InstallButton';

export const metadata: Metadata = { title: 'Install GloblexAI Office ERP' };

const steps = [
  { device: 'Windows or Mac (Chrome, Edge)', how: 'Click Install app above, or use the install icon at the right end of the address bar.' },
  { device: 'Android (Chrome)', how: 'Tap Install app above, or the ⋮ menu, then Install app.' },
  { device: 'iPhone and iPad (Safari)', how: 'Tap Share, then Add to Home Screen, then Add.' },
  { device: 'Mac (Safari)', how: 'File menu, then Add to Dock.' },
];

export default function InstallPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Install GloblexAI Office ERP</h1>
        <p className="mt-2 text-sm text-slate-600">
          Runs in its own window with an icon on your desktop or home screen. Your six AI agents keep working on the server, so you can open the app any time and see what they found.
        </p>
      </div>
      <InstallButton />
      <ul className="divide-y divide-slate-200 rounded-xl2 border border-slate-200 bg-white">
        {steps.map((s) => (
          <li key={s.device} className="px-4 py-3">
            <div className="text-sm font-medium text-slate-900">{s.device}</div>
            <div className="text-sm text-slate-600">{s.how}</div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">You still sign in with your passphrase. The app needs a connection to show live data.</p>
    </main>
  );
}
