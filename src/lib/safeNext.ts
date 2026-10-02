/**
 * Where to send someone after signing in. Only same-site paths are allowed:
 * "//evil.com" and "/\evil.com" start with a slash but browsers treat them as
 * another site, which would turn the login page into an open redirect.
 */
export function safeNext(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  try {
    const u = new URL(raw, 'http://local.invalid');
    if (u.origin !== 'http://local.invalid') return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}
