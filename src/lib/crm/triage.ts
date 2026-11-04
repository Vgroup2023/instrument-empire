import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { crmActivities, crmContacts, crmDeals } from '@/db/schema';
import { askJson, llmEnabled, str, type LlmClient } from '@/lib/llm/json';
import { record } from './service';
import { BUSINESSES, BUSINESS_KEYS, classifyInbound, type Activity, type Contact, type InboundIntent } from './model';

// Reading what comes in. Claude turns a raw email or text into a small, checked set of fields (what it is, how urgent,
// who it is for, what to do next); the plain rules always run first and are what is used if Claude is off, slow, or
// returns something that does not check out. Nothing here sends anything to anyone.

export const INTENTS: readonly InboundIntent[] = ['unsubscribe', 'meeting_request', 'pricing', 'complaint', 'question', 'other'];

export interface TriageTask { summary: string; dueInHours: number }
export interface Triage {
  intent: InboundIntent;
  /** 1 (whenever) to 5 (right now). */
  urgency: 1 | 2 | 3 | 4 | 5;
  /** -1 (angry) to 1 (delighted). */
  sentiment: number;
  business: string | null;
  summary: string;
  tasks: TriageTask[];
  doNotContact: boolean;
  /** 0 to 1: how sure the reader was. */
  confidence: number;
  source: 'ai' | 'rules';
}

