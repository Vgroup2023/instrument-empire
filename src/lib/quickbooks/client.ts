import { qboConfig } from '@/lib/config';
import { getQboTokens, saveQboTokens, type QboTokens } from '@/lib/session';
import { refreshTokens } from '@/lib/quickbooks/oauth';

export class QboNotConnectedError extends Error {
  constructor() {
    super('QuickBooks is not connected yet.');
    this.name = 'QboNotConnectedError';
  }
}

export class QboApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`QuickBooks API error (${status})`);
    this.name = 'QboApiError';
    this.status = status;
    this.body = body;
  }
}

const REFRESH_SKEW_MS = 60_000;

async function getValidTokens(): Promise<QboTokens> {
  const tokens = await getQboTokens();
  if (!tokens) throw new QboNotConnectedError();

  if (Date.now() < tokens.expiresAt - REFRESH_SKEW_MS) {
    return tokens;
  }

  const refreshed = await refreshTokens(tokens.refreshToken);
  const next: QboTokens = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    realmId: tokens.realmId,
    companyName: tokens.companyName,
    expiresAt: Date.now() + refreshed.expires_in * 1000,
  };
  await saveQboTokens(next);
  return next;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

/** Low-level authenticated call against the QuickBooks Online Accounting API v3. */
export async function qboFetch<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const tokens = await getValidTokens();
  const url = new URL(`${qboConfig.accountingApiBaseUrl}/v3/company/${tokens.realmId}/${path}`);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set('minorversion', '73');

  const res = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    throw new QboApiError(res.status, data);
  }

  return data as T;
}

/** Runs a QBO SQL-like query, e.g. `SELECT * FROM Invoice WHERE Balance > '0'`. */
export async function qboQuery<T = unknown>(query: string): Promise<T[]> {
  const data = await qboFetch<Record<string, unknown>>('query', {
    query: { query },
  });
  const queryResponse = (data.QueryResponse ?? {}) as Record<string, unknown>;
  const entityKeys = Object.keys(queryResponse).filter((k) => Array.isArray(queryResponse[k]));
  if (entityKeys.length === 0) return [];
  return queryResponse[entityKeys[0]] as T[];
}

export async function qboReport<T = unknown>(
  reportName: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  return qboFetch<T>(`reports/${reportName}`, { query: params });
}

export async function getConnectedCompanyName(): Promise<string | null> {
  const tokens = await getQboTokens();
  return tokens?.companyName ?? null;
}
