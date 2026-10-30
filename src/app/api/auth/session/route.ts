import { NextRequest, NextResponse } from 'next/server';
import { verifyPayload } from '@/lib/crypto';
import { legacyAllowed } from '@/lib/auth/current';
import { getUser } from '@/lib/auth/service';
import type { SessionClaims } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Called by the sign-in gate (src/proxy.ts) to confirm a session is still good: the account is active, the session
 * version still matches, and what role and departments the person has right now. It checks the cookie's own signature,
 * so it tells nothing to anyone who does not already hold a valid session.
 */
export async function GET(request: NextRequest) {
  const none = NextResponse.json({ valid: false }, { headers: { 'Cache-Control': 'no-store' } });
  const token = request.headers.get('x-session-token') ?? undefined;
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) return none;
  const claims = await verifyPayload<SessionClaims>(token, secret);
  if (!claims?.ok || (claims.exp !== undefined && claims.exp < Date.now())) return none;
  try {
    if (claims.uid) {
      const u = await getUser(claims.uid);
      if (!u || u.status !== 'active' || u.sessionVersion !== claims.sv) return none;
      return NextResponse.json({ valid: true, role: u.role, depts: u.departments }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const { allowed, anyUsers } = await legacyAllowed();
    return allowed ? NextResponse.json({ valid: true, role: anyUsers ? 'admin' : 'owner', depts: [] }, { headers: { 'Cache-Control': 'no-store' } }) : none;
  } catch {
    // The database could not be reached: say so, and the gate falls back to what the signed cookie itself says.
    return NextResponse.json({ valid: null }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
