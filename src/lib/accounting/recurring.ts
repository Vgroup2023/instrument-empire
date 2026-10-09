import { getDb } from '@/db/client';
import { recurringTemplates } from '@/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import type { LineItemInput } from '@/lib/quickbooks/salesTypes';
import { createInvoice, sendInvoice } from '@/lib/accounting/invoices';
import { createEstimate, sendEstimate } from '@/lib/accounting/estimates';
import {
  NotFoundError,
  ValidationError,
  asRecord,
  isoDate,
  oneOf,
  optEmail,
  uuid,
} from '@/lib/validation';
import { parseSalesLines, requireCustomer } from '@/lib/accounting/entryRules';
import { customers } from '@/db/schema';

// This is the standalone, database-backed recurring-schedule engine. It's
// always been app-owned rather than a QuickBooks feature — the public
// Accounting API has no endpoint for recurring-transaction templates — but
// it used to create its documents through the QuickBooks-backed
// invoices/estimates modules; now that those run on this app's own
// database (see src/lib/accounting/invoices.ts and estimates.ts), a
// schedule's documents land in this app's own Invoices/Estimates tabs too.

export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringTemplate {
  id: string;
  docType: 'invoice' | 'estimate';
  customerId: string;
  customerName: string;
  email?: string;
  lines: LineItemInput[];
  frequency: RecurringFrequency;
  startDate: string;
  nextRunDate: string;
  autoSend: boolean;
  active: boolean;
  createdAt: string;
  lastRunDate?: string;
  lastCreatedDocId?: string;
  lastError?: string;
}

type TemplateRow = typeof recurringTemplates.$inferSelect;

function toTemplate(row: TemplateRow): RecurringTemplate {
  return {
    id: row.id,
    docType: row.docType,
    customerId: row.customerId,
    customerName: row.customerName,
    email: row.email ?? undefined,
    lines: JSON.parse(row.lines) as LineItemInput[],
    frequency: row.frequency,
    startDate: row.startDate,
    nextRunDate: row.nextRunDate,
    autoSend: row.autoSend,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    lastRunDate: row.lastRunDate ?? undefined,
    lastCreatedDocId: row.lastCreatedDocId ?? undefined,
    lastError: row.lastError ?? undefined,
  };
}

/**
 * Adds months to a UTC date without overflowing into the next month when
 * the target month is shorter — e.g. Jan 31 + 1 month lands on Feb 28/29,
 * not Mar 2/3 (JS Date's native rollover behavior). Without this, a
 * schedule set for the 29th/30th/31st would silently drift to a different
 * day every time it crosses a shorter month.
 */
function addUtcMonthsClamped(date: Date, months: number): void {
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const daysInTargetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, daysInTargetMonth));
}

export function computeNextRunDate(frequency: RecurringFrequency, from: string): string {
  const date = new Date(`${from}T00:00:00Z`);
  switch (frequency) {
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case 'monthly':
      addUtcMonthsClamped(date, 1);
      break;
    case 'quarterly':
      addUtcMonthsClamped(date, 3);
      break;
    case 'yearly':
      addUtcMonthsClamped(date, 12);
      break;
  }
  return date.toISOString().slice(0, 10);
}

export async function listRecurringTemplates(): Promise<RecurringTemplate[]> {
  const db = getDb();
  const rows = await db.select().from(recurringTemplates).orderBy(asc(recurringTemplates.nextRunDate));
  return rows.map(toTemplate);
}

export interface CreateRecurringInput {
  docType: 'invoice' | 'estimate';
  customerId: string;
  customerName: string;
  email?: string;
  lines: LineItemInput[];
  frequency: RecurringFrequency;
  startDate: string;
  autoSend: boolean;
}

const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
const DOC_TYPES = ['invoice', 'estimate'] as const;

