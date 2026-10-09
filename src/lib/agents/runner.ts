import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { agentFindings, agentRuns, restrictedParties, shipmentDocuments, shipmentEvents, shipmentLines, shipments, warehouseReceipts } from '@/db/schema';
import { createHash } from 'crypto';
import { loadHtsIndex, loadScreeningIndex } from '@/lib/refdata/load';
import { suggestHts, type HtsSuggestion } from '@/lib/hts/classify';
import { llmEnabled } from '@/lib/llm/json';
import { AGENTS, departmentFor, type AgentContext, type AgentId, type Finding, type FindingAgent, type ShipmentCtx } from './types';
import { runHtsOracle } from './hts';
import { runCbpSentinel } from './sentinel';
import { runExportShield } from './exportShield';
import { runDocuPilot } from './docupilot';
import { runRiskRadar } from './riskRadar';
import { runBillBot } from './billbot';

const num = (v: string | null) => (v === null ? null : Number(v));
const iso = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * BillBot only ever looks at invoices that are past due with a balance, and
 * bills that are due within three days (or overdue) with a balance, so the
 * database narrows to exactly those instead of loading every invoice and bill
 * with its lines, names and payments — which took seconds on a big ledger.
 */
async function loadOpenInvoicesAndBills(now: Date): Promise<{ invoices: AgentContext['invoices']; bills: AgentContext['bills'] }> {
  const db = getDb();
  const today = now.toISOString().slice(0, 10);
  const soon = new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
  const [invoiceRows, billRows] = await Promise.all([
    db.execute<{ id: string; doc_number: string | null; customer_name: string | null; balance: string; due_date: string; last_reminder: Date | null }>(sql`
      SELECT i.id, i.doc_number, c.display_name AS customer_name, i.due_date::text AS due_date, i.last_reminder_sent_at AS last_reminder,
             (t.total - COALESCE(p.paid, 0))::text AS balance
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      JOIN (SELECT invoice_id, SUM(amount) AS total FROM invoice_lines GROUP BY invoice_id) t ON t.invoice_id = i.id
      LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM invoice_payments GROUP BY invoice_id) p ON p.invoice_id = i.id
      WHERE i.due_date < ${today}::date AND t.total - COALESCE(p.paid, 0) > 0
    `),
    db.execute<{ id: string; doc_number: string | null; vendor_name: string | null; balance: string; due_date: string; approved: boolean }>(sql`
      SELECT b.id, b.doc_number, v.display_name AS vendor_name, b.due_date::text AS due_date, b.approved,
             (t.total - COALESCE(p.paid, 0))::text AS balance
      FROM bills b
      JOIN vendors v ON v.id = b.vendor_id
      JOIN (SELECT bill_id, SUM(amount) AS total FROM bill_lines GROUP BY bill_id) t ON t.bill_id = b.id
      LEFT JOIN (SELECT bill_id, SUM(amount) AS paid FROM bill_payments GROUP BY bill_id) p ON p.bill_id = b.id
      WHERE b.due_date <= ${soon}::date AND t.total - COALESCE(p.paid, 0) > 0
    `),
  ]);
  return {
    invoices: invoiceRows.map((i) => ({
      id: i.id,
      docNumber: i.doc_number,
      customerName: i.customer_name ?? 'customer',
      balance: Number(i.balance),
      dueDate: i.due_date,
      lastReminderSentAt: i.last_reminder ? new Date(i.last_reminder).toISOString() : null,
    })),
    bills: billRows.map((b) => ({
      id: b.id,
      docNumber: b.doc_number,
      vendorName: b.vendor_name ?? 'vendor',
      balance: Number(b.balance),
      dueDate: b.due_date,
      approved: b.approved,
    })),
  };
}

export async function loadContext(now = new Date()): Promise<AgentContext> {
  const db = getDb();
  const [hts, screening] = await Promise.all([loadHtsIndex().catch(() => null), loadScreeningIndex().catch(() => null)]);
  const [shipmentRows, lineRows, eventRows, receiptRows, docRows, restricted, open] = await Promise.all([
    db.select().from(shipments).orderBy(desc(shipments.createdAt)),
    db.select().from(shipmentLines),
    db.select().from(shipmentEvents),
    db.select().from(warehouseReceipts),
    db.select().from(shipmentDocuments).orderBy(shipmentDocuments.createdAt),
    db.select().from(restrictedParties),
    loadOpenInvoicesAndBills(now),
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
    invoices: open.invoices,
    bills: open.bills,
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
