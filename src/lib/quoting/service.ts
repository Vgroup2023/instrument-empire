import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { materialPrices, priorJobs, quoteSettings, rfqFiles, rfqParts, rfqs, routingRules } from '@/db/schema';
import { requireCustomer, type Executor } from '@/lib/accounting/entryRules';
import { nextDocNumber } from '@/lib/accounting/docNumbers';
import { createEstimate } from '@/lib/accounting/estimates';
import type { Page } from '@/lib/paging';
import {
  ConflictError,
  MAX_QTY,
  NotFoundError,
  ValidationError,
  asRecord,
  list,
  optEmail,
  optIsoDate,
  optMoney,
  optText,
  optUuid,
  quantity,
  text,
  todayIso,
  uuid,
} from '@/lib/validation';
import { costRfq } from './costing';
import { extractRfqText, findCertifications, findDueDate, type ExtractedRfq } from './extract';
import { canonicalMaterial } from './materials';
import { readRfqWithLlm, readableFiles, type AttachedFile } from './read';
import type { CostedPart, Flag, MaterialPrice, PartInput, PriorJob, QuoteContext, QuoteSettings, RoutingRule } from './types';

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect'];
const num = (v: string | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 8;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

// ---------------------------------------------------------------------------
// The shop's rules
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS: QuoteSettings = {
  targetMarginPct: 28,
  overheadPct: 12,
  scrapPct: 5,
  priceStaleDays: 30,
  minLeadDays: 10,
  quoteValidDays: 30,
  certifications: [],
};

function toSettings(row: Row<typeof quoteSettings> | undefined): QuoteSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    targetMarginPct: Number(row.targetMarginPct),
    overheadPct: Number(row.overheadPct),
    scrapPct: Number(row.scrapPct),
    priceStaleDays: row.priceStaleDays,
    minLeadDays: row.minLeadDays,
    quoteValidDays: row.quoteValidDays,
    certifications: row.certifications,
  };
}

const toPrice = (r: Row<typeof materialPrices>): MaterialPrice => ({ id: r.id, material: r.material, vendor: r.vendor, price: Number(r.price), unit: r.unit, priceDate: r.priceDate });
const toRule = (r: Row<typeof routingRules>): RoutingRule => ({ id: r.id, operation: r.operation, keywords: r.keywords, setupHours: Number(r.setupHours), runMinutes: Number(r.runMinutes), ratePerHour: Number(r.ratePerHour) });
const toJob = (r: Row<typeof priorJobs>): PriorJob => ({
  id: r.id,
  partNumber: r.partNumber,
  description: r.description,
  customerName: r.customerName,
  material: r.material,
  operations: r.operations,
  qty: r.qty,
  laborHoursPerPart: num(r.laborHoursPerPart),
  materialCostPerPart: num(r.materialCostPerPart),
  unitPrice: num(r.unitPrice),
  completedOn: r.completedOn,
});

export async function loadRules(ex: Executor = getDb()) {
  const [settingsRow, prices, routing, jobs] = await Promise.all([
    ex.select().from(quoteSettings).where(eq(quoteSettings.id, 1)),
    ex.select().from(materialPrices).orderBy(materialPrices.material, materialPrices.vendor),
    ex.select().from(routingRules).orderBy(routingRules.operation),
    ex.select().from(priorJobs).orderBy(desc(priorJobs.completedOn)).limit(5000),
  ]);
  return { settings: toSettings(settingsRow[0]), prices: prices.map(toPrice), routing: routing.map(toRule), priorJobs: jobs.map(toJob) };
}

const PRIOR_JOBS_ON_SCREEN = 200;

/** What the Quoting rules tab shows: the newest jobs only, plus the full count. A shop with years of history would otherwise ship thousands of rows to the browser. */
export async function loadRulesView() {
  const db = getDb();
  const [settingsRow, prices, routing, jobs, [{ n }]] = await Promise.all([
    db.select().from(quoteSettings).where(eq(quoteSettings.id, 1)),
    db.select().from(materialPrices).orderBy(materialPrices.material, materialPrices.vendor),
    db.select().from(routingRules).orderBy(routingRules.operation),
    db.select().from(priorJobs).orderBy(desc(priorJobs.completedOn)).limit(PRIOR_JOBS_ON_SCREEN),
    db.select({ n: sql<number>`count(*)::int` }).from(priorJobs),
  ]);
  return { settings: toSettings(settingsRow[0]), prices: prices.map(toPrice), routing: routing.map(toRule), priorJobs: jobs.map(toJob), priorJobTotal: n };
}

/** Whether quoting can run at all (some price and some routing rule exist), without loading the rules. */
export async function quotingRulesReady(): Promise<boolean> {
  const db = getDb();
  const [[price], [rule]] = await Promise.all([db.select({ id: materialPrices.id }).from(materialPrices).limit(1), db.select({ id: routingRules.id }).from(routingRules).limit(1)]);
  return Boolean(price && rule);
}

async function loadContext(ex: Executor): Promise<QuoteContext> {
  return { ...(await loadRules(ex)), today: todayIso() };
}

