import type { Intent } from './parse';

// Pure decisions for the customer desk. The rule that matters most: the agents
// only state facts that come from the order record, and anything that changes
// money, stock or an address waits for a person unless it is clearly safe.

export type OrderStatus =
  | 'received'
  | 'parsing'
  | 'needs_review'
  | 'confirmed'
  | 'on_hold'
  | 'processing'
  | 'ready_to_ship'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface OrderView {
  orderNumber: string;
  status: OrderStatus;
  customerEmail: string | null;
  holdReason: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  carrier: string | null;
  trackingNo: string | null;
  shipByDate: string | null;
}

const DAY = 86_400_000;
const fmt = (iso: string) => new Date(iso).toISOString().slice(0, 10);

export function statusSentence(o: OrderView): string {
  switch (o.status) {
    case 'received':
    case 'parsing':
    case 'needs_review':
      return 'We have received your order and are checking the details.';
    case 'confirmed':
      return 'Your order is confirmed and is queued for processing.';
    case 'on_hold':
      return /^backorder/i.test(o.holdReason ?? '')
        ? 'One item on your order is temporarily out of stock. We will ship as soon as it arrives and will email you with an update.'
        : 'Your order is on hold while we complete a check. A team member will contact you if we need anything from you.';
    case 'processing':
    case 'ready_to_ship':
      return o.shipByDate ? `Your order is being prepared. We expect to ship it by ${fmt(o.shipByDate)}.` : 'Your order is being prepared for shipping.';
    case 'shipped': {
      const via = o.carrier ? ` with ${o.carrier}` : '';
      const track = o.trackingNo ? ` Tracking number: ${o.trackingNo}.` : '';
      return `Your order shipped${o.shippedAt ? ` on ${fmt(o.shippedAt)}` : ''}${via}.${track}`;
    }
    case 'delivered':
      return `Your order was delivered${o.deliveredAt ? ` on ${fmt(o.deliveredAt)}` : ''}.`;
    case 'cancelled':
      return 'This order has been cancelled.';
  }
}

export interface ReplyInput {
  intent: Intent;
  order: OrderView | null;
  senderEmail: string;
  now: Date;
  /** Automatic replies already sent to this sender in the last 24 hours. */
  recentAutoReplies: number;
  company: string;
  /** New address the customer wrote, if we could read one. */
  newAddress?: string;
}

export type ReplyMode = 'auto' | 'approval' | 'escalate';

export interface ReplyDecision {
  mode: ReplyMode;
  reply: string;
  /** A change the agent may make itself when the reply is sent automatically. */
  effect?: 'cancel';
  reason?: string;
}

export const AUTO_REPLY_LIMIT = 3;
const CANCEL_SAFE: OrderStatus[] = ['received', 'parsing', 'needs_review', 'confirmed', 'on_hold'];

function wrap(body: string, company: string): string {
  return `Hello,\n\n${body}\n\nKind regards,\n${company}`;
}

export function decideReply(i: ReplyInput): ReplyDecision {
  const w = (body: string) => wrap(body, i.company);

  if (i.recentAutoReplies >= AUTO_REPLY_LIMIT) {
    return {
      mode: 'approval',
      reply: w('Thanks for getting in touch. A member of our team will reply to you personally.'),
      reason: 'Automatic reply limit reached for this sender.',
    };
  }
  if (i.intent === 'complaint') {
    return {
      mode: 'escalate',
      reply: w('Thank you for telling us about this, and we are sorry for the trouble. A member of our team is looking at it now and will reply to you personally.'),
      reason: 'The message reads as a complaint or dispute.',
    };
  }
  if (i.intent === 'other') {
    return {
      mode: 'approval',
      reply: w('Thanks for your message. A member of our team will get back to you shortly.'),
      reason: 'Not a question the desk answers on its own.',
    };
  }
  if (!i.order) {
    return {
      mode: 'auto',
      reply: w('Thanks for your message. To help with your order, please reply with your order number (it looks like SO-251002-AB12) from the email address you used to order.'),
    };
  }
  const verified = !!i.order.customerEmail && i.order.customerEmail.toLowerCase() === i.senderEmail.toLowerCase();
  if (!verified) {
    // Same wording whether or not the order exists, so nothing is revealed.
    return {
      mode: 'auto',
      reply: w('Thanks for your message. We could not match this request to an order. Please reply from the email address used to place the order and include the order number.'),
    };
  }

  const o = i.order;
  switch (i.intent) {
    case 'order_status': {
      if (o.status === 'shipped' && o.shippedAt && !o.deliveredAt && i.now.getTime() - new Date(o.shippedAt).getTime() > 14 * DAY) {
        return {
          mode: 'escalate',
          reply: w(`${statusSentence(o)} We are sorry it has not arrived yet. We are checking with the carrier and will update you personally.`),
          reason: 'Shipped more than 14 days ago and not delivered. It may be lost.',
        };
      }
      return { mode: 'auto', reply: w(`Here is the latest on order ${o.orderNumber}. ${statusSentence(o)}`) };
    }
    case 'cancel': {
      if (o.status === 'cancelled') return { mode: 'auto', reply: w(`Order ${o.orderNumber} is already cancelled.`) };
      if (CANCEL_SAFE.includes(o.status)) {
        return { mode: 'auto', effect: 'cancel', reply: w(`Order ${o.orderNumber} has been cancelled. You will not be charged for it. If you paid already, we will contact you about the refund.`) };
      }
      if (o.status === 'processing' || o.status === 'ready_to_ship') {
        return {
          mode: 'approval',
          reply: w(`We have received your request to cancel order ${o.orderNumber}. It is already being prepared, so we have asked our warehouse to stop it and will confirm shortly.`),
          reason: 'Order is already being picked. A person must stop it.',
        };
      }
      return {
        mode: 'approval',
        reply: w(`Order ${o.orderNumber} has already shipped, so it can no longer be cancelled. When it arrives, reply to this email and we will explain how to return it.`),
        reason: 'Order already shipped. A person must handle the return.',
      };
    }
    case 'change_address':
      return {
        mode: 'approval',
        reply: w(`We have received your request to change the delivery address for order ${o.orderNumber}${i.newAddress ? ` to: ${i.newAddress}` : ''}. We will confirm once it has been updated.`),
        reason: 'Address changes need a person to confirm.',
      };
    case 'return':
      return {
        mode: 'approval',
        reply: w(`Thanks for letting us know about order ${o.orderNumber}. To help us sort this out quickly, please reply with a short description of the problem and a photo if the item is damaged.`),
        reason: 'Returns and refunds need a person.',
      };
  }
}

