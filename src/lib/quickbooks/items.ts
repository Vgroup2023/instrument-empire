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

export interface IncomeAccount {
  Id: string;
  Name: string;
}

/**
 * Lists Income accounts so the "add product/service" form can let the
 * user pick which one revenue posts to, rather than this app silently
 * guessing — picking the wrong income account would miscategorize real
 * revenue in their books.
 */
export async function listIncomeAccounts(): Promise<IncomeAccount[]> {
  return qboQuery<IncomeAccount>(
    "SELECT * FROM Account WHERE AccountType = 'Income' AND Active = true ORDERBY Name MAXRESULTS 100",
  );
}

export interface CreateProductInput {
  name: string;
  description?: string;
  type: 'Service' | 'Inventory' | 'NonInventory';
  unitPrice?: number;
  /** Which Income account revenue from this item posts to (from listIncomeAccounts). */
  incomeAccountId: string;
  incomeAccountName?: string;
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const data = await qboFetch<{ Item: Product }>('item', {
    method: 'POST',
    body: {
      Name: input.name,
      Description: input.description || undefined,
      Type: input.type,
      UnitPrice: input.unitPrice,
      IncomeAccountRef: { value: input.incomeAccountId, name: input.incomeAccountName },
      ...(input.type === 'Inventory'
        ? { TrackQtyOnHand: true, QtyOnHand: 0, InvStartDate: new Date().toISOString().slice(0, 10) }
        : {}),
    },
  });
  return data.Item;
}