const pct = (v: unknown, label: string, max = 95) => optMoney(v, label, { max, allowZero: true });

export async function saveSettings(raw: unknown): Promise<QuoteSettings> {
  const b = asRecord(raw, 'The settings');
  const current = (await loadRules()).settings;
  const days = (v: unknown, label: string, fallback: number) => (v === undefined ? fallback : Math.round(quantityDays(v, label)));
  const next: QuoteSettings = {
    targetMarginPct: pct(b.targetMarginPct, 'Target margin', 90) ?? current.targetMarginPct,
    overheadPct: pct(b.overheadPct, 'Overhead', 300) ?? current.overheadPct,
    scrapPct: pct(b.scrapPct, 'Scrap allowance', 100) ?? current.scrapPct,
    priceStaleDays: days(b.priceStaleDays, 'Price stale after (days)', current.priceStaleDays),
    minLeadDays: days(b.minLeadDays, 'Minimum lead time (days)', current.minLeadDays),
    quoteValidDays: days(b.quoteValidDays, 'Quote valid for (days)', current.quoteValidDays),
    certifications:
      b.certifications === undefined
        ? current.certifications
        : list(b.certifications, 'Certifications', { max: 30 }).map((c, i) => text(c, `Certification ${i + 1}`, { max: 60 })),
  };
  const db = getDb();
  await db
    .insert(quoteSettings)
    .values({
      id: 1,
      targetMarginPct: String(next.targetMarginPct),
      overheadPct: String(next.overheadPct),
      scrapPct: String(next.scrapPct),
      priceStaleDays: next.priceStaleDays,
      minLeadDays: next.minLeadDays,
      quoteValidDays: next.quoteValidDays,
      certifications: next.certifications,
    })
    .onConflictDoUpdate({
      target: quoteSettings.id,
      set: {
        targetMarginPct: String(next.targetMarginPct),
        overheadPct: String(next.overheadPct),
        scrapPct: String(next.scrapPct),
        priceStaleDays: next.priceStaleDays,
        minLeadDays: next.minLeadDays,
        quoteValidDays: next.quoteValidDays,
        certifications: next.certifications,
        updatedAt: new Date(),
      },
    });
  return next;
}

function quantityDays(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 3650) throw new ValidationError(`${label} must be a whole number of days, 0 to 3650.`);
  return v;
}

export async function savePrice(raw: unknown): Promise<void> {
  const b = asRecord(raw, 'The price');
  const material = canonicalMaterial(text(b.material, 'Material', { max: 80 }))!;
  const vendor = text(b.vendor, 'Vendor', { max: 120 });
  const price = optMoney(b.price, 'Price', { decimals: 4 });
  if (price === undefined) throw new ValidationError('Price is required.');
  const unit = (optText(b.unit, 'Unit', 10) ?? 'LB').toUpperCase();
  if (!['LB', 'KG'].includes(unit)) throw new ValidationError('Unit must be LB or KG (price per pound or per kilogram).');
  const priceDate = optIsoDate(b.priceDate, 'Price date') ?? todayIso();
  const db = getDb();
  await db.execute(sql`
    insert into material_prices (material, vendor, price, unit, price_date, notes)
    values (${material}, ${vendor}, ${String(price)}, ${unit}, ${priceDate}::date, ${optText(b.notes, 'Notes', 300) ?? null})
    on conflict (lower(material), lower(vendor))
    do update set price = excluded.price, unit = excluded.unit, price_date = excluded.price_date, updated_at = now()
  `);
}

export async function saveRoutingRule(raw: unknown): Promise<void> {
  const b = asRecord(raw, 'The routing rule');
  const operation = text(b.operation, 'Operation', { max: 60 });
  const keywords =
    b.keywords === undefined
      ? []
      : typeof b.keywords === 'string'
        ? b.keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 20)
        : list(b.keywords, 'Keywords', { max: 20 }).map((k, i) => text(k, `Keyword ${i + 1}`, { max: 40 }).toLowerCase());
  const setup = optMoney(b.setupHours, 'Setup hours', { allowZero: true, max: 1000 }) ?? 0;
  const run = optMoney(b.runMinutes, 'Run minutes per part', { allowZero: true, max: 100_000 }) ?? 0;
  const rate = optMoney(b.ratePerHour, 'Rate per hour', { allowZero: true, max: 10_000 }) ?? 0;
  const db = getDb();
  await db.execute(sql`
    insert into routing_rules (operation, keywords, setup_hours, run_minutes, rate_per_hour)
    values (${operation}, ${JSON.stringify(keywords)}::jsonb, ${String(setup)}, ${String(run)}, ${String(rate)})
    on conflict (lower(operation))
    do update set keywords = excluded.keywords, setup_hours = excluded.setup_hours, run_minutes = excluded.run_minutes,
      rate_per_hour = excluded.rate_per_hour, updated_at = now()
  `);
}

