import { sql } from 'drizzle-orm';
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

type Counts = { review: number; replies: number; urgent: number; openFindings: number; openShipments: number; rfqReview: number };

/** One statement for all six counts (it used to be six round trips). */
async function readCounts(): Promise<Counts | null> {
  try {
    const db = getDb();
    const rows = await db.execute(sql`select
      (select cast(count(*) as int) from ${orders} where ${orders.status} in ('needs_review','on_hold')) as review,
      (select cast(count(*) as int) from ${serviceMessages} where ${serviceMessages.status} in ('awaiting_approval','escalated')) as replies,
      (select cast(count(*) as int) from ${agentFindings} where ${agentFindings.status} = 'open' and ${agentFindings.severity} in ('critical','high')) as urgent,
      (select cast(count(*) as int) from ${agentFindings} where ${agentFindings.status} = 'open') as "openFindings",
      (select cast(count(*) as int) from ${shipments} where ${shipments.status} = 'open') as "openShipments",
      (select cast(count(*) as int) from ${rfqs} where ${rfqs.status} = 'estimator_review') as "rfqReview"`);
    const r = ((rows as unknown as { rows?: Counts[] }).rows ?? (rows as unknown as Counts[]))[0];
    return r ? { review: Number(r.review), replies: Number(r.replies), urgent: Number(r.urgent), openFindings: Number(r.openFindings), openShipments: Number(r.openShipments), rfqReview: Number(r.rfqReview) } : null;
  } catch {
    return null;
  }
}

// The menu badges and both alert bells ask for these numbers on every page load. A few seconds of reuse (and one shared
// in-flight query) means a burst of requests costs one database call. A failed read is not kept.
const TTL_MS = 15_000;
let cache: { at: number; value: Counts } | null = null;
let inflight: Promise<Counts | null> | null = null;

async function counts(): Promise<Counts | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  inflight ??= readCounts().then((v) => { if (v) cache = { at: Date.now(), value: v }; return v; }).finally(() => { inflight = null; });
  return inflight;
}

/** Live counts for the master dashboard. If the read fails the badges are left out rather than breaking the page. */
export async function getTabStatus(): Promise<TabStatus> {
  const c = await counts();
  const { review, replies, urgent, openFindings, openShipments, rfqReview } = c ?? { review: null, replies: null, urgent: null, openFindings: null, openShipments: null, rfqReview: null };

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