export async function createRecurringTemplate(input: CreateRecurringInput): Promise<RecurringTemplate> {
  const raw = asRecord(input, 'The schedule');
  const docType = oneOf(raw.docType ?? 'invoice', 'Document type', DOC_TYPES);
  const customerId = uuid(raw.customerId, 'Customer');
  const lines = parseSalesLines(raw.lines);
  const frequency = oneOf(raw.frequency, 'Frequency', FREQUENCIES);
  const startDate = isoDate(raw.startDate, 'Start date');
  const email = optEmail(raw.email, 'Email');
  if (raw.autoSend !== undefined && typeof raw.autoSend !== 'boolean') throw new ValidationError('Auto-send must be true or false.');
  const autoSend = raw.autoSend === true;
  if (autoSend && !email) throw new ValidationError('Add an email address to send automatically.');

  const db = getDb();
  await requireCustomer(db, customerId);
  // The customer's name comes from the record itself, never from what the client sent.
  const [customer] = await db.select({ displayName: customers.displayName }).from(customers).where(eq(customers.id, customerId));
  const [row] = await db
    .insert(recurringTemplates)
    .values({
      docType,
      customerId,
      customerName: customer.displayName,
      email: email ?? null,
      lines: JSON.stringify(lines),
      frequency,
      startDate,
      nextRunDate: startDate,
      autoSend,
    })
    .returning();
  return toTemplate(row);
}

export async function setRecurringActive(id: string, active: boolean): Promise<void> {
  uuid(id, 'Schedule');
  if (typeof active !== 'boolean') throw new ValidationError('Active must be true or false.');
  const db = getDb();
  const updated = await db
    .update(recurringTemplates)
    .set({ active })
    .where(eq(recurringTemplates.id, id))
    .returning({ id: recurringTemplates.id });
  if (updated.length === 0) throw new NotFoundError('Recurring schedule not found.');
}

export async function deleteRecurringTemplate(id: string): Promise<void> {
  uuid(id, 'Schedule');
  const db = getDb();
  const deleted = await db
    .delete(recurringTemplates)
    .where(eq(recurringTemplates.id, id))
    .returning({ id: recurringTemplates.id });
  if (deleted.length === 0) throw new NotFoundError('Recurring schedule not found.');
}

/**
 * Creates (and optionally sends) documents for every schedule whose
 * nextRunDate has arrived. Intended to be triggered by an external
 * scheduler (cron job / hosting platform's scheduled functions) hitting
 * POST /api/recurring/run-due once a day.
 */
export async function runDueTemplates(): Promise<{ templateId: string; docId?: string; error?: string }[]> {
  const db = getDb();
  const rows = await db.select().from(recurringTemplates);
  const today = new Date().toISOString().slice(0, 10);
  const results: { templateId: string; docId?: string; error?: string }[] = [];

  for (const row of rows) {
    if (!row.active || row.nextRunDate > today) continue;

    // Claim this run first by moving nextRunDate forward with a compare-and-set, so two overlapping
    // runs (a retried cron call, a double-click) can't both create the same document.
    const nextRunDate = computeNextRunDate(row.frequency, row.nextRunDate);
    const claimed = await db
      .update(recurringTemplates)
      .set({ nextRunDate })
      .where(and(eq(recurringTemplates.id, row.id), eq(recurringTemplates.nextRunDate, row.nextRunDate), eq(recurringTemplates.active, true)))
      .returning({ id: recurringTemplates.id });
    if (claimed.length === 0) continue;

    let docId: string | undefined;
    try {
      const lines = JSON.parse(row.lines) as LineItemInput[];
      const base = { customerId: row.customerId, customerName: row.customerName, email: row.email ?? undefined, lines };
      if (row.docType === 'invoice') docId = (await createInvoice(base)).Id;
      else docId = (await createEstimate(base)).Id;
      await db
        .update(recurringTemplates)
        .set({ lastRunDate: today, lastError: null, lastCreatedDocId: docId })
        .where(eq(recurringTemplates.id, row.id));
      if (row.autoSend) {
        if (row.docType === 'invoice') await sendInvoice(docId, row.email ?? undefined);
        else await sendEstimate(docId, row.email ?? undefined);
      }
      results.push({ templateId: row.id, docId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (docId) {
        // The document exists, so this period is done — only the email failed. Don't hand the run back (that would duplicate the document).
        await db.update(recurringTemplates).set({ lastError: `Created but not sent: ${message}` }).where(eq(recurringTemplates.id, row.id));
        results.push({ templateId: row.id, docId, error: message });
      } else {
        // Nothing was created: give the run back so the next scheduled call retries it.
        await db.update(recurringTemplates).set({ lastError: message, nextRunDate: row.nextRunDate }).where(eq(recurringTemplates.id, row.id));
        results.push({ templateId: row.id, error: message });
      }
    }
  }

  return results;
}
