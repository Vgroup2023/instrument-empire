import { NextRequest, NextResponse } from 'next/server';
import { createAppSessionCookie } from '@/lib/session';
import { getAppPassword } from '@/lib/config';
import { clearAttempts, getClientKey, isRateLimited, recordFailedAttempt } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  const next = String(form.get('next') ?? '/dashboard');
  const clientKey = getClientKey(request);

  if (isRateLimited(clientKey)) {
    const url = new URL('/login', request.url);
    url.searchParams.set('error', 'rate_limited');
    url.searchParams.set('next', next);
    return NextResponse.redirect(url, { status: 303 });
  }

  let expected: string;
  try {
    expected = getAppPassword();
  } catch {
    return NextResponse.json(
      { error: 'APP_PASSWORD is not configured on the server.' },
      { status: 500 },
    );
  }

  if (password !== expected) {
    recordFailedAttempt(clientKey);
    const url = new URL('/login', request.url);
    url.searchParams.set('error', '1');
    url.searchParams.set('next', next);
    return NextResponse.redirect(url, { status: 303 });
  }

  clearAttempts(clientKey);
  await createAppSessionCookie();
  const safeNext = next.startsWith('/') ? next : '/dashboard';
  return NextResponse.redirect(new URL(safeNext, request.url), { status: 303 });
}
