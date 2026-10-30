import { BRAND } from '@/lib/brand';
import { peekToken } from '@/lib/auth/service';
import { InviteForm } from '@/components/auth/InviteForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Set your password', robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let info: Awaited<ReturnType<typeof peekToken>> = null;
  let failed = false;
  try {
    info = await peekToken(token);
  } catch {
    failed = true;
  }
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f3f6fb] px-4 py-10">
      <main className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{BRAND.name}</p>
        {info ? (
          <>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">{info.kind === 'invite' ? `Welcome, ${info.name}` : 'Choose a new password'}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {info.kind === 'invite' ? 'Choose a password to finish setting up your account.' : 'Pick a new password for your account.'} You will sign in with <b>{info.email}</b>.
            </p>
            <InviteForm token={token} />
          </>
        ) : (
          <>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">{failed ? 'Could not check this link' : 'This link no longer works'}</h1>
            <p className="mt-2 text-sm text-slate-600">
              {failed ? 'Please try again in a moment.' : 'It may have expired or already been used. Ask your administrator for a new link.'}
            </p>
            <a href="/login" className="mt-5 inline-block text-sm font-medium text-brand-600 hover:underline">Go to sign in</a>
          </>
        )}
      </main>
    </div>
  );
}
