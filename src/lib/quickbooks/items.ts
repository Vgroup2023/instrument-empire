import { qboFetch, qboQuery } from '@/lib/quickbooks/client';

export interface Product {
  Id: string;
  SyncToken: string;
  Name: string;
  Description?: string;
  Type: 'Service' | 'Inventory' | 'NonInventory';
  UnitPrice?: number;
  QtyOnHand?: number;
  Active?: boolean;
  IncomeAccountRef?: { value: string; name?: string };
}

export async function listProducts(): Promise<Product[]> {
  return qboQuery<Product>('SELECT * FROM Item WHERE Active = true ORDERBY Name MAXRESULTS 500');
}

export async function getProduct(id: string): Promise<Product> {
  const data = await qboFetch<{ Item: Product }>(`item/${id}`);
  return data.Item;
}

interface IncomeAccount {
  Id: string;
  Name: string;
}

async function getDefaultIncomeAccount(): Promise<IncomeAccount> {
  const accounts = await qboQuery<IncomeAccount>(
    "SELECT * FROM Account WHERE AccountType = 'Income' MAXRESULTS 1",
  );
  if (accounts.length === 0) {
    throw new Error('No income account found in QuickBooks to attach this product/service to.');
  }
  return accounts[0];
}

export interface CreateProductInput {
  name: string;
  description?: string;
  type: 'Service' | 'Inventory' | 'NonInventory';
  unitPrice?: number;
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const incomeAccount = await getDefaultIncomeAccount();
  const data = await qboFetch<{ Item: Product }>('item', {
    method: 'POST',
    body: {
      Name: input.name,
      Description: input.description || undefined,
      Type: input.type,
      UnitPrice: input.unitPrice,
      IncomeAccountRef: { value: incomeAccount.Id, name: incomeAccount.Name },
      ...(input.type === 'Inventory'
        ? { TrackQtyOnHand: true, QtyOnHand: 0, InvStartDate: new Date().toISOString().slice(0, 10) }
        : {}),
    },
  });
  return data.Item;
}
