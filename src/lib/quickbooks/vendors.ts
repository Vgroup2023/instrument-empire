import { qboFetch, qboQuery } from '@/lib/quickbooks/client';

export interface Vendor {
  Id: string;
  SyncToken: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  Balance?: number;
  Active?: boolean;
  /** Locked in once this vendor has any transaction — QuickBooks doesn't allow changing it after that. */
  CurrencyRef?: { value: string; name?: string };
}

/** Lists every vendor — active and inactive — same as QuickBooks' own Vendors list. */
export async function listVendors(): Promise<Vendor[]> {
  return qboQuery<Vendor>('SELECT * FROM Vendor ORDERBY DisplayName MAXRESULTS 500');
}

export async function getVendor(id: string): Promise<Vendor> {
  const data = await qboFetch<{ Vendor: Vendor }>(`vendor/${id}`);
  return data.Vendor;
}

export interface CreateVendorInput {
  displayName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  /** Omit for the company's home currency. */
  currencyCode?: string;
}

export async function createVendor(input: CreateVendorInput): Promise<Vendor> {
  const data = await qboFetch<{ Vendor: Vendor }>('vendor', {
    method: 'POST',
    body: {
      DisplayName: input.displayName,
      CompanyName: input.companyName || undefined,
      PrimaryEmailAddr: input.email ? { Address: input.email } : undefined,
      PrimaryPhone: input.phone ? { FreeFormNumber: input.phone } : undefined,
      CurrencyRef: input.currencyCode ? { value: input.currencyCode } : undefined,
    },
  });
  return data.Vendor;
}

export interface UpdateVendorInput {
  id: string;
  syncToken: string;
  displayName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  /** Deactivate/reactivate — QuickBooks has no hard-delete for vendors. */
  active?: boolean;
}

export async function updateVendor(input: UpdateVendorInput): Promise<Vendor> {
  const data = await qboFetch<{ Vendor: Vendor }>('vendor', {
    method: 'POST',
    body: {
      Id: input.id,
      SyncToken: input.syncToken,
      sparse: true,
      DisplayName: input.displayName,
      CompanyName: input.companyName,
      PrimaryEmailAddr: input.email ? { Address: input.email } : undefined,
      PrimaryPhone: input.phone ? { FreeFormNumber: input.phone } : undefined,
      Active: input.active,
    },
  });
  return data.Vendor;
}
