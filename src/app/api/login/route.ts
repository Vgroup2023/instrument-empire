import { createHash, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { safeNext } from '@/lib/safeNext';
import { createAppSessionCookie } from '@/lib/session';
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

  if (!samePassphrase(password, expected)) {
    recordFailedAttempt(clientKey);
    const url = new URL('/login', request.url);
    url.searchParams.set('error', '1');
    url.searchParams.set('next', next);
    return NextResponse.redirect(url, { status: 303 });
  }

  clearAttempts(clientKey);
  await createAppSessionCookie();
  return NextResponse.redirect(new URL(next, request.url), { status: 303 });
}
