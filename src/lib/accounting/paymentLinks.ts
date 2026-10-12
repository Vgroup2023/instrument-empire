import { getDb } from '@/db/client';
import { paymentLinks } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { customers } from '@/db/schema';
import { getAppBaseUrl } from '@/lib/config';
import {
  MAX_MONEY,
  NotFoundError,
  ValidationError,
  asRecord,
  money,
  optEmail,
  optMoney,
  optText,
  uuid,
} from '@/lib/validation';

// This is the standalone, database-backed payment-link store behind
// src/lib/quickbooks/payments.ts's PAYMENTS_PROVIDER=mock path (the default
// — QuickBooks Payments is its own separate product, which this app
// doesn't have wired up). It used to be a JSON file
// (src/lib/store/jsonStore.ts), which didn't survive on a serverless host
// like Netlify; now it's a real, persistent table. The "demo-" URLs and the
// lack of any real payment processing are unchanged — this is still
// clearly-flagged placeholder data, just durably stored.

export interface PaymentLink {
  id: string;
  customerId: string;
  customerName: string;
  email?: string;
  amount: number;
  description?: string;
  status: 'active' | 'sent' | 'paid' | 'expired' | 'cancelled';
  url: string;
  createdAt: string;
  sentAt?: string;
}

type PaymentLinkRow = typeof paymentLinks.$inferSelect;

function toPaymentLink(row: PaymentLinkRow): PaymentLink {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customerName,
    email: row.email ?? undefined,
    amount: Number(row.amount),
    description: row.description ?? undefined,
    status: row.status,
    url: row.url,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : undefined,
  };
}

export async function listPaymentLinks(): Promise<PaymentLink[]> {
  const db = getDb();
  const rows = await db.select().from(paymentLinks).orderBy(desc(paymentLinks.createdAt));
  return rows.map(toPaymentLink);
}

export interface CreatePaymentLinkInput {
  customerId: string;
  customerName: string;
  email?: string;
  amount: number;
  description?: string;
}

export async function createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLink> {
  const raw = asRecord(input, 'The payment link');
  const customerId = uuid(raw.customerId, 'Customer');
  const amount = money(raw.amount, 'Amount');
  if (amount > MAX_MONEY) throw new ValidationError('The amount is too large.');
  const email = optEmail(raw.email, 'Email');
  const description = optText(raw.description, 'Description', 500);

  const db = getDb();
  // The customer's name comes from the record itself, never from what the client sent.
  const [customer] = await db
    .select({ displayName: customers.displayName, active: customers.active })
    .from(customers)
    .where(eq(customers.id, customerId));
  if (!customer) throw new ValidationError("That customer doesn't exist. Choose one from the list.");
  if (!customer.active) throw new ValidationError('That customer is inactive. Reactivate them first.');

  const id = crypto.randomUUID();
  const [row] = await db
    .insert(paymentLinks)
    .values({
      id,
      customerId,
      customerName: customer.displayName,
      email: email ?? null,
      amount: amount.toFixed(2),
      description: description ?? null,
      // Still a placeholder URL — there's no real payment processor wired up (see PAYMENTS_PROVIDER).
      url: `${getAppBaseUrl()}/pay/demo-${id.slice(0, 8)}`,
    })
    .returning();
  return toPaymentLink(row);
}

export async function sendPaymentLink(id: string, rawEmail?: string): Promise<PaymentLink> {
  uuid(id, 'Payment link');
  const email = optEmail(rawEmail, 'Email');
  const db = getDb();
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(paymentLinks).where(eq(paymentLinks.id, id)).for('update');
    if (!existing) throw new NotFoundError('Payment link not found.');
    if (existing.status === 'paid' || existing.status === 'cancelled' || existing.status === 'expired') {
      throw new ValidationError(`A ${existing.status} link can’t be sent.`);
    }
    if (!(email ?? existing.email)) throw new ValidationError('No email address on file for this link — add one first.');
    const patch: Partial<PaymentLinkRow> = { status: 'sent', sentAt: new Date() };
    if (email) patch.email = email;
    const [row] = await tx.update(paymentLinks).set(patch).where(eq(paymentLinks.id, id)).returning();
    return toPaymentLink(row);
  });
}

export interface UpdatePaymentLinkInput {
  amount?: number;
  description?: string;
  email?: string;
}

/** Only a still-active (not yet sent/paid/cancelled) link can be edited. */
export async function updatePaymentLink(id: string, input: UpdatePaymentLinkInput): Promise<PaymentLink> {
  uuid(id, 'Payment link');
  const raw = asRecord(input, 'The payment link');
  const amount = raw.amount !== undefined ? optMoney(raw.amount, 'Amount') : undefined;
  if (amount !== undefined && amount > MAX_MONEY) throw new ValidationError('The amount is too large.');
  const db = getDb();
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(paymentLinks).where(eq(paymentLinks.id, id)).for('update');
    if (!existing) throw new NotFoundError('Payment link not found.');
    if (existing.status !== 'active') throw new ValidationError('Only a link that hasn’t been sent yet can be edited.');

    const patch: Partial<PaymentLinkRow> = {};
    if (amount !== undefined) patch.amount = amount.toFixed(2);
    if (raw.description !== undefined) patch.description = optText(raw.description, 'Description', 500) ?? null;
    if (raw.email !== undefined) patch.email = optEmail(raw.email, 'Email') ?? null;
    if (Object.keys(patch).length === 0) return toPaymentLink(existing);

    const [row] = await tx.update(paymentLinks).set(patch).where(eq(paymentLinks.id, id)).returning();
    return toPaymentLink(row);
  });
}

export async function cancelPaymentLink(id: string): Promise<PaymentLink> {
  uuid(id, 'Payment link');
  const db = getDb();
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(paymentLinks).where(eq(paymentLinks.id, id)).for('update');
    if (!existing) throw new NotFoundError('Payment link not found.');
    if (existing.status === 'paid') throw new ValidationError('A paid link can’t be cancelled.');

    const [row] = await tx.update(paymentLinks).set({ status: 'cancelled' }).where(eq(paymentLinks.id, id)).returning();
    return toPaymentLink(row);
  });
}
