import { randomBytes } from 'crypto';
import { getDb } from '@/db/client';
import { orderEvents, orderLines, orders, serviceMessages } from '@/db/schema';
import { MAX_QTY, ValidationError, optEmail, optText, text, unitPrice } from '@/lib/validation';
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
  const raw = typeof input.rawText === 'string' ? input.rawText.trim() : undefined;
  const email = optEmail(input.email, 'Customer email')?.toLowerCase();
  const name = optText(input.name, 'Customer name', 200);
  const poNumber = optText(input.poNumber, 'PO number', 100);
  const channel = text(input.channel, 'Channel', { max: 40 });
  const lines = (input.lines ?? [])
    .filter((l) => l.description?.trim())
    .map((l, index) => {
      const n = index + 1;
      const qty = Math.trunc(l.quantity);
      if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY) throw new ValidationError(`Line ${n} quantity must be a whole number of at least 1.`);
      return {
        sku: optText(l.sku, `Line ${n} SKU`, 100),
        description: l.description.trim().slice(0, 200),
        quantity: qty,
        unitPrice: l.unitPrice === undefined ? undefined : unitPrice(l.unitPrice, `Line ${n} unit price`),
      };
    });
  if (!raw && !lines.length) throw new ValidationError('Provide the order text or at least one line.');
  const db = getDb();
  for (let attempt = 0; attempt < 5; attempt++) {
    const orderNumber = newOrderNumber();
    try {
      // The order, its lines and the "received" event land together or not at all.
      return await db.transaction(async (tx) => {
        const [o] = await tx
          .insert(orders)
          .values({
            orderNumber,
            channel,
            customerEmail: email ?? null,
            customerName: name ?? null,
            poNumber: poNumber ?? null,
            rawText: raw?.slice(0, 20_000) ?? null,
            shipLine1: optText(input.shipTo?.line1, 'Ship-to address', 200) ?? null,
            shipCity: optText(input.shipTo?.city, 'Ship-to city', 100) ?? null,
            shipRegion: optText(input.shipTo?.region, 'Ship-to region', 100) ?? null,
            shipPostal: optText(input.shipTo?.postal, 'Ship-to postal code', 30) ?? null,
            shipCountry: optText(input.shipTo?.country, 'Ship-to country', 60)?.toUpperCase() ?? null,
          })
          .returning({ id: orders.id });
        if (lines.length) {
          await tx.insert(orderLines).values(
            lines.map((l) => ({
              orderId: o.id,
              sku: l.sku ?? null,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice === undefined ? null : l.unitPrice.toFixed(2),
            })),
          );
        }
        await tx.insert(orderEvents).values({ orderId: o.id, agent: 'order-intake', action: 'received', detail: `via ${channel}` });
        return { id: o.id, orderNumber };
      });
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
