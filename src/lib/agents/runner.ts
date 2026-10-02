import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { agentFindings, agentRuns, restrictedParties, shipmentDocuments, shipmentEvents, shipmentLines, shipments, warehouseReceipts } from '@/db/schema';
import { createHash } from 'crypto';
import { loadHtsIndex, loadScreeningIndex } from '@/lib/refdata/load';
import { suggestHts, type HtsSuggestion } from '@/lib/hts/classify';
import { llmEnabled } from '@/lib/llm/json';
import { listInvoices } from '@/lib/accounting/invoices';
import { listBills } from '@/lib/accounting/bills';
import { AGENTS, departmentFor, type AgentContext, type AgentId, type Finding, type FindingAgent, type ShipmentCtx } from './types';
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
  const [hts, screening] = await Promise.all([loadHtsIndex().catch(() => null), loadScreeningIndex().catch(() => null)]);
  const [shipmentRows, lineRows, eventRows, receiptRows, docRows, restricted, invoices, bills] = await Promise.all([
    db.select().from(shipments),
    db.select().from(shipmentLines),
    db.select().from(shipmentEvents),
    db.select().from(warehouseReceipts),
    db.select().from(shipmentDocuments).orderBy(shipmentDocuments.createdAt),
    db.select().from(restrictedParties),
    listInvoices(),
    listBills(),
  ]);
  const linesByShipment = new Map<string, ShipmentCtx['lines']>();
  for (const l of lineRows) {
    const list = linesByShipment.get(l.shipmentId) ?? [];
    list.push({
      id: l.id,
      description: l.description,
      htsCode: l.htsCode,
      value: num(l.value),
      eccn: l.eccn,
      htsSuggestion: (l.htsSuggestion as HtsSuggestion | null) ?? null,
      htsSuggestionKey: l.htsSuggestionKey,
    });
    linesByShipment.set(l.shipmentId, list);
  }
  const eventsByShipment = new Map<string, { type: string; occurredAt: string }[]>();
  for (const e of eventRows) {
    const list = eventsByShipment.get(e.shipmentId) ?? [];
    list.push({ type: e.type, occurredAt: e.occurredAt.toISOString() });
    eventsByShipment.set(e.shipmentId, list);
  }
  const receiptByShipment = new Map(receiptRows.map((r) => [r.shipmentId, r]));
  // Latest commercial invoice total per shipment (rows are oldest first, so later ones win).
  const invoiceTotals = new Map<string, number>();
  for (const d of docRows) {
    const e = d.extracted as { total?: unknown; currency?: unknown };
    if (d.docType === 'commercial_invoice' && typeof e.total === 'number' && (!e.currency || e.currency === 'USD')) invoiceTotals.set(d.shipmentId, e.total);
  }
  return {
    now,
    hts,
    screening,
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
      invoiceTotal: invoiceTotals.get(s.id) ?? null,
      carrier: s.carrier,
      containerNo: s.containerNo,
      lastFreeDate: s.lastFreeDate,
      deliveredAt: iso(s.deliveredAt),
      events: eventsByShipment.get(s.id) ?? [],
      warehouse: (() => {
        const r = receiptByShipment.get(s.id);
        return r
          ? {
              binLocation: r.binLocation,
              expectedPieces: r.expectedPieces,
              receivedPieces: r.receivedPieces,
              damagedPieces: r.damagedPieces,
              receivedAt: iso(r.receivedAt),
              releasedAt: iso(r.releasedAt),
              freeDays: r.freeDays,
              dailyRate: num(r.dailyRate),
              storageBilledAt: iso(r.storageBilledAt),
            }
          : null;
      })(),
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

export async function persistFindings(agent: FindingAgent, findings: Finding[]) {
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
        department: departmentFor(f.dedupeKey),
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
          department: departmentFor(f.dedupeKey),
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

const NEW_SUGGESTIONS_PER_RUN = 25;

/**
 * Works out an HTS suggestion for each active line whose description has not
 * been looked at (or changed, or Claude was switched on since). Results are
 * stored on the line so a description is only looked at once. A cap keeps one
 * run from making dozens of model calls; the rest wait for the next run.
 */
export async function enrichHtsSuggestions(ctx: AgentContext): Promise<number> {
  if (!ctx.hts) return 0;
  const db = getDb();
  const mode = llmEnabled() ? 'ai' : 'search';
  let done = 0;
  for (const s of ctx.shipments) {
    if (s.status !== 'open') continue;
    for (const l of s.lines) {
      const key = createHash('sha1').update(`${mode}|${l.description}`).digest('hex');
      if (l.htsSuggestionKey === key) continue;
      if (done >= NEW_SUGGESTIONS_PER_RUN) return done;
      const suggestion = await suggestHts(l.description, ctx.hts);
      // A model failure falls back to search results; remember that so it is retried when Claude answers again.
      const modelFailed = mode === 'ai' && suggestion?.source === 'search';
      await db.update(shipmentLines).set({ htsSuggestion: suggestion as never, htsSuggestionKey: modelFailed ? null : key }).where(eq(shipmentLines.id, l.id));
      l.htsSuggestion = suggestion;
      l.htsSuggestionKey = modelFailed ? null : key;
      done += 1;
    }
  }
  return done;
}

export async function runAgentsNow(): Promise<AgentRunSummary[]> {
  const db = getDb();
  const ctx = await loadContext();
  await enrichHtsSuggestions(ctx).catch(() => 0);
  const results = runAllAgents(ctx);
  const summaries: AgentRunSummary[] = [];
  for (const meta of AGENTS) {
    const [run] = await db.insert(agentRuns).values({ agent: meta.id }).returning();
    try {
      await persistFindings(meta.id, results[meta.id]);
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
