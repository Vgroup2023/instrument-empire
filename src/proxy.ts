import { NextRequest, NextResponse } from 'next/server';
import { verifyPayload } from '@/lib/crypto';
import { APP_SESSION_COOKIE } from '@/lib/cookieNames';
import { canAccess, type Principal } from '@/lib/auth/permissions';
import { isPublicPath } from '@/lib/auth/publicPaths';
import type { SessionClaims } from '@/lib/session';

// Recent answers from the live check, so most requests do not wait on it. A short memory (30 s) means a disabled
// account or a changed role takes effect within half a minute at most.
const LIVE_TTL_MS = 30_000;
const live = new Map<string, { at: number; value: Principal | null }>();

async function livePrincipal(request: NextRequest, token: string, claims: SessionClaims): Promise<Principal | null> {
  const fromCookie: Principal = { role: claims.role ?? 'owner', departments: claims.depts ?? [] };
  // Signed in within the last half minute: the sign-in itself just checked the account, so there is nothing newer to
  // learn from the server. This also saves the first page after sign-in from waiting on a server that is still waking.
  if (typeof claims.ts === 'number' && Date.now() - claims.ts >= 0 && Date.now() - claims.ts < LIVE_TTL_MS) return fromCookie;
  const key = token.slice(-40);
  const hit = live.get(key);
  if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.value;
  let value: Principal | null = fromCookie;
  try {
    const res = await fetch(new URL('/api/auth/session', request.url), { headers: { 'x-session-token': token }, cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const body = (await res.json()) as { valid?: boolean; role?: Principal['role']; depts?: Principal['departments'] };
      value = body.valid ? { role: body.role ?? fromCookie.role, departments: body.depts ?? fromCookie.departments } : null;
    }
    // Any other answer (database down): trust what the signed cookie says rather than locking everyone out.
  } catch {
    /* same */
  }
  if (live.size > 500) live.clear();
  live.set(key, { at: Date.now(), value });
  return value;
}


// Runs on the Edge runtime, so it uses the Web Crypto based verifyPayload
// helper directly rather than importing from lib/session (which touches
// next/headers cookies() semantics tied to route handlers).
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The matcher below already keeps the gate off most public paths; this is the same list, kept as a second line of defence.
  const isPublic = isPublicPath(pathname);

  if (isPublic) return NextResponse.next();

  const secret = process.env.SESSION_SECRET;
  const token = request.cookies.get(APP_SESSION_COOKIE)?.value;
  const payload = secret && token ? await verifyPayload<SessionClaims>(token, secret) : null;

  const toLogin = () => {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  };

  if (!payload?.ok || !token || (payload.exp !== undefined && payload.exp < Date.now())) return toLogin();

  const principal = await livePrincipal(request, token, payload);
  if (!principal) return toLogin();

  if (!canAccess(principal, pathname, request.method)) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Your account does not have access to this.' }, { status: 403 });
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    url.searchParams.set('denied', '1');
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip build assets and anything with a file extension (logo, icons, manifest, service worker), and every public
  // page and endpoint (see isPublicPath, which a test checks this against). Those are open to everyone anyway, so
  // running the gate on them only added a step that could fail: sign-in, the sign-in page's own requests, invitation
  // links, the incoming email/text webhooks, the scheduler's calls and the health check no longer depend on it.
  matcher: ['/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$|login$|invite/|api/login|api/auth/accept$|api/auth/session$|api/auth/mode$|api/auth/sso/|api/recurring/run-due|api/agents/run|api/integrations/|api/health$|api/clock$|clock$|install$|offline$).*)'],
};