export async function savePriorJob(raw: unknown): Promise<void> {
  const b = asRecord(raw, 'The job');
  const labor = optMoney(b.laborHoursPerPart, 'Labor hours per part', { allowZero: true, decimals: 4, max: 100_000 });
  const matCost = optMoney(b.materialCostPerPart, 'Material cost per part', { allowZero: true, decimals: 4 });
  const unitPrice = optMoney(b.unitPrice, 'Unit price', { allowZero: true, decimals: 4 });
  const ops = b.operations === undefined ? [] : typeof b.operations === 'string' ? b.operations.split(',').map((o) => o.trim()).filter(Boolean).slice(0, 12) : list(b.operations, 'Operations', { max: 12 }).map((o, i) => text(o, `Operation ${i + 1}`, { max: 40 }));
  const db = getDb();
  await db.insert(priorJobs).values({
    partNumber: optText(b.partNumber, 'Part number', 80)?.toUpperCase() ?? null,
    description: text(b.description, 'Description', { max: 200 }),
    customerName: optText(b.customerName, 'Customer', 120) ?? null,
    material: optText(b.material, 'Material', 80) ?? null,
    operations: ops,
    qty: b.qty === undefined ? 1 : Math.round(quantity(b.qty, 'Quantity')),
    laborHoursPerPart: labor === undefined ? null : String(labor),
    materialCostPerPart: matCost === undefined ? null : String(matCost),
    unitPrice: unitPrice === undefined ? null : String(unitPrice),
    completedOn: optIsoDate(b.completedOn, 'Completed on') ?? null,
  });
}

export async function deleteRule(kind: string, id: string): Promise<void> {
  uuid(id, 'Record');
  const db = getDb();
  const table = kind === 'price' ? materialPrices : kind === 'routing' ? routingRules : kind === 'job' ? priorJobs : null;
  if (!table) throw new ValidationError('Unknown rule type.');
  const gone = await db.delete(table).where(eq(table.id, id)).returning({ id: table.id });
  if (gone.length === 0) throw new NotFoundError('That record was not found.');
}

