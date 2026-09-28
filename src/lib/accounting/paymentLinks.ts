import { getDb } from '@/db/client';
import { paymentLinks } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getAppBaseUrl } from '@/lib/config';

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
  const db = getDb();
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(paymentLinks)
    .values({
      id,
      customerId: input.customerId,
      customerName: input.customerName,
      email: input.email || null,
      amount: input.amount.toFixed(2),
      description: input.description || null,
      // Still a placeholder URL — there's no real payment processor wired up (see PAYMENTS_PROVIDER).
      url: `${getAppBaseUrl()}/pay/demo-${id.slice(0, 8)}`,
    })
    .returning();
  return toPaymentLink(row);
}

export async function sendPaymentLink(id: string, email?: string): Promise<PaymentLink> {
  const db = getDb();
  const patch: Partial<PaymentLinkRow> = { status: 'sent', sentAt: new Date() };
  if (email) patch.email = email;
  const [row] = await db.update(paymentLinks).set(patch).where(eq(paymentLinks.id, id)).returning();
  if (!row) throw new Error('Payment link not found.');
  return toPaymentLink(row);
}

export interface UpdatePaymentLinkInput {
  amount?: number;
  description?: string;
  email?: string;
}

/** Only a still-active (not yet sent/paid/cancelled) link can be edited. */
export async function updatePaymentLink(id: string, input: UpdatePaymentLinkInput): Promise<PaymentLink> {
  const db = getDb();
  const [existing] = await db.select().from(paymentLinks).where(eq(paymentLinks.id, id));
  if (!existing) throw new Error('Payment link not found.');
  if (existing.status !== 'active') throw new Error('Only a link that hasn’t been sent yet can be edited.');

  const patch: Partial<PaymentLinkRow> = {};
  if (input.amount !== undefined) patch.amount = input.amount.toFixed(2);
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.email !== undefined) patch.email = input.email || null;

  const [row] = await db.update(paymentLinks).set(patch).where(eq(paymentLinks.id, id)).returning();
  return toPaymentLink(row);
}

export async function cancelPaymentLink(id: string): Promise<PaymentLink> {
  const db = getDb();
  const [existing] = await db.select().from(paymentLinks).where(eq(paymentLinks.id, id));
  if (!existing) throw new Error('Payment link not found.');
  if (existing.status === 'paid') throw new Error('A paid link can’t be cancelled.');

  const [row] = await db.update(paymentLinks).set({ status: 'cancelled' }).where(eq(paymentLinks.id, id)).returning();
  return toPaymentLink(row);
}
