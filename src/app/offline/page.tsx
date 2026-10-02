import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold text-slate-900">You&apos;re offline</h1>
      <p className="text-sm text-slate-600">
        GloblexAI Office ERP shows live data, so it needs a connection. Your agents keep running on the server. Reconnect and reload to see their latest findings.
      </p>
    </main>
  );
}
