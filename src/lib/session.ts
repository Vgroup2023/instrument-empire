import { cookies } from 'next/headers';
import { signPayload, verifyPayload } from '@/lib/crypto';
import { getSessionSecret } from '@/lib/config';
import { APP_SESSION_COOKIE, QBO_SESSION_COOKIE } from '@/lib/cookieNames';
import type { DepartmentKey, RoleKey } from '@/lib/auth/permissions';

export { APP_SESSION_COOKIE, QBO_SESSION_COOKIE };

export interface QboTokens {
  accessToken: string;
  refreshToken: string;
  realmId: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
  companyName?: string;
}

const ONE_YEAR = 60 * 60 * 24 * 365;
const NINETY_DAYS = 60 * 60 * 24 * 90;

export async function createAppSessionCookie(): Promise<void> {
  const token = await signPayload({ ok: true, ts: Date.now() }, getSessionSecret());
  const store = await cookies();
  store.set(APP_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR,
  });
}

/** What a signed session carries. Sessions from before accounts existed have only ok and ts. */
export interface SessionClaims {
  ok: boolean;
  ts: number;
  uid?: string;
  /** The person's session version when they signed in; raising it on the server signs them out. */
  sv?: number;
  /** Epoch ms after which the session is no longer accepted, whatever the cookie says. */
  exp?: number;
  role?: RoleKey;
  depts?: DepartmentKey[];
}

export const USER_SESSION_HOURS = 12;

/** Signs a person in: their own session, which lasts half a day. */
export async function createUserSessionCookie(user: { id: string; role: RoleKey; departments: DepartmentKey[]; sessionVersion: number }): Promise<void> {
  const exp = Date.now() + USER_SESSION_HOURS * 3_600_000;
  const claims: SessionClaims = { ok: true, ts: Date.now(), uid: user.id, sv: user.sessionVersion, exp, role: user.role, depts: user.departments };
  const token = await signPayload(claims, getSessionSecret());
  const store = await cookies();
  store.set(APP_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: USER_SESSION_HOURS * 3600,
  });
}

/** The verified claims of the current request's session cookie, or null when there is none, it is forged or it has run out. */
export async function readSessionClaims(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(APP_SESSION_COOKIE)?.value;
  const claims = await verifyPayload<SessionClaims>(token, getSessionSecret());
  if (!claims?.ok) return null;
  if (claims.exp !== undefined && claims.exp < Date.now()) return null;
  return claims;
}

export async function clearAppSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(APP_SESSION_COOKIE);
}

export async function isAppAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(APP_SESSION_COOKIE)?.value;
  const payload = await verifyPayload<{ ok: boolean }>(token, getSessionSecret());
  return Boolean(payload?.ok);
}

export async function saveQboTokens(tokens: QboTokens): Promise<void> {
  const token = await signPayload(tokens, getSessionSecret());
  try {
    // Next.js only allows cookie writes from a Route Handler or Server
    // Action. Report pages call this indirectly (via qboFetch's
    // token-refresh check) during a plain render, where a write would
    // throw. Swallow that case: the refreshed token still gets used for
    // the current request, and it will be persisted on the next request
    // that goes through a route handler (Intuit's rotated refresh token
    // stays valid for a grace period, so this doesn't break auth).
    const store = await cookies();
    store.set(QBO_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: NINETY_DAYS,
    });
  } catch {
    // See comment above — expected when called from a Server Component render.
  }
}

export async function getQboTokens(): Promise<QboTokens | null> {
  const store = await cookies();
  const token = store.get(QBO_SESSION_COOKIE)?.value;
  return verifyPayload<QboTokens>(token, getSessionSecret());
}

export async function clearQboTokens(): Promise<void> {
  const store = await cookies();
  store.delete(QBO_SESSION_COOKIE);
}
