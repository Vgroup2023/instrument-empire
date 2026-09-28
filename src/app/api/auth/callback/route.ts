import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeCodeForTokens } from '@/lib/quickbooks/oauth';
import { fetchCompanyNameDirect } from '@/lib/quickbooks/companyInfo';
import { saveQboTokens } from '@/lib/session';
import { verifyPayload } from '@/lib/crypto';
import { getSessionSecret } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'ac_oauth_state';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const realmId = searchParams.get('realmId');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const settingsUrl = new URL('/dashboard/settings', request.url);

  if (error) {
    settingsUrl.searchParams.set('qbo_error', error);
    return NextResponse.redirect(settingsUrl);
  }

  if (!code || !realmId || !state) {
    settingsUrl.searchParams.set('qbo_error', 'missing_parameters');
    return NextResponse.redirect(settingsUrl);
  }

  const stateCookie = cookies().get(STATE_COOKIE)?.value;
  const statePayload = await verifyPayload<{ state: string }>(stateCookie, getSessionSecret());
  cookies().delete(STATE_COOKIE);

  if (!statePayload || statePayload.state !== state) {
    settingsUrl.searchParams.set('qbo_error', 'state_mismatch');
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const tokenResponse = await exchangeCodeForTokens(code);
    const companyName = await fetchCompanyNameDirect(tokenResponse.access_token, realmId);

    await saveQboTokens({
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      realmId,
      companyName,
      expiresAt: Date.now() + tokenResponse.expires_in * 1000,
    });

    settingsUrl.searchParams.set('qbo_connected', '1');
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    settingsUrl.searchParams.set('qbo_error', 'token_exchange_failed');
    return NextResponse.redirect(settingsUrl);
  }
}
