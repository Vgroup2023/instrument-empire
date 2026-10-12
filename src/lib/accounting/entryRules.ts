import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { accounts, customers, products, vendors } from '@/db/schema';
import type { ExpenseLineInput } from '@/lib/quickbooks/expenseLineTypes';
import type { LineItemInput } from '@/lib/quickbooks/salesTypes';
import {
  MAX_MONEY,
  ValidationError,
  asRecord,
  list,
  money,
  optText,
  optUuid,
  quantity,
  round2,
  unitPrice,
  uuid,
} from '@/lib/validation';

// Shared rules for the lines and the referenced records on every document
// (invoice, estimate, bill, expense, journal entry, transfer, payment), so a
// rule fixed here is fixed everywhere.

type Db = ReturnType<typeof getDb>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Either the pool or an open transaction, so checks and reads can happen inside the same transaction as the write. */
export type Executor = Db | Tx;

export const EXPENSE_ACCOUNT_TYPES = ['Expense', 'Cost of Goods Sold', 'Other Expense'];
export const BANK_ACCOUNT_TYPES = ['Bank'];
export const PAYMENT_ACCOUNT_TYPES = ['Bank', 'Credit Card'];

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

/** Validated lines for an invoice or estimate. An unfilled form row is ignored; any other bad line is refused. */
export function parseSalesLines(raw: unknown): LineItemInput[] {
  const rows = list(raw, 'Line items');
  const out: LineItemInput[] = [];
  rows.forEach((entry, index) => {
    const n = index + 1;
    const row = asRecord(entry, `Line ${n}`);
    const itemId = optUuid(row.itemId, `Line ${n} product or service`);
    const description = optText(row.description, `Line ${n} description`, 500);
    if (!itemId && !description) throw new ValidationError(`Line ${n} needs either a product/service or a description.`);
    const qty = quantity(row.quantity, `Line ${n} quantity`);
    const price = unitPrice(row.unitPrice, `Line ${n} unit price`);
    const amount = round2(qty * price);
    if (amount > MAX_MONEY) throw new ValidationError(`Line ${n} total is too large.`);
    out.push({ itemId: itemId ?? '', description, quantity: qty, unitPrice: price });
  });
  if (out.length === 0) throw new ValidationError('Add at least one line item.');
  return out;
}

/** Validated lines for a bill or expense. Rows left completely blank are ignored; a half-filled or invalid row is refused. */
export function parseExpenseLines(raw: unknown): ExpenseLineInput[] {
  const rows = list(raw, 'Expense lines');
  const out: ExpenseLineInput[] = [];
  rows.forEach((entry, index) => {
    const n = index + 1;
    const row = asRecord(entry, `Line ${n}`);
    const blank = !row.accountId && (row.amount === undefined || row.amount === null || row.amount === '' || row.amount === 0) && !row.description;
    if (blank) return;
    const accountId = uuid(row.accountId, `Line ${n} account`);
    const amount = money(row.amount, `Line ${n} amount`);
    out.push({ accountId, description: optText(row.description, `Line ${n} description`, 500), amount });
  });
  if (out.length === 0) throw new ValidationError('Add at least one expense line with an amount.');
  return out;
}

// ---------------------------------------------------------------------------
// Referenced records must exist, be active, and be the right kind
// ---------------------------------------------------------------------------

function kindsOf(types: string[]): string {
  return types.map((t) => t.toLowerCase()).join(' or ');
}

/** Checks every account id exists, is active, and (optionally) is one of the allowed account types. */
export async function requireAccounts(ex: Executor, ids: string[], label: string, types?: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const found = await ex
    .select({ id: accounts.id, accountType: accounts.accountType, active: accounts.active })
    .from(accounts)
    .where(inArray(accounts.id, unique));
  const byId = new Map(found.map((a) => [a.id, a]));
  for (const id of unique) {
    const account = byId.get(id);
    if (!account) throw new ValidationError(`${label} doesn't exist. Choose it from the list.`);
    if (!account.active) throw new ValidationError(`${label} is inactive. Choose an active account.`);
    if (types && !types.includes(account.accountType)) {
      throw new ValidationError(`${label} must be a ${kindsOf(types)} account.`);
    }
  }
}

export async function requireAccount(ex: Executor, id: string, label: string, types?: string[]): Promise<void> {
  await requireAccounts(ex, [uuid(id, label)], label, types);
}

export async function requireCustomer(ex: Executor, id: string): Promise<void> {
  const [row] = await ex.select({ id: customers.id, active: customers.active }).from(customers).where(eq(customers.id, uuid(id, 'Customer')));
  if (!row) throw new ValidationError("That customer doesn't exist. Choose one from the list.");
  if (!row.active) throw new ValidationError('That customer is inactive. Reactivate them first.');
}

export async function requireVendor(ex: Executor, id: string): Promise<void> {
  const [row] = await ex.select({ id: vendors.id, active: vendors.active }).from(vendors).where(eq(vendors.id, uuid(id, 'Vendor')));
  if (!row) throw new ValidationError("That vendor doesn't exist. Choose one from the list.");
  if (!row.active) throw new ValidationError('That vendor is inactive. Reactivate them first.');
}

export async function requireProducts(ex: Executor, ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return;
  const found = await ex.select({ id: products.id }).from(products).where(and(inArray(products.id, unique)));
  if (found.length !== unique.length) throw new ValidationError("A product or service on this entry doesn't exist. Choose it from the list.");
}
