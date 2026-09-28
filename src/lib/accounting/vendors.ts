import { getDb } from '@/db/client';
import { vendors } from '@/db/schema';
import { eq } from 'drizzle-orm';

// This is the standalone, database-backed Vendors list — the app's own
// source of truth, not QuickBooks. See src/lib/quickbooks/vendors.ts for
// the (optional, separate) QuickBooks-backed equivalent.

export interface Vendor {
  Id: string;
  /** Kept for UI compatibility with the QuickBooks-backed pages — not a real optimistic-concurrency token here. */
  SyncToken: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  /** Always 0 until Bills/Bill Payments are migrated onto this database (Phase 4+) and can compute a real A/P balance. */
  Balance?: number;
  Active: boolean;
  CurrencyRef?: { value: string };
}

type VendorRow = typeof vendors.$inferSelect;

function toVendor(row: VendorRow): Vendor {
  return {
    Id: row.id,
    SyncToken: row.updatedAt.getTime().toString(),
    DisplayName: row.displayName,
    CompanyName: row.companyName ?? undefined,
    PrimaryEmailAddr: row.email ? { Address: row.email } : undefined,
    PrimaryPhone: row.phone ? { FreeFormNumber: row.phone } : undefined,
    Balance: 0,
    Active: row.active,
    CurrencyRef: { value: row.currencyCode },
  };
}

/** Lists every vendor — active and inactive — same as QuickBooks' own Vendors list. */
export async function listVendors(): Promise<Vendor[]> {
  const db = getDb();
  const rows = await db.select().from(vendors).orderBy(vendors.displayName);
  return rows.map(toVendor);
}

export async function getVendor(id: string): Promise<Vendor> {
  const db = getDb();
  const [row] = await db.select().from(vendors).where(eq(vendors.id, id));
  if (!row) throw new Error('Vendor not found.');
  return toVendor(row);
}

export interface CreateVendorInput {
  displayName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  /** Omit for the default currency (USD). */
  currencyCode?: string;
}

export async function createVendor(input: CreateVendorInput): Promise<Vendor> {
  const db = getDb();
  const [row] = await db
    .insert(vendors)
    .values({
      displayName: input.displayName,
      companyName: input.companyName || null,
      email: input.email || null,
      phone: input.phone || null,
      currencyCode: input.currencyCode || 'USD',
    })
    .returning();
  return toVendor(row);
}

export interface UpdateVendorInput {
  id: string;
  /** Accepted for call-site compatibility with the QuickBooks-backed version; unused here. */
  syncToken?: string;
  displayName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  /** Deactivate/reactivate — QuickBooks has no hard-delete for vendors, and neither does this app. */
  active?: boolean;
}

export async function updateVendor(input: UpdateVendorInput): Promise<Vendor> {
  const db = getDb();
  const patch: Partial<VendorRow> = { updatedAt: new Date() };
  if (input.displayName !== undefined) patch.displayName = input.displayName;
  if (input.companyName !== undefined) patch.companyName = input.companyName || null;
  if (input.email !== undefined) patch.email = input.email || null;
  if (input.phone !== undefined) patch.phone = input.phone || null;
  if (input.active !== undefined) patch.active = input.active;

  const [row] = await db.update(vendors).set(patch).where(eq(vendors.id, input.id)).returning();
  if (!row) throw new Error('Vendor not found.');
  return toVendor(row);
}
