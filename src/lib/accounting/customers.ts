import { getDb } from '@/db/client';
import { customers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NotFoundError, ValidationError, optCurrency, optEmail, optText, text, uuid } from '@/lib/validation';

// This is the standalone, database-backed Customers list — the app's own
// source of truth, not QuickBooks. See src/lib/quickbooks/customers.ts for
// the (optional, separate) QuickBooks-backed equivalent.

export interface Customer {
  Id: string;
  /** Kept for UI compatibility with the QuickBooks-backed pages — not a real optimistic-concurrency token here. */
  SyncToken: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  /** Always 0 until Invoices/Payments are migrated onto this database (Phase 3+) and can compute a real A/R balance. */
  Balance?: number;
  Active: boolean;
  CurrencyRef?: { value: string };
}

type CustomerRow = typeof customers.$inferSelect;

function toCustomer(row: CustomerRow): Customer {
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

/** Lists every customer — active and inactive — same as QuickBooks' own Customers list. */
export async function listCustomers(): Promise<Customer[]> {
  const db = getDb();
  const rows = await db.select().from(customers).orderBy(customers.displayName);
  return rows.map(toCustomer);
}

export async function getCustomer(id: string): Promise<Customer> {
  uuid(id, 'Customer');
  const db = getDb();
  const [row] = await db.select().from(customers).where(eq(customers.id, id));
  if (!row) throw new NotFoundError('Customer not found.');
  return toCustomer(row);
}

/** A phone number: digits with the usual spaces, dashes, brackets, dots, plus and extension marks. */
function phone(value: unknown): string | undefined {
  const t = optText(value, 'Phone', 40);
  if (t && !/^[0-9 ()+.\-xX#,;]{3,40}$/.test(t)) throw new ValidationError('Phone numbers can only contain digits, spaces and + - ( ) . x.');
  return t;
}

export interface CreateCustomerInput {
  displayName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  /** Omit for the default currency (USD). */
  currencyCode?: string;
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const db = getDb();
  const [row] = await db
    .insert(customers)
    .values({
      displayName: text(input.displayName, 'Customer name', { max: 120 }),
      companyName: optText(input.companyName, 'Company name', 120) ?? null,
      email: optEmail(input.email) ?? null,
      phone: phone(input.phone) ?? null,
      currencyCode: optCurrency(input.currencyCode) ?? 'USD',
    })
    .returning();
  return toCustomer(row);
}

export interface UpdateCustomerInput {
  id: string;
  /** Accepted for call-site compatibility with the QuickBooks-backed version; unused here. */
  syncToken?: string;
  displayName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  /** Deactivate/reactivate — QuickBooks has no hard-delete for customers, and neither does this app. */
  active?: boolean;
}

export async function updateCustomer(input: UpdateCustomerInput): Promise<Customer> {
  const db = getDb();
  const patch: Partial<CustomerRow> = { updatedAt: new Date() };
  uuid(input.id, 'Customer');
  if (input.displayName !== undefined) patch.displayName = text(input.displayName, 'Customer name', { max: 120 });
  if (input.companyName !== undefined) patch.companyName = optText(input.companyName, 'Company name', 120) ?? null;
  if (input.email !== undefined) patch.email = optEmail(input.email) ?? null;
  if (input.phone !== undefined) patch.phone = phone(input.phone) ?? null;
  if (input.active !== undefined) patch.active = input.active;

  const [row] = await db.update(customers).set(patch).where(eq(customers.id, input.id)).returning();
  if (!row) throw new NotFoundError('Customer not found.');
  return toCustomer(row);
}
