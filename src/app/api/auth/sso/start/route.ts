import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { signPayload } from '@/lib/crypto';
import { safeNext } from '@/lib/safeNext';
import { SSO_COOKIE, authorizeUrl, discover, newFlow, redirectUriFor, ssoConfig } from '@/lib/auth/sso';
import { getClientKey, isRateLimited } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const back = (request: NextRequest, error: string) => {
  const url = new URL('/login', request.url);
  url.searchParams.set('error', error);
  return NextResponse.redirect(url, { status: 303 });
};

/** Sends the browser to the sign-in provider. A short-lived signed cookie remembers what we need to finish the trip. */
export async function GET(request: NextRequest) {
  const cfg = ssoConfig();
  const secret = process.env.SESSION_SECRET;
  if (!cfg || !secret) return back(request, 'sso');
  const key = `sso:${getClientKey(request)}`;
  if (isRateLimited(key)) return back(request, 'rate_limited');
  try {
    const d = await discover(cfg);
    const flow = newFlow();
    const next = safeNext(request.nextUrl.searchParams.get('next'));
    const token = await signPayload({ state: flow.state, nonce: flow.nonce, verifier: flow.verifier, next, exp: Date.now() + 10 * 60_000 }, secret);
    (await cookies()).set(SSO_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth/sso', maxAge: 600 });
    return NextResponse.redirect(authorizeUrl(cfg, d, redirectUriFor(request.nextUrl.origin), flow), { status: 303 });
  } catch {
    return back(request, 'sso');
  }
}
