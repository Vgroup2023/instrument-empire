import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { agentFindings, orders, rfqs, serviceMessages, shipments } from '@/db/schema';

export interface Attention {
  label: string;
  count: number;
  href: string;
  tone: 'danger' | 'warning' | 'neutral';
}

export interface TabStatus {
  /** Open-work counts keyed by tab href. A tab with no entry shows no badge. */
  badges: Record<string, number>;
  attention: Attention[];
}

async function count(q: Promise<{ n: number }[]>): Promise<number | null> {
  try {
    return (await q)[0]?.n ?? 0;
  } catch {
    return null;
  }
}

/** Live counts for the master dashboard. Any query that fails is left out rather than breaking the page. */
export async function getTabStatus(): Promise<TabStatus> {
  const db = getDb();
  const n = sql<number>`cast(count(*) as int)`;
  const [review, replies, urgent, openFindings, openShipments, rfqReview] = await Promise.all([
    count(db.select({ n }).from(orders).where(inArray(orders.status, ['needs_review', 'on_hold']))),
    count(db.select({ n }).from(serviceMessages).where(inArray(serviceMessages.status, ['awaiting_approval', 'escalated']))),
    count(db.select({ n }).from(agentFindings).where(and(eq(agentFindings.status, 'open'), inArray(agentFindings.severity, ['critical', 'high'])))),
    count(db.select({ n }).from(agentFindings).where(eq(agentFindings.status, 'open'))),
    count(db.select({ n }).from(shipments).where(eq(shipments.status, 'open'))),
    count(db.select({ n }).from(rfqs).where(eq(rfqs.status, 'estimator_review'))),
  ]);

  const badges: Record<string, number> = {};
  if (review !== null && replies !== null) badges['/dashboard/orders'] = review + replies;
  if (openFindings !== null) badges['/dashboard/agents'] = openFindings;
  if (openShipments !== null) badges['/dashboard/shipments'] = openShipments;
  if (rfqReview !== null) badges['/dashboard/rfqs'] = rfqReview;

  const attention: Attention[] = [];
  if (urgent) attention.push({ label: 'Critical or high findings', count: urgent, href: '/dashboard/agents', tone: 'danger' });
  if (review) attention.push({ label: 'Orders to review or on hold', count: review, href: '/dashboard/orders', tone: 'warning' });
  if (replies) attention.push({ label: 'Customer replies waiting', count: replies, href: '/dashboard/orders', tone: 'warning' });
  if (rfqReview) attention.push({ label: 'Quotes waiting for estimator review', count: rfqReview, href: '/dashboard/rfqs', tone: 'warning' });
  return { badges, attention };
}
