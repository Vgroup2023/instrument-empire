import { getDb } from '@/db/client';
import { products, accounts } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

// This is the standalone, database-backed Products & services list — the
// app's own source of truth, not QuickBooks. See src/lib/quickbooks/items.ts
// for the (optional, separate) QuickBooks-backed equivalent.

export interface Product {
  Id: string;
  /** Kept for UI compatibility with the QuickBooks-backed pages — not a real optimistic-concurrency token here. */
  SyncToken: string;
  Name: string;
  Description?: string;
  Type: 'Service' | 'Inventory' | 'NonInventory';
  UnitPrice?: number;
  QtyOnHand?: number;
  Active: boolean;
  IncomeAccountRef?: { value: string; name?: string };
}

type ProductRow = typeof products.$inferSelect;

function toProduct(row: ProductRow, incomeAccountName: string | undefined): Product {
  return {
    Id: row.id,
    SyncToken: row.updatedAt.getTime().toString(),
    Name: row.name,
    Description: row.description ?? undefined,
    Type: row.type,
    UnitPrice: row.unitPrice !== null ? Number(row.unitPrice) : undefined,
    QtyOnHand: row.qtyOnHand !== null ? Number(row.qtyOnHand) : undefined,
    Active: row.active,
    IncomeAccountRef: row.incomeAccountId ? { value: row.incomeAccountId, name: incomeAccountName } : undefined,
  };
}

export interface IncomeAccount {
  Id: string;
  Name: string;
}

/**
 * Lists Income accounts (from this app's own Chart of Accounts) so the "add
 * product/service" form can let the user pick which one revenue posts to,
 * rather than this app silently guessing.
 */
export async function listIncomeAccounts(): Promise<IncomeAccount[]> {
  const db = getDb();
  const rows = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.accountType, 'Income'), eq(accounts.active, true)))
    .orderBy(accounts.name);
  return rows.map((r) => ({ Id: r.id, Name: r.name }));
}

async function incomeAccountNamesByProduct(rows: ProductRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.incomeAccountId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const db = getDb();
  const accountRows = await db.select({ id: accounts.id, name: accounts.name }).from(accounts);
  const byId = new Map(accountRows.map((a) => [a.id, a.name]));
  const result = new Map<string, string>();
  for (const id of ids) {
    const name = byId.get(id);
    if (name) result.set(id, name);
  }
  return result;
}

/** Lists every product/service — active and inactive — same as QuickBooks' own Products and Services list. */
export async function listProducts(): Promise<Product[]> {
  const db = getDb();
  const rows = await db.select().from(products).orderBy(products.name);
  const namesById = await incomeAccountNamesByProduct(rows);
  return rows.map((row) => toProduct(row, row.incomeAccountId ? namesById.get(row.incomeAccountId) : undefined));
}

export async function getProduct(id: string): Promise<Product> {
  const db = getDb();
  const [row] = await db.select().from(products).where(eq(products.id, id));
  if (!row) throw new Error('Product/service not found.');
  const namesById = await incomeAccountNamesByProduct([row]);
  return toProduct(row, row.incomeAccountId ? namesById.get(row.incomeAccountId) : undefined);
}

export interface CreateProductInput {
  name: string;
  description?: string;
  type: 'Service' | 'Inventory' | 'NonInventory';
  unitPrice?: number;
  /** Which Income account revenue from this item posts to (from listIncomeAccounts). */
  incomeAccountId: string;
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const db = getDb();
  const [row] = await db
    .insert(products)
    .values({
      name: input.name,
      description: input.description || null,
      type: input.type,
      unitPrice: input.unitPrice !== undefined ? input.unitPrice.toFixed(2) : null,
      qtyOnHand: input.type === 'Inventory' ? '0' : null,
      incomeAccountId: input.incomeAccountId,
    })
    .returning();
  const namesById = await incomeAccountNamesByProduct([row]);
  return toProduct(row, namesById.get(input.incomeAccountId));
}

export interface UpdateProductInput {
  id: string;
  /** Accepted for call-site compatibility with the QuickBooks-backed version; unused here. */
  syncToken?: string;
  name?: string;
  description?: string;
  unitPrice?: number;
  incomeAccountId?: string;
  /** Deactivate/reactivate — QuickBooks has no hard-delete for items, and neither does this app. */
  active?: boolean;
}

export async function updateProduct(input: UpdateProductInput): Promise<Product> {
  const db = getDb();
  const patch: Partial<ProductRow> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.unitPrice !== undefined) patch.unitPrice = input.unitPrice.toFixed(2);
  if (input.incomeAccountId !== undefined) patch.incomeAccountId = input.incomeAccountId;
  if (input.active !== undefined) patch.active = input.active;

  const [row] = await db.update(products).set(patch).where(eq(products.id, input.id)).returning();
  if (!row) throw new Error('Product/service not found.');
  const namesById = await incomeAccountNamesByProduct([row]);
  return toProduct(row, row.incomeAccountId ? namesById.get(row.incomeAccountId) : undefined);
}
