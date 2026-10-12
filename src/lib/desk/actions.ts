import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { orderEvents, orderLines, orders, products, serviceMessages } from '@/db/schema';
import { statusSentence, type OrderView } from './policy';
import { companyName, sendCustomerMail } from './notify';

export async function logEvent(e: { orderId?: string | null; messageId?: string | null; agent: string; action: string; detail?: string }) {
  await getDb().insert(orderEvents).values({
    orderId: e.orderId ?? null,
    messageId: e.messageId ?? null,
    agent: e.agent,
    action: e.action,
    detail: e.detail ?? null,
  });
}

export function toOrderView(o: typeof orders.$inferSelect): OrderView {
  return {
    orderNumber: o.orderNumber,
    status: o.status,
    customerEmail: o.customerEmail,
    holdReason: o.holdReason,
    shippedAt: o.shippedAt?.toISOString() ?? null,
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
    carrier: o.carrier,
    trackingNo: o.trackingNo,
    shipByDate: o.shipByDate,
  };
}

/** Cancels an order that has not shipped and returns any stock it had reserved. */
export async function cancelOrder(orderId: string, by: string, reason: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!o) throw new Error('Order not found.');
    if (o.status === 'shipped' || o.status === 'delivered') throw new Error('This order has already shipped and cannot be cancelled.');
    if (o.status === 'cancelled') return;
    const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, orderId));
    for (const l of lines) {
      if (l.reservedQty > 0 && l.productId) {
        await tx.update(products).set({ qtyOnHand: sql`${products.qtyOnHand} + ${l.reservedQty}` }).where(eq(products.id, l.productId));
        await tx.update(orderLines).set({ reservedQty: 0 }).where(eq(orderLines.id, l.id));
      }
    }
    await tx.update(orders).set({ status: 'cancelled', holdReason: reason, updatedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({ orderId, agent: by, action: 'cancelled', detail: reason });
  });
}

/** A person checked an order the intake agent flagged. The processing agent picks it up next. */
export async function approveReview(orderId: string): Promise<void> {
  const db = getDb();
  const updated = await db
    .update(orders)
    .set({ status: 'confirmed', holdReason: null, updatedAt: new Date() })
    .where(sql`${orders.id} = ${orderId} and ${orders.status} = 'needs_review'`)
    .returning({ id: orders.id });
  if (!updated.length) throw new Error('Only orders waiting for review can be approved.');
  await logEvent({ orderId, agent: 'staff', action: 'review_approved' });
}

export async function shipOrder(orderId: string, input: { carrier: string; trackingNo: string }): Promise<{ emailed: string }> {
  const carrier = typeof input.carrier === 'string' ? input.carrier.trim().slice(0, 120) : '';
  const trackingNo = typeof input.trackingNo === 'string' ? input.trackingNo.trim().slice(0, 120) : '';
  if (!carrier || !trackingNo) throw new Error('Carrier and tracking number are required.');
  const db = getDb();
  const [row] = await db
    .update(orders)
    .set({ status: 'shipped', carrier, trackingNo, shippedAt: new Date(), holdReason: null, updatedAt: new Date() })
    .where(sql`${orders.id} = ${orderId} and ${orders.status} in ('processing','ready_to_ship')`)
    .returning();
  if (!row) throw new Error('Only orders that are being prepared can be marked shipped.');
  await logEvent({ orderId, agent: 'shipping-processing', action: 'shipped', detail: `${carrier} ${trackingNo}` });
  if (!row.customerEmail) return { emailed: 'No email on the order, so the customer was not notified.' };
  const result = await sendCustomerMail(
    row.customerEmail,
    `Your order ${row.orderNumber} has shipped`,
    `Hello,\n\n${statusSentence(toOrderView(row))}\n\nKind regards,\n${companyName()}`,
  );
  await logEvent({ orderId, agent: 'shipping-processing', action: result.ok ? 'customer_notified' : 'notify_failed', detail: result.ok ? undefined : result.reason });
  return { emailed: result.ok ? 'Customer notified.' : `Customer not notified: ${result.reason}` };
}

export async function deliverOrder(orderId: string): Promise<void> {
  const updated = await getDb()
    .update(orders)
    .set({ status: 'delivered', deliveredAt: new Date(), updatedAt: new Date() })
    .where(sql`${orders.id} = ${orderId} and ${orders.status} = 'shipped'`)
    .returning({ id: orders.id });
  if (!updated.length) throw new Error('Only shipped orders can be marked delivered.');
  await logEvent({ orderId, agent: 'shipping-processing', action: 'delivered' });
}

/** A person approves (and may edit) the drafted reply, which is then emailed. */
export async function sendServiceReply(messageId: string, text: string): Promise<void> {
  const db = getDb();
  const [m] = await db.select().from(serviceMessages).where(eq(serviceMessages.id, messageId));
  if (!m) throw new Error('Message not found.');
  if (!['awaiting_approval', 'escalated'].includes(m.status)) throw new Error('This message does not have a reply waiting.');
  if (typeof text !== 'string' || !text.trim()) throw new Error('The reply cannot be empty.');
  if (text.length > 20_000) throw new Error('The reply must be under 20,000 characters.');
  const result = await sendCustomerMail(m.fromEmail, m.subject?.startsWith('Re:') ? m.subject : `Re: ${m.subject ?? 'your message'}`, text);
  if (!result.ok) throw new Error(result.reason);
  await db.update(serviceMessages).set({ status: 'closed', replyDraft: text, repliedAt: new Date(), handledBy: 'human', updatedAt: new Date() }).where(eq(serviceMessages.id, messageId));
  await logEvent({ orderId: m.orderId, messageId, agent: 'staff', action: 'reply_sent' });
}

export async function closeServiceMessage(messageId: string): Promise<void> {
  const updated = await getDb()
    .update(serviceMessages)
    .set({ status: 'closed', handledBy: 'human', updatedAt: new Date() })
    .where(sql`${serviceMessages.id} = ${messageId} and ${serviceMessages.status} in ('awaiting_approval','escalated','open')`)
    .returning({ id: serviceMessages.id });
  if (!updated.length) throw new Error('Message not found or already closed.');
  await logEvent({ messageId, agent: 'staff', action: 'message_closed' });
}
