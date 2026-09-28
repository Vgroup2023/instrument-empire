import { getDb } from '@/db/client';
import { recurringTemplates } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import type { LineItemInput } from '@/lib/quickbooks/salesTypes';
import { createInvoice, sendInvoice } from '@/lib/accounting/invoices';
import { createEstimate, sendEstimate } from '@/lib/accounting/estimates';

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

export async function createRecurringTemplate(input: CreateRecurringInput): Promise<RecurringTemplate> {
  const db = getDb();
  const [row] = await db
    .insert(recurringTemplates)
    .values({
      docType: input.docType,
      customerId: input.customerId,
      customerName: input.customerName,
      email: input.email || null,
      lines: JSON.stringify(input.lines),
      frequency: input.frequency,
      startDate: input.startDate,
      nextRunDate: input.startDate,
      autoSend: input.autoSend,
    })
    .returning();
  return toTemplate(row);
}

export async function setRecurringActive(id: string, active: boolean): Promise<void> {
  const db = getDb();
  const updated = await db
    .update(recurringTemplates)
    .set({ active })
    .where(eq(recurringTemplates.id, id))
    .returning({ id: recurringTemplates.id });
  if (updated.length === 0) throw new Error('Recurring schedule not found.');
}

export async function deleteRecurringTemplate(id: string): Promise<void> {
  const db = getDb();
  const deleted = await db
    .delete(recurringTemplates)
    .where(eq(recurringTemplates.id, id))
    .returning({ id: recurringTemplates.id });
  if (deleted.length === 0) throw new Error('Recurring schedule not found.');
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

    try {
      const lines = JSON.parse(row.lines) as LineItemInput[];
      let docId: string;
      if (row.docType === 'invoice') {
        const invoice = await createInvoice({
          customerId: row.customerId,
          customerName: row.customerName,
          email: row.email ?? undefined,
          lines,
        });
        if (row.autoSend) await sendInvoice(invoice.Id, row.email ?? undefined);
        docId = invoice.Id;
      } else {
        const estimate = await createEstimate({
          customerId: row.customerId,
          customerName: row.customerName,
          email: row.email ?? undefined,
          lines,
        });
        if (row.autoSend) await sendEstimate(estimate.Id, row.email ?? undefined);
        docId = estimate.Id;
      }
      await db
        .update(recurringTemplates)
        .set({
          lastRunDate: today,
          lastError: null,
          lastCreatedDocId: docId,
          nextRunDate: computeNextRunDate(row.frequency, row.nextRunDate),
        })
        .where(eq(recurringTemplates.id, row.id));
      results.push({ templateId: row.id, docId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await db.update(recurringTemplates).set({ lastError: message }).where(eq(recurringTemplates.id, row.id));
      results.push({ templateId: row.id, error: message });
    }
  }

  return results;
}
