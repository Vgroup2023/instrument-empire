import { qboConfig } from '@/lib/config';

const AUTHORIZATION_ENDPOINT = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

// The Accounting scope covers everything used by the insights, aging,
// sales, invoices/estimates, customers, and products modules. Payments and
// Payroll scopes are requested too so a "live" provider can be dropped in
// later without re-running the OAuth consent flow; Intuit simply ignores a
// scope your app hasn't been granted access to yet.
const SCOPES = [
  'com.intuit.quickbooks.accounting',
  'com.intuit.quickbooks.payment',
];

export interface QboTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
  token_type: string;
}

export function buildAuthorizationUrl(state: string): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', qboConfig.clientId);
  url.searchParams.set('redirect_uri', qboConfig.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

function basicAuthHeader(): string {
  const raw = `${qboConfig.clientId}:${qboConfig.clientSecret}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

async function requestTokens(body: URLSearchParams): Promise<QboTokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(),
    },
    body: body.toString(),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`QuickBooks token request failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function exchangeCodeForTokens(code: string): Promise<QboTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: qboConfig.redirectUri,
  });
  return requestTokens(body);
}

export async function refreshTokens(refreshToken: string): Promise<QboTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  return requestTokens(body);
}
