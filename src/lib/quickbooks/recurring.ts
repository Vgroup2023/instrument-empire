import { readJsonFile, writeJsonFile } from '@/lib/store/jsonStore';
import type { LineItemInput } from '@/lib/quickbooks/salesTypes';
import { createInvoice, sendInvoice } from '@/lib/quickbooks/invoices';
import { createEstimate, sendEstimate } from '@/lib/quickbooks/estimates';

const FILE_NAME = 'recurring-templates.json';

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

async function loadAll(): Promise<RecurringTemplate[]> {
  return readJsonFile<RecurringTemplate[]>(FILE_NAME, []);
}

async function saveAll(templates: RecurringTemplate[]): Promise<void> {
  await writeJsonFile(FILE_NAME, templates);
}

export function computeNextRunDate(frequency: RecurringFrequency, from: string): string {
  const date = new Date(`${from}T00:00:00Z`);
  switch (frequency) {
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case 'monthly':
      date.setUTCMonth(date.getUTCMonth() + 1);
      break;
    case 'quarterly':
      date.setUTCMonth(date.getUTCMonth() + 3);
      break;
    case 'yearly':
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      break;
  }
  return date.toISOString().slice(0, 10);
}

export async function listRecurringTemplates(): Promise<RecurringTemplate[]> {
  const templates = await loadAll();
  return templates.sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate));
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
  const templates = await loadAll();
  const template: RecurringTemplate = {
    id: crypto.randomUUID(),
    docType: input.docType,
    customerId: input.customerId,
    customerName: input.customerName,
    email: input.email,
    lines: input.lines,
    frequency: input.frequency,
    startDate: input.startDate,
    nextRunDate: input.startDate,
    autoSend: input.autoSend,
    active: true,
    createdAt: new Date().toISOString(),
  };
  templates.push(template);
  await saveAll(templates);
  return template;
}

export async function setRecurringActive(id: string, active: boolean): Promise<void> {
  const templates = await loadAll();
  const template = templates.find((t) => t.id === id);
  if (!template) throw new Error('Recurring schedule not found.');
  template.active = active;
  await saveAll(templates);
}

export async function deleteRecurringTemplate(id: string): Promise<void> {
  const templates = await loadAll();
  await saveAll(templates.filter((t) => t.id !== id));
}

/**
 * Creates (and optionally sends) documents for every schedule whose
 * nextRunDate has arrived. Intended to be triggered by an external
 * scheduler (cron job / hosting platform's scheduled functions) hitting
 * POST /api/recurring/run-due once a day — the public QuickBooks API has no
 * built-in recurring-transaction endpoint, so this app owns the schedule.
 */
export async function runDueTemplates(): Promise<
  { templateId: string; docId?: string; error?: string }[]
> {
  const templates = await loadAll();
  const today = new Date().toISOString().slice(0, 10);
  const results: { templateId: string; docId?: string; error?: string }[] = [];

  for (const template of templates) {
    if (!template.active || template.nextRunDate > today) continue;

    try {
      if (template.docType === 'invoice') {
        const invoice = await createInvoice({
          customerId: template.customerId,
          customerName: template.customerName,
          email: template.email,
          lines: template.lines,
        });
        if (template.autoSend) await sendInvoice(invoice.Id, template.email);
        template.lastCreatedDocId = invoice.Id;
      } else {
        const estimate = await createEstimate({
          customerId: template.customerId,
          customerName: template.customerName,
          email: template.email,
          lines: template.lines,
        });
        if (template.autoSend) await sendEstimate(estimate.Id, template.email);
        template.lastCreatedDocId = estimate.Id;
      }
      template.lastRunDate = today;
      template.lastError = undefined;
      template.nextRunDate = computeNextRunDate(template.frequency, template.nextRunDate);
      results.push({ templateId: template.id, docId: template.lastCreatedDocId });
    } catch (err) {
      template.lastError = err instanceof Error ? err.message : 'Unknown error';
      results.push({ templateId: template.id, error: template.lastError });
    }
  }

  await saveAll(templates);
  return results;
}
