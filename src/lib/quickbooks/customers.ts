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

/** Lists every customer — active and inactive — same as QuickBooks' own Customers list. */
export async function listCustomers(): Promise<Customer[]> {
  return qboQuery<Customer>('SELECT * FROM Customer ORDERBY DisplayName MAXRESULTS 500');
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

export interface UpdateCustomerInput {
  id: string;
  syncToken: string;
  displayName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  /** Deactivate/reactivate — QuickBooks has no hard-delete for customers. */
  active?: boolean;
}

export async function updateCustomer(input: UpdateCustomerInput): Promise<Customer> {
  const data = await qboFetch<{ Customer: Customer }>('customer', {
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
  return data.Customer;
}
