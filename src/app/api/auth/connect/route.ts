import { NextResponse } from 'next/server';
import { buildAuthorizationUrl } from '@/lib/quickbooks/oauth';
import { signPayload } from '@/lib/crypto';
import { getSessionSecret } from '@/lib/config';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'ac_oauth_state';

export async function GET() {
  const state = crypto.randomUUID();
  const signedState = await signPayload({ state }, getSessionSecret());

  const store = await cookies();
  store.set(STATE_COOKIE, signedState, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  const authorizationUrl = buildAuthorizationUrl(state);
  return NextResponse.redirect(authorizationUrl);
}
