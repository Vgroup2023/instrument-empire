import { createHash, randomBytes } from 'crypto';

// Single sign-on with OpenID Connect (authorization code flow with PKCE). It works with any standard provider: Google
// Workspace, Microsoft Entra ID, Okta, Auth0, Keycloak. It only signs in people who already have an account here (matched
// by their verified email); it never creates one, so the owner stays in control of who is on the team.

export interface SsoConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** The text on the sign-in button. */
  name: string;
}

export function ssoConfig(env: NodeJS.ProcessEnv = process.env): SsoConfig | null {
  const issuer = env.SSO_ISSUER?.trim().replace(/\/$/, '');
  const clientId = env.SSO_CLIENT_ID?.trim();
  const clientSecret = env.SSO_CLIENT_SECRET?.trim();
  if (!issuer || !clientId || !clientSecret) return null;
  if (!/^https:\/\//.test(issuer) && !/^http:\/\/localhost[:/]/.test(issuer)) return null;
  return { issuer, clientId, clientSecret, name: env.SSO_NAME?.trim().slice(0, 40) || 'single sign-on' };
}

export interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  issuer: string;
}

let discoveryMemo: { at: number; issuer: string; value: Discovery } | null = null;

export async function discover(cfg: SsoConfig): Promise<Discovery> {
  if (discoveryMemo && discoveryMemo.issuer === cfg.issuer && Date.now() - discoveryMemo.at < 3_600_000) return discoveryMemo.value;
  const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(6000), cache: 'no-store' });
  if (!res.ok) throw new Error('The sign-in provider could not be reached.');
  const d = (await res.json()) as Partial<Discovery>;
  if (!d.authorization_endpoint || !d.token_endpoint || !d.issuer) throw new Error('The sign-in provider answered with something unexpected.');
  // The provider must say it is the issuer we were told about.
  if (d.issuer.replace(/\/$/, '') !== cfg.issuer) throw new Error('The sign-in provider does not match SSO_ISSUER.');
  const value = { authorization_endpoint: d.authorization_endpoint, token_endpoint: d.token_endpoint, issuer: d.issuer };
  discoveryMemo = { at: Date.now(), issuer: cfg.issuer, value };
  return value;
}

const b64url = (b: Buffer) => b.toString('base64url');

export function newFlow(): { state: string; nonce: string; verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48));
  return { state: b64url(randomBytes(24)), nonce: b64url(randomBytes(24)), verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) };
}

export function authorizeUrl(cfg: SsoConfig, d: Discovery, redirectUri: string, flow: { state: string; nonce: string; challenge: string }): string {
  const u = new URL(d.authorization_endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', flow.state);
  u.searchParams.set('nonce', flow.nonce);
  u.searchParams.set('code_challenge', flow.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

export interface IdClaims {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  hd?: string;
}

export function decodeIdToken(idToken: string): IdClaims | null {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as IdClaims;
  } catch {
    return null;
  }
}

/**
 * Checks the claims of an ID token we received straight from the provider's token endpoint over TLS (so the signature
 * need not be re-checked, per the OpenID Connect spec): right issuer, right audience, not expired, our nonce, and an email
 * the provider says it has verified. Returns the lowercase email, or a reason.
 */
export function checkClaims(c: IdClaims | null, cfg: SsoConfig, expectedNonce: string, now = Date.now()): { email: string; name: string } | { error: string } {
  if (!c) return { error: 'The sign-in answer could not be read.' };
  if ((c.iss ?? '').replace(/\/$/, '') !== cfg.issuer) return { error: 'The sign-in answer came from the wrong provider.' };
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(cfg.clientId)) return { error: 'The sign-in answer was meant for another app.' };
  if (typeof c.exp !== 'number' || c.exp * 1000 < now) return { error: 'The sign-in answer has expired.' };
  if (!c.nonce || c.nonce !== expectedNonce) return { error: 'The sign-in answer does not match this attempt.' };
  const email = (c.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'The provider did not share an email address.' };
  if (c.email_verified !== true && c.email_verified !== 'true') return { error: 'The provider has not verified that email address.' };
  return { email, name: (c.name ?? '').trim() };
}

export async function exchangeCode(cfg: SsoConfig, d: Discovery, code: string, verifier: string, redirectUri: string): Promise<IdClaims | null> {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret, code_verifier: verifier });
  const res = await fetch(d.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body, signal: AbortSignal.timeout(8000), cache: 'no-store' });
  if (!res.ok) return null;
  const t = (await res.json().catch(() => null)) as { id_token?: string } | null;
  return t?.id_token ? decodeIdToken(t.id_token) : null;
}

export const SSO_COOKIE = 'ac_sso';

/** Where the provider sends people back to. APP_BASE_URL wins so it matches what is registered with the provider. */
export function redirectUriFor(origin: string): string {
  return `${(process.env.APP_BASE_URL ?? origin).replace(/\/$/, '')}/api/auth/sso/callback`;
}
