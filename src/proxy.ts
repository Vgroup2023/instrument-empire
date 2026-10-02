import { NextRequest, NextResponse } from 'next/server';
import { verifyPayload } from '@/lib/crypto';
import { APP_SESSION_COOKIE } from '@/lib/cookieNames';

// Runs on the Edge runtime, so it uses the Web Crypto based verifyPayload
// helper directly rather than importing from lib/session (which touches
// next/headers cookies() semantics tied to route handlers).
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname === '/login' ||
    pathname.startsWith('/api/login') ||
    // Called by an external scheduler, not a browser — it authenticates
    // itself with CRON_SECRET instead of the app session cookie.
    pathname.startsWith('/api/recurring/run-due') ||
    // Same for the daily agent run; the handler checks CRON_SECRET or a session itself.
    pathname.startsWith('/api/agents/run') ||
    // Carrier / TMS / WMS webhooks authenticate with INTEGRATION_KEY in the handler.
    pathname.startsWith('/api/integrations/') ||
    // Install instructions and the offline page must load before sign-in.
    pathname === '/install' ||
    pathname === '/offline' ||
    pathname.startsWith('/_next') ||
    // Static assets served straight out of /public (logo, favicon, etc.) —
    // the login page itself needs these before the user is authenticated.
    /\.[a-zA-Z0-9]+$/.test(pathname);

  if (isPublic) return NextResponse.next();

  const secret = process.env.SESSION_SECRET;
  const token = request.cookies.get(APP_SESSION_COOKIE)?.value;
  const payload = secret ? await verifyPayload<{ ok: boolean }>(token, secret) : null;

  if (!payload?.ok) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
