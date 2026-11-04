import { NextResponse } from 'next/server';
import { getCurrentUser, legacyAllowed } from '@/lib/auth/current';
import { loginModeFrom } from '@/lib/auth/loginMode';
import { ssoConfig } from '@/lib/auth/sso';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What the sign-in page needs from the server, fetched after the page itself has appeared so the page never waits on
 * the database (or on a sleeping server). Public, and reveals nothing secret: whether anyone is signed in on this
 * browser, which sign-in form to show, and the name on the single sign-on button.
 */
export async function GET() {
  const sso = ssoConfig();
  let signedIn = false;
  try { signedIn = (await getCurrentUser()) !== null; } catch { /* no usable session: show the form */ }
  let anyUsers: boolean | null = null;
  try { anyUsers = (await legacyAllowed()).anyUsers; } catch { /* database unreachable */ }
  const mode = loginModeFrom({ anyUsers, passphraseOn: process.env.PASSPHRASE_LOGIN === 'on', sso: sso ? { name: sso.name } : null });
  return NextResponse.json({ signedIn, ...mode }, { headers: { 'Cache-Control': 'no-store' } });
}
