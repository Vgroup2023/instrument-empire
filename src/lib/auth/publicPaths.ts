// Pages and endpoints that must work before anyone has signed in. Used by the access gate (proxy.ts), and by a test that
// checks the gate's matcher never lets a private page past while skipping the gate for a public one.

/** True for a path anyone may open without a session. Everything else needs a signed-in person (and the right access). */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    // Accepting an invitation or a password-reset link happens before the person has a session.
    pathname.startsWith('/invite/') ||
    pathname === '/api/auth/accept' ||
    // The single-sign-on round trip with the provider happens before there is a session.
    pathname.startsWith('/api/auth/sso/') ||
    // Called by the gate itself; it checks the signed cookie it is handed.
    pathname === '/api/auth/session' ||
    // Which sign-in form the login page shows; reveals nothing secret.
    pathname === '/api/auth/mode' ||
    pathname.startsWith('/api/login') ||
    // Called by an external scheduler, not a browser: it authenticates itself with CRON_SECRET.
    pathname.startsWith('/api/recurring/run-due') ||
    // Same for the agent run; the handler checks CRON_SECRET or a session itself.
    pathname.startsWith('/api/agents/run') ||
    // Carrier / TMS / WMS / email / text webhooks authenticate with INTEGRATION_KEY in the handler.
    pathname.startsWith('/api/integrations/') ||
    // Status check for the database; shows only a status word.
    pathname === '/api/health' ||
    // The staff time clock: staff ID and PIN on their own phone, no office password.
    pathname === '/clock' ||
    pathname === '/api/clock' ||
    // Install instructions and the offline page must load before sign-in.
    pathname === '/install' ||
    pathname === '/offline' ||
    pathname.startsWith('/_next') ||
    // Static assets served straight out of /public (logo, favicon and so on).
    /\.[a-zA-Z0-9]+$/.test(pathname)
  );
}
