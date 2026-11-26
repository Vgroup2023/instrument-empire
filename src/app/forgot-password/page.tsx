import { BRAND } from '@/lib/brand';
import { ForgotForm } from '@/components/auth/ForgotForm';

// Built ahead of time like the sign-in page: it appears at once and asks the server only when the form is sent.
export const metadata = { title: 'Reset your password', robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f3f6fb] px-4 py-10">
      <main className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{BRAND.name}</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Reset your password</h1>
        <p className="mt-1 text-sm text-slate-500">Enter the email you sign in with. We will email you a link to choose a new password.</p>
        <ForgotForm />
      </main>
    </div>
  );
}