const URGENT = /\b(urgent|urgently|asap|immediately|right away|emergency|deadline|today|tonight|overdue|penalt(y|ies)|seized|detained|on hold|customs hold|can't wait|cannot wait)\b/i;

/** The no-AI reading: the same intent rules the CRM has always used, plus a simple urgency guess. */
export function rulesTriage(subject: string | null | undefined, body: string | null | undefined): Triage {
  const intent = classifyInbound(subject, body);
  const text = `${subject ?? ''} ${body ?? ''}`;
  let urgency: Triage['urgency'] = ({ unsubscribe: 1, other: 1, question: 2, pricing: 3, meeting_request: 3, complaint: 4 } as const)[intent];
  if (URGENT.test(text) && intent !== 'unsubscribe') urgency = Math.min(5, urgency + 1) as Triage['urgency'];
  // The subject, then the start of the message (the body often begins with the subject, so that part is dropped).
  const subj = (subject ?? '').replace(/\s+/g, ' ').trim();
  let rest = (body ?? '').replace(/\s+/g, ' ').trim();
  if (subj && rest.startsWith(subj)) rest = rest.slice(subj.length).trim();
  const summary = [subj, rest].filter(Boolean).join(': ').slice(0, 160);
  return {
    intent, urgency, sentiment: intent === 'complaint' ? -0.7 : 0, business: null,
    summary, tasks: [], doNotContact: intent === 'unsubscribe', confidence: 0.5, source: 'rules',
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Checks what Claude returned, field by field, and falls back to the rules' answer for anything that does not check
 * out. "Stop contacting me" is only accepted from Claude if the rules agree or it is very sure.
 */
export function parseTriage(raw: unknown, fallback: Triage): Triage {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  const o = raw as Record<string, unknown>;
  const confidence = typeof o.confidence === 'number' && Number.isFinite(o.confidence) ? clamp(o.confidence, 0, 1) : 0.5;
  let intent = typeof o.intent === 'string' && (INTENTS as readonly string[]).includes(o.intent) ? (o.intent as InboundIntent) : fallback.intent;
  if (intent === 'unsubscribe' && fallback.intent !== 'unsubscribe' && confidence < 0.8) intent = fallback.intent;
  const urgency = typeof o.urgency === 'number' && Number.isFinite(o.urgency) ? (clamp(Math.round(o.urgency), 1, 5) as Triage['urgency']) : fallback.urgency;
  const sentiment = typeof o.sentiment === 'number' && Number.isFinite(o.sentiment) ? clamp(o.sentiment, -1, 1) : fallback.sentiment;
  const business = typeof o.business === 'string' && (BUSINESS_KEYS as readonly string[]).includes(o.business) ? o.business : null;
  const tasks: TriageTask[] = Array.isArray(o.tasks)
    ? o.tasks.slice(0, 3).flatMap((t) => {
        if (!t || typeof t !== 'object') return [];
        const r = t as Record<string, unknown>;
        const summary = str(r.summary, 160);
        const hours = typeof r.dueInHours === 'number' && Number.isFinite(r.dueInHours) ? clamp(Math.round(r.dueInHours), 1, 168) : 24;
        return summary ? [{ summary, dueInHours: hours }] : [];
      })
    : [];
  return {
    intent, urgency, sentiment, business,
    summary: str(o.summary, 200) ?? fallback.summary,
    tasks,
    doNotContact: intent === 'unsubscribe' && (o.doNotContact === true || fallback.doNotContact),
    confidence, source: 'ai',
  };
}

const SYSTEM = `You read messages that customers and leads send to the sales and service team of a group of four businesses:
${BUSINESSES.map((b) => `- ${b.key}: ${b.name}, ${b.tagline}`).join('\n')}
Return one JSON object with exactly these fields:
{"intent": "unsubscribe" | "meeting_request" | "pricing" | "complaint" | "question" | "other",
 "urgency": 1 to 5 (5 = needs a person right now, 1 = whenever),
 "sentiment": -1 to 1,
 "business": one of ${BUSINESS_KEYS.join(' | ')} or null if you cannot tell,
 "summary": one plain sentence of what they want,
 "tasks": up to 3 of {"summary": short action for our team, "dueInHours": 1 to 168},
 "doNotContact": true only if they clearly ask to stop being contacted,
 "confidence": 0 to 1}
Use "unsubscribe" only for a clear request to stop. Do not invent names, amounts or dates. If unsure, use null or "other" and a low confidence.`;

/** Reads one incoming message. Never throws: any trouble means the rules' answer. */
export async function triageMessage(
  m: { subject: string | null; body: string | null; contactName?: string | null },
  opts: { llm?: LlmClient; timeoutMs?: number } = {},
): Promise<Triage> {
  const rules = rulesTriage(m.subject, m.body);
  if (!(llmEnabled() || opts.llm)) return rules;
  const ask = askJson(SYSTEM, `From: ${m.contactName ?? 'unknown'}\nSubject: ${m.subject ?? ''}\n\n${(m.body ?? '').slice(0, 4000)}`, { client: opts.llm });
  const raw = await Promise.race([ask, new Promise<null>((r) => setTimeout(() => r(null), opts.timeoutMs ?? 5000))]);
  return parseTriage(raw, rules);
}

const BASE: Record<InboundIntent, number> = { complaint: 40, meeting_request: 25, pricing: 25, question: 10, other: 3, unsubscribe: 0 };

/**
 * How soon a message needs a person, 0 to 100. The same inputs always give the same number: what it is, how urgent it
 * reads, how big the deal is, whether the customer already owes us money, and how long they have waited for a reply.
 */
export function priorityScore(i: { intent: InboundIntent; urgency: number; dealValue: number; overdueInvoice: boolean; daysWaiting: number; newContact?: boolean }): number {
  const value = i.dealValue >= 10_000 ? 15 : i.dealValue >= 1_000 ? 10 : i.dealValue > 0 ? 5 : 0;
  const s = BASE[i.intent] + clamp(i.urgency, 1, 5) * 8 + value + (i.overdueInvoice ? 15 : 0) + clamp(Math.floor(i.daysWaiting), 0, 15) + (i.newContact ? 5 : 0);
  return clamp(Math.round(s), 0, 100);
}

// ---------------------------------------------------------------------------
// Acting on a reading
// ---------------------------------------------------------------------------

type Db = ReturnType<typeof getDb>;

/** Adds a task unless the same one is already open for this deal or contact. Returns whether it was added. */
async function addTaskOnce(db: Db, actor: string, t: { contactId: string | null; dealId: string | null; summary: string; detail?: string | null; dueInHours: number }, now: Date): Promise<boolean> {
  const where = [eq(crmActivities.kind, 'task'), isNull(crmActivities.doneAt), eq(crmActivities.summary, t.summary)];
  if (t.dealId) where.push(eq(crmActivities.dealId, t.dealId));
  else if (t.contactId) where.push(eq(crmActivities.contactId, t.contactId));
  const [dup] = await db.select({ id: crmActivities.id }).from(crmActivities).where(and(...where)).limit(1);
  if (dup) return false;
  await record(db, { contactId: t.contactId, dealId: t.dealId, kind: 'task', summary: t.summary, detail: t.detail ?? null, actor, dueAt: new Date(now.getTime() + t.dueInHours * 3_600_000) });
  return true;
}

/** What the CRM already knows about a contact that bears on how urgent their message is. */
export async function priorityContext(db: Db, contactId: string | null, customerId: string | null, now = Date.now()): Promise<{ dealValue: number; overdueInvoice: boolean; daysWaiting: number }> {
  let dealValue = 0;
  let daysWaiting = 0;
  let overdueInvoice = false;
  if (contactId) {
    const [d] = await db.select({ v: sql<string>`coalesce(max(${crmDeals.value}), 0)` }).from(crmDeals).where(and(eq(crmDeals.contactId, contactId), sql`${crmDeals.stage} in ('lead','qualified','proposal','negotiation')`));
    dealValue = Number(d?.v ?? 0);
    const [o] = await db.select({ at: sql<string | null>`max(${crmActivities.createdAt})` }).from(crmActivities).where(and(eq(crmActivities.contactId, contactId), eq(crmActivities.direction, 'out')));
    const since = o?.at ? Date.parse(o.at) : null;
    daysWaiting = since ? Math.max(0, Math.floor((now - since) / 86_400_000)) : 0;
  }
  if (customerId) {
    const rows = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from invoices i
      where i.customer_id = ${customerId} and i.due_date < current_date
        and (select coalesce(sum(amount), 0) from invoice_lines where invoice_id = i.id) - (select coalesce(sum(amount), 0) from invoice_payments where invoice_id = i.id) > 0`);
    overdueInvoice = Number([...rows][0]?.n ?? 0) > 0;
  }
  return { dealValue, overdueInvoice, daysWaiting };
}

export interface AppliedTriage { claimed: boolean; priority: number; tasksAdded: number; dealValue: number }

/**
 * Records a reading on the message and does what it calls for: stops follow-ups for someone who asked to stop, adds the
 * follow-up tasks, tags an untagged contact with the business the message is about, and works out the priority. Claims
 * the message first, so two runs at the same moment never act twice. The caller raises any alerts from the result.
 */
export async function applyTriage(
  a: Pick<Activity, 'id' | 'contactId' | 'dealId' | 'summary'>,
  contact: Pick<Contact, 'id' | 'name' | 'business' | 'customerId' | 'doNotContact' | 'createdAt'> | null,
  t: Triage,
  opts: { actor: string; now?: Date; newContact?: boolean },
): Promise<AppliedTriage> {
  const db = getDb();
  const now = opts.now ?? new Date();
  const ctx = await priorityContext(db, contact?.id ?? null, contact?.customerId ?? null, now.getTime());
  const priority = priorityScore({ intent: t.intent, urgency: t.urgency, ...ctx, newContact: opts.newContact });
  const [claimed] = await db
    .update(crmActivities)
    .set({ triagedAt: now, triage: t, priority, updatedAt: new Date() })
    .where(and(eq(crmActivities.id, a.id), isNull(crmActivities.triagedAt)))
    .returning({ id: crmActivities.id });
  if (!claimed) return { claimed: false, priority, tasksAdded: 0, dealValue: ctx.dealValue };

  const who = contact?.name ?? 'a contact';
  let tasksAdded = 0;
  if (contact && !contact.business && t.business && t.confidence >= 0.7) {
    await db.update(crmContacts).set({ business: t.business, updatedAt: new Date() }).where(and(eq(crmContacts.id, contact.id), isNull(crmContacts.business)));
  }
  if (t.intent === 'unsubscribe') {
    if (contact && !contact.doNotContact) {
      await db.update(crmContacts).set({ doNotContact: true, followUpDays: null, updatedAt: new Date() }).where(eq(crmContacts.id, contact.id));
      await record(db, { contactId: contact.id, dealId: a.dealId, kind: 'note', summary: `${who} asked to stop contact. No more follow-up messages will be drafted.`, actor: opts.actor });
    }
    return { claimed: true, priority, tasksAdded, dealValue: ctx.dealValue };
  }
  const base = { contactId: a.contactId, dealId: a.dealId, detail: t.summary || a.summary };
  const fixed: Partial<Record<InboundIntent, { summary: string; dueInHours: number }>> = {
    meeting_request: { summary: `Reply to ${who}: they want to meet`, dueInHours: 4 },
    pricing: { summary: `Send ${who} the pricing they asked about`, dueInHours: 24 },
    complaint: { summary: `Call ${who} back: they sound unhappy`, dueInHours: 2 },
    question: { summary: `Answer ${who}'s question`, dueInHours: 24 },
  };
  const main = fixed[t.intent];
  // A high-urgency message is due sooner, whatever it is.
  if (main && (await addTaskOnce(db, opts.actor, { ...base, summary: main.summary, dueInHours: t.urgency >= 5 ? Math.min(main.dueInHours, 1) : main.dueInHours }, now))) tasksAdded++;
  for (const extra of t.tasks) if (await addTaskOnce(db, opts.actor, { ...base, summary: extra.summary, dueInHours: extra.dueInHours }, now)) tasksAdded++;
  return { claimed: true, priority, tasksAdded, dealValue: ctx.dealValue };
}
