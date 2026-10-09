import { desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { agentFindings, agentRuns, customers, restrictedParties, shipmentDocuments, shipmentEvents, shipmentLines, shipments, warehouseReceipts } from '@/db/schema';

export async function listFindings(status: 'open' | 'resolved' | 'dismissed' = 'open') {
  const db = getDb();
  return db
    .select({
      id: agentFindings.id,
      agent: agentFindings.agent,
      severity: agentFindings.severity,
      title: agentFindings.title,
      detail: agentFindings.detail,
      department: agentFindings.department,
      shipmentId: agentFindings.shipmentId,
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

export async function countShipments(): Promise<number> {
  const [row] = await getDb().select({ n: sql<number>`cast(count(*) as int)` }).from(shipments);
  return row?.n ?? 0;
}

/** Newest first. Pass `limit` to open the tab with just the newest files; omit it for every file. */
export async function listShipments(limit?: number): Promise<ShipmentRow[]> {
  const db = getDb();
  const query = db
    .select({ s: shipments, customerName: customers.displayName })
    .from(shipments)
    .leftJoin(customers, eq(shipments.customerId, customers.id))
    .orderBy(desc(shipments.createdAt));
  const rows = await (limit ? query.limit(limit) : query);
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

export async function openCountByDepartment(): Promise<Record<string, number>> {
  const rows = await getDb()
    .select({ department: agentFindings.department, n: sql<number>`cast(count(*) as int)` })
    .from(agentFindings)
    .where(eq(agentFindings.status, 'open'))
    .groupBy(agentFindings.department);
  return Object.fromEntries(rows.map((r) => [r.department, r.n]));
}

export interface ShipmentDetail {
  shipment: typeof shipments.$inferSelect;
  customerName: string | null;
  lines: (typeof shipmentLines.$inferSelect)[];
  events: (typeof shipmentEvents.$inferSelect)[];
  receipt: typeof warehouseReceipts.$inferSelect | null;
  documents: (typeof shipmentDocuments.$inferSelect)[];
  findings: Awaited<ReturnType<typeof listFindings>>;
}

export async function getShipmentDetail(id: string): Promise<ShipmentDetail | null> {
  const db = getDb();
  const [row] = await db
    .select({ s: shipments, customerName: customers.displayName })
    .from(shipments)
    .leftJoin(customers, eq(shipments.customerId, customers.id))
    .where(eq(shipments.id, id));
  if (!row) return null;
  const [lines, events, [receipt], documents, findings] = await Promise.all([
    db.select().from(shipmentLines).where(eq(shipmentLines.shipmentId, id)),
    db.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentId, id)).orderBy(desc(shipmentEvents.occurredAt)),
    db.select().from(warehouseReceipts).where(eq(warehouseReceipts.shipmentId, id)),
    db.select().from(shipmentDocuments).where(eq(shipmentDocuments.shipmentId, id)).orderBy(desc(shipmentDocuments.createdAt)),
    listFindings('open'),
  ]);
  return {
    shipment: row.s,
    customerName: row.customerName,
    lines,
    events,
    receipt: receipt ?? null,
    documents,
    findings: findings.filter((f) => f.shipmentId === id),
  };
}
