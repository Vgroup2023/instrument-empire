import { NextRequest, NextResponse } from 'next/server';
import { verifyPayload } from '@/lib/crypto';
import { APP_SESSION_COOKIE } from '@/lib/cookieNames';
import { canAccess, type Principal } from '@/lib/auth/permissions';
import type { SessionClaims } from '@/lib/session';

// Recent answers from the live check, so most requests do not wait on it. A short memory (30 s) means a disabled
// account or a changed role takes effect within half a minute at most.
const LIVE_TTL_MS = 30_000;
const live = new Map<string, { at: number; value: Principal | null }>();

async function livePrincipal(request: NextRequest, token: string, claims: SessionClaims): Promise<Principal | null> {
  const fromCookie: Principal = { role: claims.role ?? 'owner', departments: claims.depts ?? [] };
  const key = token.slice(-40);
  const hit = live.get(key);
  if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.value;
  let value: Principal | null = fromCookie;
  try {
    const res = await fetch(new URL('/api/auth/session', request.url), { headers: { 'x-session-token': token }, cache: 'no-store', signal: AbortSignal.timeout(4000) });
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

  const isPublic =
    pathname === '/login' ||
    // Accepting an invitation or a password-reset link happens before the person has a session.
    pathname.startsWith('/invite/') ||
    pathname === '/api/auth/accept' ||
    // The single-sign-on round trip with the provider happens before there is a session.
    pathname.startsWith('/api/auth/sso/') ||
    // Called by this gate itself; it checks the signed cookie it is handed.
    pathname === '/api/auth/session' ||
    pathname.startsWith('/api/login') ||
    // Called by an external scheduler, not a browser — it authenticates
    // itself with CRON_SECRET instead of the app session cookie.
    pathname.startsWith('/api/recurring/run-due') ||
    // Same for the daily agent run; the handler checks CRON_SECRET or a session itself.
    pathname.startsWith('/api/agents/run') ||
    // Carrier / TMS / WMS webhooks authenticate with INTEGRATION_KEY in the handler.
    pathname.startsWith('/api/integrations/') ||
    // Install instructions and the offline page must load before sign-in.
    // Status check for the database; shows only a status word.
    pathname === '/api/health' ||
    // The staff time clock: staff ID and PIN on their own phone, no office password.
    pathname === '/clock' ||
    pathname === '/api/clock' ||
    pathname === '/install' ||
    pathname === '/offline' ||
    pathname.startsWith('/_next') ||
    // Static assets served straight out of /public (logo, favicon, etc.) —
    // the login page itself needs these before the user is authenticated.
    /\.[a-zA-Z0-9]+$/.test(pathname);

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
  // Skip build assets and anything with a file extension (logo, icons, manifest,
  // service worker). Those are public anyway, and running the auth check on each
  // one only made every page load wait on extra function calls.
  matcher: ['/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)'],
};
