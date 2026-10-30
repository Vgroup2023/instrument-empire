import { createHash, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { safeNext } from '@/lib/safeNext';
import { createAppSessionCookie, createUserSessionCookie } from '@/lib/session';
import { authenticate } from '@/lib/auth/service';
import { legacyAllowed } from '@/lib/auth/current';
import { getAppPassword } from '@/lib/config';
import { clearAttempts, getClientKey, isRateLimited, recordFailedAttempt } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Compares digests so the check takes the same time wherever a guess first differs. */
function samePassphrase(a: string, b: string): boolean {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  const next = safeNext(String(form.get('next') ?? ''));
  const clientKey = getClientKey(request);
  const emailField = form.get('email');

  // Signing in with your own account (email and password).
  if (typeof emailField === 'string') {
    const email = emailField.trim().toLowerCase();
    const keys = [clientKey, `acct:${email}`];
    if (keys.some(isRateLimited)) {
      const url = new URL('/login', request.url);
      url.searchParams.set('error', 'rate_limited');
      url.searchParams.set('next', next);
      return NextResponse.redirect(url, { status: 303 });
    }
    let user = null;
    try {
      user = await authenticate(email, password);
    } catch {
      return configProblem(request, next);
    }
    if (!user) {
      keys.forEach(recordFailedAttempt);
      const url = new URL('/login', request.url);
      url.searchParams.set('error', 'account');
      url.searchParams.set('next', next);
      return NextResponse.redirect(url, { status: 303 });
    }
    keys.forEach(clearAttempts);
    try {
      await createUserSessionCookie(user);
    } catch {
      return configProblem(request, next);
    }
    return NextResponse.redirect(new URL(next, request.url), { status: 303 });
  }

  // The shared passphrase works only until the first account exists (or when PASSPHRASE_LOGIN=on).
  if (!(await legacyAllowed().catch(() => ({ allowed: true }))).allowed) {
    const url = new URL('/login', request.url);
    url.searchParams.set('error', 'passphrase_off');
    url.searchParams.set('next', next);
    return NextResponse.redirect(url, { status: 303 });
  }

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
    return configProblem(request, next);
  }

  if (!samePassphrase(password, expected)) {
    recordFailedAttempt(clientKey);
    const url = new URL('/login', request.url);
    url.searchParams.set('error', '1');
    url.searchParams.set('next', next);
    return NextResponse.redirect(url, { status: 303 });
  }

  clearAttempts(clientKey);
  try {
    await createAppSessionCookie();
  } catch {
    // SESSION_SECRET is missing: the passphrase was right but the session cannot be signed.
    return configProblem(request, next);
  }
  return NextResponse.redirect(new URL(next, request.url), { status: 303 });
}

/** The server is missing its sign-in settings. Show the sign-in page with a plain explanation instead of a raw error. */
function configProblem(request: NextRequest, next: string) {
  const url = new URL('/login', request.url);
  url.searchParams.set('error', 'config');
  url.searchParams.set('next', next);
  return NextResponse.redirect(url, { status: 303 });
}
