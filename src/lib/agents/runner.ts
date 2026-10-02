import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { agentFindings, agentRuns, restrictedParties, shipmentLines, shipments } from '@/db/schema';
import { listInvoices } from '@/lib/accounting/invoices';
import { listBills } from '@/lib/accounting/bills';
import { AGENTS, type AgentContext, type AgentId, type Finding, type ShipmentCtx } from './types';
import { runHtsOracle } from './hts';
import { runCbpSentinel } from './sentinel';
import { runExportShield } from './exportShield';
import { runDocuPilot } from './docupilot';
import { runRiskRadar } from './riskRadar';
import { runBillBot } from './billbot';

const num = (v: string | null) => (v === null ? null : Number(v));
const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function loadContext(now = new Date()): Promise<AgentContext> {
  const db = getDb();
  const [shipmentRows, lineRows, restricted, invoices, bills] = await Promise.all([
    db.select().from(shipments),
    db.select().from(shipmentLines),
    db.select().from(restrictedParties),
    listInvoices(),
    listBills(),
  ]);
  const linesByShipment = new Map<string, ShipmentCtx['lines']>();
  for (const l of lineRows) {
    const list = linesByShipment.get(l.shipmentId) ?? [];
    list.push({ id: l.id, description: l.description, htsCode: l.htsCode, value: num(l.value), eccn: l.eccn });
    linesByShipment.set(l.shipmentId, list);
  }
  return {
    now,
    restrictedParties: restricted.map((r) => r.name),
    shipments: shipmentRows.map((s) => ({
      id: s.id,
      reference: s.reference,
      direction: s.direction,
      status: s.status,
      originCountry: s.originCountry,
      destinationCountry: s.destinationCountry,
      shipper: s.shipper,
      consignee: s.consignee,
      loadingDate: s.loadingDate,
      arrivalDate: s.arrivalDate,
      isfFiledAt: iso(s.isfFiledAt),
      entryFiledAt: iso(s.entryFiledAt),
      eeiFiledAt: iso(s.eeiFiledAt),
      invoicedAt: iso(s.invoicedAt),
      receivedDocs: s.receivedDocs,
      declaredValue: num(s.declaredValue),
      lines: linesByShipment.get(s.id) ?? [],
    })),
    invoices: invoices.map((i) => ({
      id: i.Id,
      docNumber: i.DocNumber ?? null,
      customerName: i.CustomerRef.name ?? 'customer',
      balance: i.Balance,
      dueDate: i.DueDate ?? null,
      lastReminderSentAt: i.LastReminderSentAt ?? null,
    })),
    bills: bills.map((b) => ({
      id: b.Id,
      docNumber: b.DocNumber ?? null,
      vendorName: b.VendorRef.name ?? 'vendor',
      balance: b.Balance,
      dueDate: b.DueDate ?? null,
      approved: b.Approved,
    })),
  };
}

/** Pure: runs every agent over a snapshot. Risk Radar goes last because it scores the others' output. */
export function runAllAgents(ctx: AgentContext): Record<AgentId, Finding[]> {
  const base: Record<string, Finding[]> = {
    'hts-oracle': runHtsOracle(ctx),
    'cbp-sentinel': runCbpSentinel(ctx),
    'export-shield': runExportShield(ctx),
    docupilot: runDocuPilot(ctx),
    billbot: runBillBot(ctx),
  };
  base['risk-radar'] = runRiskRadar(ctx, Object.values(base).flat());
  return base as Record<AgentId, Finding[]>;
}

export interface AgentRunSummary {
  agent: AgentId;
  findings: number;
  error?: string;
}

async function persist(agent: AgentId, findings: Finding[]) {
  const db = getDb();
  for (const f of findings) {
    await db
      .insert(agentFindings)
      .values({
        agent: f.agent,
        severity: f.severity,
        title: f.title,
        detail: f.detail,
        shipmentId: f.shipmentId ?? null,
        dedupeKey: f.dedupeKey,
        action: f.action ?? null,
      })
      .onConflictDoUpdate({
        target: agentFindings.dedupeKey,
        // Status stays as the user left it, except a resolved finding that
        // reappears is reopened because the underlying problem is back.
        set: {
          severity: f.severity,
          title: f.title,
          detail: f.detail,
          updatedAt: new Date(),
          status: sql`case when ${agentFindings.status} = 'resolved' then 'open'::agent_finding_status else ${agentFindings.status} end`,
        },
      });
  }
  // Findings whose condition no longer holds close themselves.
  const keys = findings.map((f) => f.dedupeKey);
  await db
    .update(agentFindings)
    .set({ status: 'resolved', updatedAt: new Date() })
    .where(
      and(
        eq(agentFindings.agent, agent),
        eq(agentFindings.status, 'open'),
        keys.length ? notInArray(agentFindings.dedupeKey, keys) : undefined,
      ),
    );
}

export async function runAgentsNow(): Promise<AgentRunSummary[]> {
  const db = getDb();
  const ctx = await loadContext();
  const results = runAllAgents(ctx);
  const summaries: AgentRunSummary[] = [];
  for (const meta of AGENTS) {
    const [run] = await db.insert(agentRuns).values({ agent: meta.id }).returning();
    try {
      await persist(meta.id, results[meta.id]);
      await db.update(agentRuns).set({ finishedAt: new Date(), findingsCount: results[meta.id].length }).where(eq(agentRuns.id, run.id));
      summaries.push({ agent: meta.id, findings: results[meta.id].length });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await db.update(agentRuns).set({ finishedAt: new Date(), error: message }).where(eq(agentRuns.id, run.id));
      summaries.push({ agent: meta.id, findings: 0, error: message });
    }
  }
  return summaries;
}

export async function setFindingStatus(ids: string[], status: 'open' | 'resolved' | 'dismissed') {
  if (!ids.length) return;
  await getDb().update(agentFindings).set({ status, updatedAt: new Date() }).where(inArray(agentFindings.id, ids));
}