/** Reads a pasted CSV (header row required) of material prices or prior jobs, saving every valid row and reporting the rest. */
export async function importCsv(kind: string, csv: unknown): Promise<{ saved: number; errors: string[] }> {
  if (typeof csv !== 'string' || !csv.trim()) throw new ValidationError('Paste the CSV text, including its header row.');
  if (csv.length > 1_000_000) throw new ValidationError('That CSV is too large. Import it in parts of up to about 5,000 rows.');
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new ValidationError('The CSV needs a header row and at least one data row.');
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  const col = (r: string[], names: string[]) => {
    const i = head.findIndex((h) => names.includes(h));
    return i >= 0 ? (r[i] ?? '').trim() : '';
  };
  const n = (s: string) => (s === '' ? undefined : Number(s.replace(/[$,]/g, '')));
  let saved = 0;
  const errors: string[] = [];
  for (let i = 1; i < rows.length && i <= 5001; i++) {
    const r = rows[i];
    if (r.every((c) => !c.trim())) continue;
    try {
      if (kind === 'prices') {
        await savePrice({ material: col(r, ['material', 'alloy']), vendor: col(r, ['vendor', 'supplier']), price: n(col(r, ['price', 'priceperlb', 'cost'])), unit: col(r, ['unit', 'uom']) || 'LB', priceDate: col(r, ['pricedate', 'date', 'updated']) || undefined });
      } else if (kind === 'jobs') {
        await savePriorJob({
          partNumber: col(r, ['partnumber', 'part', 'pn']) || undefined,
          description: col(r, ['description', 'desc', 'name']),
          customerName: col(r, ['customer']) || undefined,
          material: col(r, ['material']) || undefined,
          operations: col(r, ['operations', 'ops', 'routing']) || undefined,
          qty: n(col(r, ['qty', 'quantity'])),
          laborHoursPerPart: n(col(r, ['laborhoursperpart', 'laborhours', 'hoursperpart', 'hours'])),
          materialCostPerPart: n(col(r, ['materialcostperpart', 'materialcost'])),
          unitPrice: n(col(r, ['unitprice', 'price'])),
          completedOn: col(r, ['completedon', 'completed', 'date']) || undefined,
        });
      } else throw new ValidationError('Unknown import type.');
      saved += 1;
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'could not be read'}`);
      if (errors.length >= 20) break;
    }
  }
  return { saved, errors };
}

/** Minimal CSV reader: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// RFQs
// ---------------------------------------------------------------------------

export type RfqStatus = Row<typeof rfqs>['status'];

export interface RfqSummary {
  id: string;
  rfqNumber: string;
  customerName: string;
  subject: string | null;
  status: RfqStatus;
  receivedAt: string;
  dueDate: string | null;
  partCount: number;
  priceTotal: number;
  highFlags: number;
  flagCount: number;
}

export interface RfqFileMeta {
  id: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  kind: string;
}

export interface RfqDetail extends Omit<RfqSummary, 'partCount' | 'highFlags' | 'flagCount'> {
  customerId: string | null;
  contactEmail: string | null;
  source: string;
  rawText: string | null;
  certifications: string[];
  targetMarginPct: number | null;
  effectiveMarginPct: number;
  costTotal: number;
  estimatorNotes: string | null;
  approvedAt: string | null;
  estimateId: string | null;
  flags: Flag[];
  files: RfqFileMeta[];
  parts: CostedPart[];
  settings: QuoteSettings;
}

function fileKind(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (['pdf', 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'dwg', 'dxf'].includes(ext)) return 'drawing';
  if (['step', 'stp', 'iges', 'igs', 'sldprt', 'x_t', 'stl'].includes(ext)) return 'model';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'sheet';
  return 'other';
}

function parseFiles(raw: unknown): AttachedFile[] {
  if (raw === undefined || raw === null) return [];
  const rows = list(raw, 'Files', { max: MAX_FILES });
  let total = 0;
  return rows.map((entry, i) => {
    const f = asRecord(entry, `File ${i + 1}`);
    const fileName = text(f.fileName, `File ${i + 1} name`, { max: 255 });
    const content = typeof f.contentBase64 === 'string' ? f.contentBase64 : '';
    if (!content) throw new ValidationError(`File "${fileName}" is empty.`);
    const fileSize = Math.floor((content.length * 3) / 4);
    if (fileSize > MAX_FILE_BYTES) throw new ValidationError(`File "${fileName}" is over the ${MAX_FILE_BYTES / (1024 * 1024)} MB limit.`);
    total += fileSize;
    if (total > 5 * 1024 * 1024) throw new ValidationError('The files together are over 5 MB. Attach fewer or smaller files.');
    if (!BASE64.test(content) || content.length % 4 !== 0) throw new ValidationError(`File "${fileName}" is not valid.`);
    const contentType = typeof f.contentType === 'string' && f.contentType.trim() ? f.contentType.trim().slice(0, 120) : 'application/octet-stream';
    return { fileName, contentType, contentBase64: content, fileSize };
  });
}

function parsePartInput(raw: unknown, n: number): PartInput {
  const p = asRecord(raw, `Part ${n}`);
  const operations =
    p.operations === undefined
      ? []
      : typeof p.operations === 'string'
        ? p.operations.split(',').map((o) => o.trim()).filter(Boolean)
        : list(p.operations, `Part ${n} operations`, { max: 12 }).map((o, i) => text(o, `Part ${n} operation ${i + 1}`, { max: 40 }));
  const qty = Math.round(quantity(p.qty, `Part ${n} quantity`));
  if (qty > MAX_QTY) throw new ValidationError(`Part ${n} quantity is too large.`);
  const weight = p.weightLb === undefined || p.weightLb === null || p.weightLb === '' ? null : optMoney(p.weightLb, `Part ${n} weight`, { decimals: 4, max: 100_000 }) ?? null;
  return {
    partNumber: optText(p.partNumber, `Part ${n} number`, 80)?.toUpperCase() ?? null,
    description: text(p.description, `Part ${n} description`, { max: 200 }),
    material: optText(p.material, `Part ${n} material`, 80) ? canonicalMaterial(optText(p.material, `Part ${n} material`, 80)) : null,
    qty,
    operations: [...new Set(operations)].slice(0, 12),
    weightLb: weight,
    weightEstimated: p.weightEstimated === true && weight !== null,
    finish: optText(p.finish, `Part ${n} finish`, 120) ?? null,
    notes: optText(p.notes, `Part ${n} notes`, 500) ?? null,
  };
}

function partsToRows(rfqId: string, parts: CostedPart[]) {
  return parts.map((p) => ({
    rfqId,
    lineNumber: p.line,
    partNumber: p.partNumber ?? null,
    description: p.description,
    material: p.material ?? null,
    qty: p.qty,
    operations: p.operations,
    weightLb: p.weightLb === null || p.weightLb === undefined ? null : String(p.weightLb),
    finish: p.finish ?? null,
    notes: p.notes ?? null,
    costing: { ...(p.costing as unknown as Record<string, unknown>), weightEstimated: p.weightEstimated === true },
    unitCost: String(p.costing.unitCost),
    unitPrice: String(p.costing.unitPrice),
  }));
}

function rowToPart(r: Row<typeof rfqParts>): CostedPart {
  const costing = r.costing as unknown as CostedPart['costing'] & { weightEstimated?: boolean };
  return {
    line: r.lineNumber,
    partNumber: r.partNumber,
    description: r.description,
    material: r.material,
    qty: r.qty,
    operations: r.operations,
    weightLb: num(r.weightLb),
    weightEstimated: costing.weightEstimated === true,
    finish: r.finish,
    notes: r.notes,
    costing,
  };
}

/** Costs the parts, adds the notes about attached files, and returns what to store. */
function runPipeline(
  parts: PartInput[],
  meta: { dueDate: string | null; certifications: string[]; marginPct: number | null },
  files: { fileName: string; kind: string; contentType: string; fileSize: number }[],
  ctx: QuoteContext,
  readNames: Set<string>,
) {
  const hasDrawing = files.some((f) => f.kind === 'drawing' || f.kind === 'model');
  const result = costRfq({ parts, dueDate: meta.dueDate, certifications: meta.certifications, hasDrawing, marginPct: meta.marginPct }, ctx);
  const unread = files.filter((f) => (f.kind === 'drawing' || f.kind === 'model') && !readNames.has(f.fileName));
  if (unread.length) {
    result.flags.push({
      code: 'FILES_NOT_READ',
      severity: 'low',
      message: `${unread.length} attached drawing/model file${unread.length === 1 ? ' was' : 's were'} not read automatically (${unread.slice(0, 3).map((f) => f.fileName).join(', ')}${unread.length > 3 ? ', …' : ''}). Open ${unread.length === 1 ? 'it' : 'them'} and check tolerances and requirements before approving.`,
    });
  }
  return result;
}

export interface CreateRfqInput {
  customerId?: string;
  customerName?: string;
  contactEmail?: string;
  subject?: string;
  rawText?: string;
  dueDate?: string;
  files?: unknown;
  parts?: unknown;
}

/** Reads, costs and stores an incoming RFQ, leaving it ready for the estimator. Used by the screen and the integration feed. */
export async function createRfq(input: CreateRfqInput, source = 'manual'): Promise<{ id: string; rfqNumber: string }> {
  const b = asRecord(input, 'The RFQ');
  const rawText = optText(b.rawText, 'Request text', 50_000) ?? '';
  const subject = optText(b.subject, 'Subject', 200) ?? null;
  const contactEmail = optEmail(b.contactEmail, 'Contact email') ?? null;
  const customerId = optUuid(b.customerId, 'Customer');
  const files = parseFiles(b.files);
  const explicitParts = b.parts === undefined ? null : list(b.parts, 'Parts', { max: 200 }).map((p, i) => parsePartInput(p, i + 1));
  if (!rawText.trim() && files.length === 0 && !explicitParts?.length) {
    throw new ValidationError('Paste the request text, attach the RFQ files, or add the parts by hand.');
  }
  const dueOverride = optIsoDate(b.dueDate, 'Due date') ?? null;

  const db = getDb();
  const ctxBefore = await loadContext(db);
  const searchable = [subject ?? '', rawText].join('\n');

  // Read the request. Claude (when a key is set) reads the text and drawings; the plain rules are the fallback and fill gaps.
  const rules = extractRfqText(searchable, ctxBefore.routing);
  const llm = await readRfqWithLlm(searchable, files);
  const parts = explicitParts ?? (llm && llm.parts.length ? llm.parts : rules.parts);
  const certifications = [...new Set([...(llm?.certifications ?? []), ...rules.certifications, ...findCertifications(searchable)])];
  const dueDate = dueOverride ?? llm?.dueDate ?? rules.dueDate ?? findDueDate(searchable);
  const readNames = new Set(llm ? readableFiles(files).map((f) => f.fileName) : []);

  return db.transaction(async (tx) => {
    let customerName = optText(b.customerName, 'Customer name', 200);
    if (customerId) {
      await requireCustomer(tx, customerId);
      const [c] = await tx.execute<{ display_name: string }>(sql`select display_name from customers where id = ${customerId}`);
      customerName = c?.display_name ?? customerName;
    }
    if (!customerName) throw new ValidationError('Enter the customer name.');
    const ctx = await loadContext(tx);
    const fileMeta = files.map((f) => ({ fileName: f.fileName, contentType: f.contentType, fileSize: f.fileSize, kind: fileKind(f.fileName) }));
    const result = runPipeline(parts, { dueDate, certifications, marginPct: null }, fileMeta, ctx, readNames);

    const rfqNumber = await nextDocNumber(tx, 'rfq', 'RFQ');
    const [row] = await tx
      .insert(rfqs)
      .values({
        rfqNumber,
        customerId: customerId ?? null,
        customerName,
        contactEmail,
        subject,
        source,
        dueDate,
        rawText: rawText || null,
        certifications,
        costTotal: String(result.costTotal),
        priceTotal: String(result.priceTotal),
        flags: result.flags,
      })
      .returning({ id: rfqs.id });
    if (files.length) {
      await tx.insert(rfqFiles).values(files.map((f) => ({ rfqId: row.id, fileName: f.fileName, contentType: f.contentType, fileSize: f.fileSize, kind: fileKind(f.fileName), contentBase64: f.contentBase64 })));
    }
    if (result.parts.length) await tx.insert(rfqParts).values(partsToRows(row.id, result.parts));
    return { id: row.id, rfqNumber };
  });
}

export async function listRfqsPage(limit: number, offset: number): Promise<Page<RfqSummary>> {
  const db = getDb();
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: rfqs.id,
        rfqNumber: rfqs.rfqNumber,
        customerName: rfqs.customerName,
        subject: rfqs.subject,
        status: rfqs.status,
        receivedAt: rfqs.receivedAt,
        dueDate: rfqs.dueDate,
        priceTotal: rfqs.priceTotal,
        flags: rfqs.flags,
      })
      .from(rfqs)
      .orderBy(desc(rfqs.receivedAt))
      .limit(limit)
      .offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(rfqs),
  ]);
  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db.select({ id: rfqParts.rfqId, n: sql<number>`count(*)::int` }).from(rfqParts).where(inArray(rfqParts.rfqId, ids)).groupBy(rfqParts.rfqId)
    : [];
  const countOf = new Map(counts.map((c) => [c.id, c.n]));
  return {
    total: n,
    items: rows.map((r) => {
      const flags = r.flags as Flag[];
      return {
        id: r.id,
        rfqNumber: r.rfqNumber,
        customerName: r.customerName,
        subject: r.subject,
        status: r.status,
        receivedAt: r.receivedAt.toISOString(),
        dueDate: r.dueDate,
        partCount: countOf.get(r.id) ?? 0,
        priceTotal: Number(r.priceTotal),
        highFlags: flags.filter((f) => f.severity === 'high').length,
        flagCount: flags.length,
      };
    }),
  };
}

export async function getRfq(id: string, ex: Executor = getDb()): Promise<RfqDetail> {
  uuid(id, 'RFQ');
  const [r] = await ex.select().from(rfqs).where(eq(rfqs.id, id));
  if (!r) throw new NotFoundError('RFQ not found.');
  const [partRows, fileRows, rules] = await Promise.all([
    ex.select().from(rfqParts).where(eq(rfqParts.rfqId, id)).orderBy(rfqParts.lineNumber),
    ex
      .select({ id: rfqFiles.id, fileName: rfqFiles.fileName, contentType: rfqFiles.contentType, fileSize: rfqFiles.fileSize, kind: rfqFiles.kind })
      .from(rfqFiles)
      .where(eq(rfqFiles.rfqId, id))
      .orderBy(rfqFiles.createdAt),
    ex.select().from(quoteSettings).where(eq(quoteSettings.id, 1)),
  ]);
  const settings = toSettings(rules[0]);
  const flags = r.flags as Flag[];
  return {
    id: r.id,
    rfqNumber: r.rfqNumber,
    customerName: r.customerName,
    subject: r.subject,
    status: r.status,
    receivedAt: r.receivedAt.toISOString(),
    dueDate: r.dueDate,
    priceTotal: Number(r.priceTotal),
    customerId: r.customerId,
    contactEmail: r.contactEmail,
    source: r.source,
    rawText: r.rawText,
    certifications: r.certifications,
    targetMarginPct: num(r.targetMarginPct),
    effectiveMarginPct: num(r.targetMarginPct) ?? settings.targetMarginPct,
    costTotal: Number(r.costTotal),
    estimatorNotes: r.estimatorNotes,
    approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
    estimateId: r.estimateId,
    flags,
    files: fileRows,
    parts: partRows.map(rowToPart),
    settings,
  };
}

export async function getRfqFile(rfqId: string, fileId: string) {
  uuid(rfqId, 'RFQ');
  uuid(fileId, 'File');
  const [f] = await getDb().select().from(rfqFiles).where(and(eq(rfqFiles.id, fileId), eq(rfqFiles.rfqId, rfqId)));
  if (!f) throw new NotFoundError('File not found.');
  return f;
}

const EDITABLE: RfqStatus[] = ['estimator_review', 'returned'];

/** Re-costs after the estimator changes parts, margin, due date or requirements. Approved and closed quotes are locked. */
export async function updateRfq(id: string, raw: unknown): Promise<RfqDetail> {
  uuid(id, 'RFQ');
  const b = asRecord(raw, 'The update');
  const db = getDb();
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(rfqs).where(eq(rfqs.id, id)).for('update');
    if (!cur) throw new NotFoundError('RFQ not found.');
    if (!EDITABLE.includes(cur.status)) throw new ConflictError('This quote is approved or closed. Reopen it to make changes.');

    const patch: Partial<typeof rfqs.$inferInsert> = { updatedAt: new Date() };
    if (b.customerName !== undefined) patch.customerName = text(b.customerName, 'Customer name', { max: 200 });
    if (b.contactEmail !== undefined) patch.contactEmail = optEmail(b.contactEmail, 'Contact email') ?? null;
    if (b.subject !== undefined) patch.subject = optText(b.subject, 'Subject', 200) ?? null;
    if (b.estimatorNotes !== undefined) patch.estimatorNotes = optText(b.estimatorNotes, 'Notes', 5000) ?? null;
    if (b.dueDate !== undefined) patch.dueDate = optIsoDate(b.dueDate, 'Due date') ?? null;
    if (b.customerId !== undefined) {
      const cid = optUuid(b.customerId, 'Customer');
      if (cid) await requireCustomer(tx, cid);
      patch.customerId = cid ?? null;
    }
    if (b.certifications !== undefined) {
      patch.certifications = list(b.certifications, 'Certifications', { max: 30 }).map((c, i) => text(c, `Certification ${i + 1}`, { max: 60 }));
    }
    if (b.targetMarginPct !== undefined) {
      patch.targetMarginPct = b.targetMarginPct === null || b.targetMarginPct === '' ? null : String(optMoney(b.targetMarginPct, 'Margin', { max: 90, allowZero: true }));
    }

    const ctx = await loadContext(tx);
    const fileRows = await tx
      .select({ fileName: rfqFiles.fileName, kind: rfqFiles.kind, contentType: rfqFiles.contentType, fileSize: rfqFiles.fileSize })
      .from(rfqFiles)
      .where(eq(rfqFiles.rfqId, id));

    let parts: PartInput[];
    if (b.parts !== undefined) {
      parts = list(b.parts, 'Parts', { max: 200 }).map((p, i) => parsePartInput(p, i + 1));
    } else {
      parts = (await tx.select().from(rfqParts).where(eq(rfqParts.rfqId, id)).orderBy(rfqParts.lineNumber)).map(rowToPart);
    }
    const margin = 'targetMarginPct' in patch ? num(patch.targetMarginPct as string | null) : num(cur.targetMarginPct);
    const result = runPipeline(
      parts,
      { dueDate: 'dueDate' in patch ? (patch.dueDate as string | null) : cur.dueDate, certifications: patch.certifications ?? cur.certifications, marginPct: margin },
      fileRows,
      ctx,
      new Set(),
    );
    // Files read by Claude at intake stay "read"; a re-cost can't know that, so keep the earlier note about unread files.
    const earlier = (cur.flags as Flag[]).find((f) => f.code === 'FILES_NOT_READ');
    if (!earlier) result.flags = result.flags.filter((f) => f.code !== 'FILES_NOT_READ');

    await tx
      .update(rfqs)
      .set({ ...patch, costTotal: String(result.costTotal), priceTotal: String(result.priceTotal), flags: result.flags, status: 'estimator_review' })
      .where(eq(rfqs.id, id));
    await tx.delete(rfqParts).where(eq(rfqParts.rfqId, id));
    if (result.parts.length) await tx.insert(rfqParts).values(partsToRows(id, result.parts));
    return getRfq(id, tx);
  });
}

export type RfqAction = 'approve' | 'return' | 'decline' | 'reopen' | 'won' | 'lost' | 'to-estimate';

export async function rfqAction(id: string, raw: unknown): Promise<RfqDetail> {
  uuid(id, 'RFQ');
  const b = asRecord(raw, 'The request');
  const action = b.action as RfqAction;
  const db = getDb();

  if (action === 'to-estimate') return convertToEstimate(id, b);

  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(rfqs).where(eq(rfqs.id, id)).for('update');
    if (!cur) throw new NotFoundError('RFQ not found.');
    const set: Partial<typeof rfqs.$inferInsert> = { updatedAt: new Date() };
    const note = optText(b.note, 'Note', 5000);
    if (note) set.estimatorNotes = [cur.estimatorNotes, note].filter(Boolean).join('\n');
    switch (action) {
      case 'approve': {
        if (cur.status !== 'estimator_review') throw new ConflictError('Only a quote waiting for estimator review can be approved.');
        const parts = await tx.select({ n: sql<number>`count(*)::int` }).from(rfqParts).where(eq(rfqParts.rfqId, id));
        if (!parts[0].n) throw new ValidationError('Add at least one part before approving.');
        const flags = cur.flags as Flag[];
        const high = flags.filter((f) => f.severity === 'high');
        if (high.length && b.acknowledgedFlags !== true) {
          throw new ValidationError(`${high.length} high-priority flag${high.length === 1 ? '' : 's'} must be reviewed first. Confirm you have checked them to approve.`);
        }
        set.status = 'approved';
        set.approvedAt = new Date();
        break;
      }
      case 'return':
        if (cur.status !== 'estimator_review') throw new ConflictError('Only a quote waiting for estimator review can be returned.');
        if (!note) throw new ValidationError('Say what needs fixing so the preparer knows.');
        set.status = 'returned';
        break;
      case 'decline':
        if (!EDITABLE.includes(cur.status)) throw new ConflictError('This quote is already approved or closed.');
        set.status = 'declined';
        break;
      case 'reopen':
        if (!['approved', 'returned', 'declined'].includes(cur.status)) throw new ConflictError('Only an approved, returned or declined quote can be reopened.');
        if (cur.estimateId) throw new ConflictError('An estimate has already been created from this quote. Change that estimate instead.');
        set.status = 'estimator_review';
        set.approvedAt = null;
        break;
      case 'won':
      case 'lost':
        if (cur.status !== 'approved') throw new ConflictError('Only an approved quote can be marked won or lost.');
        set.status = action;
        break;
      default:
        throw new ValidationError('Unknown action.');
    }
    await tx.update(rfqs).set(set).where(eq(rfqs.id, id));
    return getRfq(id, tx);
  });
}

/** Turns an approved quote into a draft Estimate so it can be sent to the customer from the Estimates tab. */
async function convertToEstimate(id: string, b: Record<string, unknown>): Promise<RfqDetail> {
  const db = getDb();
  const cur = await getRfq(id);
  if (cur.status !== 'approved') throw new ConflictError('Approve the quote before creating an estimate from it.');
  if (cur.estimateId) throw new ConflictError('An estimate was already created from this quote.');
  const customerId = optUuid(b.customerId, 'Customer') ?? cur.customerId;
  if (!customerId) throw new ValidationError('Choose the customer this estimate is for.');
  const expiration = new Date(Date.now() + cur.settings.quoteValidDays * 86_400_000).toISOString().slice(0, 10);
  const estimate = await createEstimate({
    customerId,
    email: cur.contactEmail ?? undefined,
    expirationDate: expiration,
    lines: cur.parts.map((p) => ({
      itemId: '',
      description: `${p.partNumber ? `${p.partNumber} — ` : ''}${p.description}${p.material ? ` (${p.material})` : ''} [${cur.rfqNumber}]`.slice(0, 500),
      quantity: p.qty,
      unitPrice: p.costing.unitPrice,
    })),
  });
  // Only one request may claim the link; the guard keeps a double click from creating two estimates' worth of confusion.
  const claimed = await db
    .update(rfqs)
    .set({ estimateId: estimate.Id, customerId, updatedAt: new Date() })
    .where(and(eq(rfqs.id, id), sql`${rfqs.estimateId} is null`))
    .returning({ id: rfqs.id });
  if (claimed.length === 0) throw new ConflictError('An estimate was already created from this quote.');
  return getRfq(id);
}

export async function seedSampleRules(): Promise<{ added: boolean }> {
  const db = getDb();
  const [existing] = await db.select({ n: sql<number>`count(*)::int` }).from(routingRules);
  if (existing.n > 0) return { added: false };
  const today = Date.now();
  const ago = (d: number) => new Date(today - d * 86_400_000).toISOString().slice(0, 10);
  await saveSettings({ targetMarginPct: 28, overheadPct: 12, scrapPct: 5, priceStaleDays: 30, minLeadDays: 10, quoteValidDays: 30, certifications: ['ISO 9001:2015'] });
  const prices: [string, string, number, number][] = [
    ['6061-T6 Aluminum', 'Reliable Metals Co.', 4.28, 52],
    ['6061-T6 Aluminum', 'Summit Supply', 4.51, 45],
    ['7075-T6 Aluminum', 'Reliable Metals Co.', 6.1, 12],
    ['304 Stainless', 'Gulf Steel', 2.95, 9],
    ['1018 Steel', 'Gulf Steel', 0.92, 9],
    ['4140 Steel', 'Gulf Steel', 1.35, 40],
    ['Delrin', 'PolyPro', 6.8, 14],
  ];
  for (const [material, vendor, price, age] of prices) await savePrice({ material, vendor, price, priceDate: ago(age) });
  const rules: [string, string, number, number, number][] = [
    ['Milling', 'mill, machining, cnc', 1.5, 12, 95],
    ['Turning', 'lathe, turn', 1, 8, 85],
    ['Drilling', 'drill, bore, ream', 0.5, 3, 75],
    ['Tapping', 'tap, thread', 0.25, 2, 75],
    ['Finishing', 'deburr, polish, anodize, passivate', 0.25, 4, 55],
    ['Inspection', 'cmm, fai', 0.5, 2, 70],
  ];
  for (const [operation, keywords, setupHours, runMinutes, ratePerHour] of rules) await saveRoutingRule({ operation, keywords, setupHours, runMinutes, ratePerHour });
  const jobs: Record<string, unknown>[] = [
    { partNumber: '1023-001', description: 'Flange bracket housing', customerName: 'Gulf Coast Furniture Co.', material: '6061-T6 Aluminum', operations: 'Milling, Drilling, Tapping, Finishing', qty: 10, laborHoursPerPart: 0.62, materialCostPerPart: 7.4, unitPrice: 118.5, completedOn: ago(200) },
    { partNumber: '1023-004', description: 'Cover plate with gasket groove', customerName: 'Texas Tile Importers', material: '6061-T6 Aluminum', operations: 'Milling, Drilling', qty: 25, laborHoursPerPart: 0.35, materialCostPerPart: 4.1, unitPrice: 64, completedOn: ago(120) },
    { partNumber: '2210-100', description: 'Shaft coupling', customerName: 'Rio Grande Apparel', material: '1018 Steel', operations: 'Turning, Drilling, Tapping', qty: 50, laborHoursPerPart: 0.28, materialCostPerPart: 2.3, unitPrice: 41.75, completedOn: ago(90) },
    { partNumber: '3300-020', description: 'Sensor mount bracket', customerName: 'Southwest Auto Parts', material: '304 Stainless', operations: 'Milling, Drilling, Finishing', qty: 15, laborHoursPerPart: 0.55, materialCostPerPart: 6.9, unitPrice: 102, completedOn: ago(60) },
  ];
  for (const j of jobs) await savePriorJob(j);
  return { added: true };
}
