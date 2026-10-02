import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { orders } from '@/db/schema';
import { apiErrorResponse } from '@/lib/apiError';
import { createOrder, createServiceMessage, type StructuredLine } from './ingest';
import { deliverOrder, shipOrder } from './actions';
import { runDesk } from './agents';

/** Errors the caller caused (bad input, wrong state) come back as 400, not 500. */
export function deskError(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : '';
  if (/required|provide|valid|empty|not found|cannot|only orders|only shipped|already|does not have|must/i.test(message)) {
    return NextResponse.json({ error: message }, { status: message.toLowerCase().includes('not found') ? 404 : 400 });
  }
  return apiErrorResponse(err);
}

interface InboundBody {
  kind?: string;
  channel?: string;
  // order
  email?: string;
  name?: string;
  poNumber?: string;
  rawText?: string;
  lines?: StructuredLine[];
  shipTo?: { line1?: string; city?: string; region?: string; postal?: string; country?: string };
  // message
  from?: string;
  subject?: string;
  body?: string;
  // shipment event
  orderNumber?: string;
  event?: string;
  carrier?: string;
  trackingNo?: string;
}

function cleanLines(lines: unknown): StructuredLine[] | undefined {
  if (!Array.isArray(lines)) return undefined;
  const out: StructuredLine[] = [];
  for (const l of lines.slice(0, 200)) {
    if (!l || typeof l !== 'object') continue;
    const x = l as Record<string, unknown>;
    const quantity = Number(x.quantity);
    if (typeof x.description !== 'string' || !x.description.trim() || !Number.isFinite(quantity)) continue;
    out.push({
      description: x.description,
      quantity,
      sku: typeof x.sku === 'string' ? x.sku : undefined,
      unitPrice: x.unitPrice === undefined || x.unitPrice === null || Number.isNaN(Number(x.unitPrice)) ? undefined : Number(x.unitPrice),
    });
  }
  return out;
}

/** Shared by the signed-in UI and the integration webhook. Creates the record, then lets the desk run so the customer gets an answer right away. */
export async function handleInbound(b: InboundBody, defaultChannel: string): Promise<NextResponse> {
  try {
    if (b.kind === 'order') {
      const o = await createOrder({
        channel: b.channel || defaultChannel,
        email: b.email,
        name: b.name,
        poNumber: b.poNumber,
        rawText: typeof b.rawText === 'string' ? b.rawText : undefined,
        lines: cleanLines(b.lines),
        shipTo: b.shipTo,
      });
      const run = await runDesk();
      const [row] = await getDb().select({ status: orders.status, holdReason: orders.holdReason }).from(orders).where(eq(orders.id, o.id));
      return NextResponse.json({ orderNumber: o.orderNumber, status: row?.status, note: row?.holdReason ?? null, run });
    }
    if (b.kind === 'message') {
      const m = await createServiceMessage({ fromEmail: b.from ?? b.email ?? '', subject: b.subject, body: b.body ?? '', channel: b.channel || defaultChannel });
      const run = await runDesk();
      return NextResponse.json({ id: m.id, run });
    }
    if (b.kind === 'shipment') {
      if (!b.orderNumber || !b.event) return NextResponse.json({ error: 'orderNumber and event are required.' }, { status: 400 });
      const [o] = await getDb().select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, b.orderNumber.toUpperCase()));
      if (!o) return NextResponse.json({ error: `Order ${b.orderNumber} not found.` }, { status: 404 });
      if (b.event === 'shipped') return NextResponse.json(await shipOrder(o.id, { carrier: b.carrier ?? '', trackingNo: b.trackingNo ?? '' }));
      if (b.event === 'delivered') {
        await deliverOrder(o.id);
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ error: 'event must be "shipped" or "delivered".' }, { status: 400 });
    }
    return NextResponse.json({ error: 'kind must be "order", "message" or "shipment".' }, { status: 400 });
  } catch (err) {
    return deskError(err);
  }
}
