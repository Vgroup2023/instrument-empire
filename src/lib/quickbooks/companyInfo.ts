import { qboConfig } from '@/lib/config';
import { qboFetch } from '@/lib/quickbooks/client';
import { getQboTokens } from '@/lib/session';

export interface CompanyInfo {
  CompanyName: string;
  LegalName?: string;
  CompanyAddr?: { Line1?: string; City?: string; CountrySubDivisionCode?: string };
  Country?: string;
}

/** Used once during the OAuth callback, before tokens are stored in the session. */
export async function fetchCompanyNameDirect(accessToken: string, realmId: string): Promise<string> {
  const url = `${qboConfig.accountingApiBaseUrl}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=73`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return 'QuickBooks Company';
  const data = (await res.json()) as { CompanyInfo?: CompanyInfo };
  return data.CompanyInfo?.CompanyName ?? 'QuickBooks Company';
}

export async function getCompanyInfo(): Promise<CompanyInfo | null> {
  const tokens = await getQboTokens();
  if (!tokens) return null;
  const data = await qboFetch<{ CompanyInfo: CompanyInfo }>(`companyinfo/${tokens.realmId}`);
  return data.CompanyInfo;
}
