import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyPayload } from '@/lib/crypto';
import { safeNext } from '@/lib/safeNext';
import { SSO_COOKIE, checkClaims, discover, exchangeCode, redirectUriFor, ssoConfig } from '@/lib/auth/sso';
import { signInWithSso } from '@/lib/auth/service';
import { createUserSessionCookie } from '@/lib/session';
import { clearAttempts, getClientKey, recordFailedAttempt } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Only failed trips count against the limit, so guessing at the return step is slowed down but normal use never is.
const back = (request: NextRequest, error: string) => {
  recordFailedAttempt(`sso:${getClientKey(request)}`);
  const url = new URL('/login', request.url);
  url.searchParams.set('error', error);
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.delete({ name: SSO_COOKIE, path: '/api/auth/sso' });
  return res;
};

/** The provider sends the person back here with a one-time code. */
export async function GET(request: NextRequest) {
  const cfg = ssoConfig();
  const secret = process.env.SESSION_SECRET;
  if (!cfg || !secret) return back(request, 'sso');
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');
  const saved = await verifyPayload<{ state: string; nonce: string; verifier: string; next: string; exp: number }>((await cookies()).get(SSO_COOKIE)?.value, secret);
  // The state must be the one we issued to this browser a moment ago, or someone is replaying or forging a return trip.
  if (!saved || saved.exp < Date.now() || !state || state !== saved.state || !code) return back(request, 'sso');
  try {
    const d = await discover(cfg);
    const claims = await exchangeCode(cfg, d, code, saved.verifier, redirectUriFor(request.nextUrl.origin));
    const checked = checkClaims(claims, cfg, saved.nonce);
    if ('error' in checked) return back(request, 'sso');
    const user = await signInWithSso(checked.email);
    if (!user) return back(request, 'sso_no_account');
    await createUserSessionCookie(user);
    clearAttempts(`sso:${getClientKey(request)}`);
    const res = NextResponse.redirect(new URL(safeNext(saved.next), request.url), { status: 303 });
    res.cookies.delete({ name: SSO_COOKIE, path: '/api/auth/sso' });
    return res;
  } catch {
    return back(request, 'sso');
  }
}