// ---- Shipping -------------------------------------------------------------

export function addBusinessDays(from: Date, days: number): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

export function chooseShipping(country: string | null, now: Date): { method: string; shipBy: string; international: boolean } {
  const c = (country ?? 'US').toUpperCase();
  const international = c !== 'US';
  return { method: international ? 'International economy' : 'Standard ground', shipBy: addBusinessDays(now, international ? 2 : 1), international };
}

// ---- Stock and credit -----------------------------------------------------

export interface StockLine {
  description: string;
  quantity: number;
  /** Null when the item is not stock-tracked (services, untracked items). */
  onHand: number | null;
}

export function stockShortages(lines: StockLine[]): { description: string; short: number }[] {
  const out: { description: string; short: number }[] = [];
  for (const l of lines) {
    if (l.onHand !== null && l.onHand < l.quantity) out.push({ description: l.description, short: l.quantity - Math.max(0, l.onHand) });
  }
  return out;
}

/** Hold for credit review when the customer has an invoice more than `days` past due. */
export function creditHoldReason(overdue: { balance: number; dueDate: string | null }[], now: Date, days = 60): string | null {
  const bad = overdue.filter((i) => i.balance > 0 && i.dueDate && (now.getTime() - new Date(`${i.dueDate}T00:00:00Z`).getTime()) / DAY > days);
  if (!bad.length) return null;
  const total = bad.reduce((t, i) => t + i.balance, 0);
  return `Credit review: ${bad.length} invoice${bad.length === 1 ? '' : 's'} over ${days} days past due (${total.toFixed(2)})`;
}

// ---- Catalog matching and order checks ------------------------------------

const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);

export interface CatalogItem {
  id: string;
  name: string;
}

/** Best catalog match: every word of the product name must appear in the description. */
export function matchProduct<T extends CatalogItem>(description: string, sku: string | undefined, catalog: T[]): T | null {
  const d = new Set(tokens(`${sku ?? ''} ${description}`));
  let best: T | null = null;
  let bestLen = 0;
  for (const p of catalog) {
    const t = tokens(p.name);
    if (!t.length) continue;
    if (t.every((w) => d.has(w)) && t.length > bestLen) {
      best = p;
      bestLen = t.length;
    }
  }
  return best;
}

export interface OrderCheckInput {
  lines: { description: string; quantity: number; matched: boolean }[];
  shipTo: { line1?: string | null; city?: string | null; postal?: string | null };
  duplicate: boolean;
}

/** Reasons an order cannot go straight through. Empty means it can. */
export function orderIssues(i: OrderCheckInput): string[] {
  const issues: string[] = [];
  if (!i.lines.length) issues.push('No items could be read from the order.');
  for (const l of i.lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 10_000) issues.push(`Quantity for "${l.description}" looks wrong (${l.quantity}).`);
    else if (!l.matched) issues.push(`"${l.description}" is not in the product list.`);
  }
  if (!i.shipTo.line1 || !i.shipTo.city || !i.shipTo.postal) issues.push('The ship-to address is missing or incomplete.');
  if (i.duplicate) issues.push('Looks like a duplicate of an order placed in the last 24 hours.');
  return issues;
}
