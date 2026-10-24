import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { taxReturns } from '@/db/schema';
import { NotFoundError, ValidationError, asRecord, oneOf, text, uuid } from '@/lib/validation';
import type { Country, TaxInputs } from './types';

// Stores the answers to the tax interview. The tax itself is recalculated from them whenever it is shown.

export interface TaxReturnRow {
  id: string;
  country: Country;
  taxYear: number;
  title: string;
  status: 'draft' | 'ready';
  inputs: TaxInputs;
  updatedAt: string;
}

/** The tax years the tables cover. A new year is added here together with its table in us.ts / canada.ts. */
export const SUPPORTED_TAX_YEARS = [2025];

const MAX_ANSWERS = 150;

function toRow(r: typeof taxReturns.$inferSelect): TaxReturnRow {
  return { id: r.id, country: r.country, taxYear: r.taxYear, title: r.title, status: r.status, inputs: r.inputs, updatedAt: r.updatedAt.toISOString() };
}

/** Keeps only plain answers: short names, numbers within reason, short text, true/false. Anything else is a 400. */
export function cleanInputs(raw: unknown): TaxInputs {
  const o = asRecord(raw, 'The answers');
  const keys = Object.keys(o);
  if (keys.length > MAX_ANSWERS) throw new ValidationError('Too many answers in one return.');
  const out: TaxInputs = {};
  for (const k of keys) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(k)) throw new ValidationError(`"${k}" is not a valid answer name.`);
    const v = o[k];
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || Math.abs(v) > 1e10) throw new ValidationError(`The amount for "${k}" is not valid.`);
      out[k] = v;
    } else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') {
      if (v.length > 200) throw new ValidationError(`The answer for "${k}" is too long.`);
      out[k] = v;
    } else if (v !== null && v !== undefined) throw new ValidationError(`The answer for "${k}" must be a number, text or yes/no.`);
  }
  return out;
}

export async function listTaxReturns(): Promise<TaxReturnRow[]> {
  const rows = await getDb().select().from(taxReturns).orderBy(desc(taxReturns.updatedAt)).limit(200);
  return rows.map(toRow);
}

export async function getTaxReturn(idRaw: unknown): Promise<TaxReturnRow> {
  const id = uuid(idRaw, 'Return');
  const [row] = await getDb().select().from(taxReturns).where(eq(taxReturns.id, id));
  if (!row) throw new NotFoundError('That return was not found.');
  return toRow(row);
}

export async function createTaxReturn(raw: unknown): Promise<TaxReturnRow> {
  const b = asRecord(raw, 'The return');
  const country = oneOf(b.country, 'Country', ['US', 'CA'] as const);
  const taxYear = Number(b.taxYear ?? SUPPORTED_TAX_YEARS[0]);
  if (!SUPPORTED_TAX_YEARS.includes(taxYear)) throw new ValidationError(`Tax year ${taxYear} is not available yet. Available: ${SUPPORTED_TAX_YEARS.join(', ')}.`);
  const title = text(b.title, 'Name', { max: 120 });
  const inputs: TaxInputs = country === 'US' ? { filingStatus: 'single' } : {};
  const [row] = await getDb().insert(taxReturns).values({ country, taxYear, title, inputs }).returning();
  return toRow(row);
}

export async function updateTaxReturn(idRaw: unknown, raw: unknown): Promise<TaxReturnRow> {
  const id = uuid(idRaw, 'Return');
  const b = asRecord(raw, 'The update');
  const patch: Partial<typeof taxReturns.$inferInsert> = { updatedAt: new Date() };
  if (b.title !== undefined) patch.title = text(b.title, 'Name', { max: 120 });
  if (b.status !== undefined) patch.status = oneOf(b.status, 'Status', ['draft', 'ready'] as const);
  if (b.inputs !== undefined) patch.inputs = cleanInputs(b.inputs);
  const [row] = await getDb().update(taxReturns).set(patch).where(eq(taxReturns.id, id)).returning();
  if (!row) throw new NotFoundError('That return was not found.');
  return toRow(row);
}

export async function deleteTaxReturn(idRaw: unknown): Promise<void> {
  const id = uuid(idRaw, 'Return');
  const deleted = await getDb().delete(taxReturns).where(eq(taxReturns.id, id)).returning({ id: taxReturns.id });
  if (deleted.length === 0) throw new NotFoundError('That return was not found.');
}
