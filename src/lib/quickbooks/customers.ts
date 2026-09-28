import { qboFetch, qboQuery } from '@/lib/quickbooks/client';

export interface Customer {
  Id: string;
  SyncToken: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  Balance?: number;
  Active?: boolean;
  /** Locked in once this customer has any transaction — QuickBooks doesn't allow changing it after that. */
  CurrencyRef?: { value: string; name?: string };
}

export async function listCustomers(): Promise<Customer[]> {
  return qboQuery<Customer>("SELECT * FROM Customer WHERE Active = true ORDERBY DisplayName MAXRESULTS 500");
}

export async function getCustomer(id: string): Promise<Customer> {
  const data = await qboFetch<{ Customer: Customer }>(`customer/${id}`);
  return data.Customer;
}

export interface CreateCustomerInput {
  displayName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  /** Omit for the company's home currency. */
  currencyCode?: string;
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const data = await qboFetch<{ Customer: Customer }>('customer', {
    method: 'POST',
    body: {
      DisplayName: input.displayName,
      CompanyName: input.companyName || undefined,
      PrimaryEmailAddr: input.email ? { Address: input.email } : undefined,
      PrimaryPhone: input.phone ? { FreeFormNumber: input.phone } : undefined,
      CurrencyRef: input.currencyCode ? { value: input.currencyCode } : undefined,
    },
  });
  return data.Customer;
}
