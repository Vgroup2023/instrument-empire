import { desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { agentFindings, agentRuns, customers, restrictedParties, shipmentLines, shipments } from '@/db/schema';

export async function listFindings(status: 'open' | 'resolved' | 'dismissed' = 'open') {
  const db = getDb();
  return db
    .select({
      id: agentFindings.id,
      agent: agentFindings.agent,
      severity: agentFindings.severity,
      title: agentFindings.title,
      detail: agentFindings.detail,
      action: agentFindings.action,
      createdAt: agentFindings.createdAt,
    })
    .from(agentFindings)
    .where(eq(agentFindings.status, status))
    .orderBy(
      sql`case ${agentFindings.severity} when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`,
      desc(agentFindings.updatedAt),
    );
}

/** Latest run per agent plus its open-finding count. */
export async function agentOverview() {
  const db = getDb();
  const [runs, counts] = await Promise.all([
    db
      .select({ agent: agentRuns.agent, finishedAt: sql<Date | null>`max(${agentRuns.finishedAt})` })
      .from(agentRuns)
      .groupBy(agentRuns.agent),
    db
      .select({ agent: agentFindings.agent, n: sql<number>`cast(count(*) as int)` })
      .from(agentFindings)
      .where(eq(agentFindings.status, 'open'))
      .groupBy(agentFindings.agent),
  ]);
  return {
    lastRun: Object.fromEntries(runs.map((r) => [r.agent, r.finishedAt ? new Date(r.finishedAt).toISOString() : null])),
    openCount: Object.fromEntries(counts.map((c) => [c.agent, c.n])),
  };
}

export async function listRestrictedParties() {
  return getDb().select().from(restrictedParties).orderBy(restrictedParties.name);
}

export interface ShipmentRow {
  id: string;
  reference: string;
  direction: 'import' | 'export';
  status: 'open' | 'completed' | 'cancelled';
  customerName: string | null;
  loadingDate: string | null;
  arrivalDate: string | null;
  isfFiledAt: string | null;
  entryFiledAt: string | null;
  eeiFiledAt: string | null;
  invoicedAt: string | null;
  receivedDocs: string[];
  declaredValue: number | null;
  lineCount: number;
}

export async function listShipments(): Promise<ShipmentRow[]> {
  const db = getDb();
  const rows = await db
    .select({ s: shipments, customerName: customers.displayName })
    .from(shipments)
    .leftJoin(customers, eq(shipments.customerId, customers.id))
    .orderBy(desc(shipments.createdAt));
  const ids = rows.map((r) => r.s.id);
  const counts = ids.length
    ? await db
        .select({ id: shipmentLines.shipmentId, n: sql<number>`cast(count(*) as int)` })
        .from(shipmentLines)
        .where(inArray(shipmentLines.shipmentId, ids))
        .groupBy(shipmentLines.shipmentId)
    : [];
  const countMap = new Map(counts.map((c) => [c.id, c.n]));
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return rows.map(({ s, customerName }) => ({
    id: s.id,
    reference: s.reference,
    direction: s.direction,
    status: s.status,
    customerName,
    loadingDate: s.loadingDate,
    arrivalDate: s.arrivalDate,
    isfFiledAt: iso(s.isfFiledAt),
    entryFiledAt: iso(s.entryFiledAt),
    eeiFiledAt: iso(s.eeiFiledAt),
    invoicedAt: iso(s.invoicedAt),
    receivedDocs: s.receivedDocs,
    declaredValue: s.declaredValue === null ? null : Number(s.declaredValue),
    lineCount: countMap.get(s.id) ?? 0,
  }));
}
