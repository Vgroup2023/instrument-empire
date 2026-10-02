import { randomBytes } from 'crypto';
import { getDb } from '@/db/client';
import { orderLines, orders, serviceMessages } from '@/db/schema';
import { logEvent } from './actions';

export interface StructuredLine {
  sku?: string;
  description: string;
  quantity: number;
  unitPrice?: number;
}

export interface NewOrderInput {
  channel: string;
  email?: string;
  name?: string;
  poNumber?: string;
  /** Free text (an email body or pasted order) for the intake agent to read. */
  rawText?: string;
  /** Already-structured lines, e.g. from a web form or EDI converter. */
  lines?: StructuredLine[];
  shipTo?: { line1?: string; city?: string; region?: string; postal?: string; country?: string };
}

function newOrderNumber(): string {
  const d = new Date();
  const yymmdd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const rand = randomBytes(3).toString('hex').slice(0, 4).toUpperCase();
  return `SO-${yymmdd}-${rand}`;
}

export async function createOrder(input: NewOrderInput): Promise<{ id: string; orderNumber: string }> {
  const raw = input.rawText?.trim();
  if (!raw && !input.lines?.length) throw new Error('Provide the order text or at least one line.');
  const db = getDb();
  for (let attempt = 0; attempt < 5; attempt++) {
    const orderNumber = newOrderNumber();
    try {
      const [o] = await db
        .insert(orders)
        .values({
          orderNumber,
          channel: input.channel,
          customerEmail: input.email?.trim().toLowerCase() || null,
          customerName: input.name?.trim() || null,
          poNumber: input.poNumber?.trim() || null,
          rawText: raw?.slice(0, 20_000) ?? null,
          shipLine1: input.shipTo?.line1?.trim() || null,
          shipCity: input.shipTo?.city?.trim() || null,
          shipRegion: input.shipTo?.region?.trim() || null,
          shipPostal: input.shipTo?.postal?.trim() || null,
          shipCountry: input.shipTo?.country?.trim().toUpperCase() || null,
        })
        .returning({ id: orders.id });
      const lines = (input.lines ?? []).filter((l) => l.description?.trim());
      if (lines.length) {
        await db.insert(orderLines).values(
          lines.map((l) => ({
            orderId: o.id,
            sku: l.sku?.trim() || null,
            description: l.description.trim().slice(0, 200),
            quantity: Math.trunc(l.quantity),
            unitPrice: l.unitPrice === undefined ? null : String(l.unitPrice),
          })),
        );
      }
      await logEvent({ orderId: o.id, agent: 'order-intake', action: 'received', detail: `via ${input.channel}` });
      return { id: o.id, orderNumber };
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (!/order_number|unique|duplicate/i.test(message)) throw err;
    }
  }
  throw new Error('Could not allocate an order number. Try again.');
}

export async function createServiceMessage(input: { fromEmail: string; subject?: string; body: string; channel: string }): Promise<{ id: string }> {
  const email = input.fromEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('A valid sender email is required.');
  if (!input.body?.trim()) throw new Error('The message is empty.');
  const [m] = await getDb()
    .insert(serviceMessages)
    .values({ fromEmail: email, subject: input.subject?.trim().slice(0, 300) || null, body: input.body.trim().slice(0, 20_000), channel: input.channel })
    .returning({ id: serviceMessages.id });
  await logEvent({ messageId: m.id, agent: 'customer-service', action: 'received', detail: `via ${input.channel}` });
  return m;
}
