import { and, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { agentRuns, crmActivities, crmContacts, crmDeals, crmDrafts, crmReports, workforceSettings } from '@/db/schema';
import { askJson, llmEnabled, str, type LlmClient } from '@/lib/llm/json';
import { companyName } from '@/lib/desk/notify';
import { dateInZone, timeInZone } from '@/lib/workforce/time';
import { sendEmail, reportRecipients } from './comms';
import { record, toActivity, toContact, toDeal, toReport } from './service';
import {
  INTENT_LABEL, OPEN_STAGES, STALE_DEAL_DAYS, classifyInbound, followUpDue, renderReport, stageInfo, summarizePeriod,
  type Activity, type Contact, type Deal, type InboundIntent, type Report,
} from './model';

// The CRM's AI agents. They do the routine work (read what came in, notice who has gone quiet, write the follow-up,
// compile the daily and weekly report) and leave a clear trail of what they did. They never send a customer message on
// their own: follow-ups are written as drafts for a person to read, change and send. With no ANTHROPIC_API_KEY they
// fall back to plain rules and templates, so they always work.

export type CrmAgentId = 'crm-inbox' | 'crm-follow-up' | 'crm-pipeline' | 'crm-digest';
export const CRM_AGENTS: { id: CrmAgentId; name: string; summary: string }[] = [
  { id: 'crm-inbox', name: 'Inbox agent', summary: 'Reads every email, text and call that comes in, spots questions, meeting requests and "stop" replies, and makes the follow-up task.' },
  { id: 'crm-follow-up', name: 'Follow-up agent', summary: 'Finds people you have not been in touch with for their follow-up period (weekly by default) and writes a draft email for you to approve.' },
  { id: 'crm-pipeline', name: 'Pipeline agent', summary: 'Watches open deals for ones gone quiet or past their close date and adds a check-in task.' },
  { id: 'crm-digest', name: 'Reporting agent', summary: 'Writes the daily report each morning and the weekly report each Monday, and emails them if a recipient is set.' },
];

export interface CrmAgentSummary {
  agent: CrmAgentId;
  handled: number;
  error?: string;
}

const DAY = 86_400_000;
const MAX_DRAFTS_PER_RUN = 25;
const AGENT_ACTOR: Record<CrmAgentId, string> = { 'crm-inbox': 'Inbox agent', 'crm-follow-up': 'Follow-up agent', 'crm-pipeline': 'Pipeline agent', 'crm-digest': 'Reporting agent' };

interface Deps {
  now: Date;
  llm?: LlmClient;
  useLlm: boolean;
}

async function openTaskExists(contactId: string | null, dealId: string | null, summary: string): Promise<boolean> {
  const db = getDb();
  const where = [eq(crmActivities.kind, 'task'), isNull(crmActivities.doneAt), eq(crmActivities.summary, summary)];
  if (dealId) where.push(eq(crmActivities.dealId, dealId));
  else if (contactId) where.push(eq(crmActivities.contactId, contactId));
  const [row] = await db.select({ id: crmActivities.id }).from(crmActivities).where(and(...where)).limit(1);
  return Boolean(row);
}

async function addTask(d: Deps, agent: CrmAgentId, t: { contactId: string | null; dealId: string | null; summary: string; detail?: string; dueInHours: number }): Promise<boolean> {
  if (await openTaskExists(t.contactId, t.dealId, t.summary)) return false;
  await record(getDb(), {
    contactId: t.contactId, dealId: t.dealId, kind: 'task', summary: t.summary, detail: t.detail ?? null, actor: AGENT_ACTOR[agent],
    dueAt: new Date(d.now.getTime() + t.dueInHours * 3_600_000),
  });
  return true;
}

// ---------------------------------------------------------------------------
// Inbox agent
// ---------------------------------------------------------------------------

const INTENTS: InboundIntent[] = ['unsubscribe', 'meeting_request', 'pricing', 'complaint', 'question', 'other'];

async function readIntent(d: Deps, subject: string | null, body: string | null): Promise<InboundIntent> {
  const rules = classifyInbound(subject, body);
  if (!d.useLlm || rules === 'unsubscribe') return rules;
  const raw = await askJson(
    'You read messages that customers and leads send to a sales team.',
    `Classify this message. Return {"intent": one of ${INTENTS.join(' | ')}}. Use "unsubscribe" only if they clearly ask to stop being contacted.\n\nSubject: ${subject ?? ''}\n\n${(body ?? '').slice(0, 4000)}`,
    { client: d.llm },
  );
  const intent = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).intent : null;
  return typeof intent === 'string' && (INTENTS as string[]).includes(intent) ? (intent as InboundIntent) : rules;
}

async function runInbox(d: Deps): Promise<number> {
  const db = getDb();
  const rows = await db
    .select()
    .from(crmActivities)
    .where(and(eq(crmActivities.direction, 'in'), isNull(crmActivities.triagedAt), inArray(crmActivities.kind, ['email', 'sms']), gte(crmActivities.createdAt, new Date(d.now.getTime() - 14 * DAY))))
    .orderBy(crmActivities.createdAt)
    .limit(100);
  let handled = 0;
  for (const a of rows) {
    const contact = a.contactId ? (await db.select().from(crmContacts).where(eq(crmContacts.id, a.contactId)))[0] : undefined;
    const who = contact?.name ?? 'a contact';
    const intent = await readIntent(d, a.kind === 'email' ? a.summary : null, `${a.summary}\n${a.detail ?? ''}`);
    // Claim it first, so a second run at the same moment does not make a second task.
    const [claimed] = await db.update(crmActivities).set({ triagedAt: d.now, updatedAt: new Date() }).where(and(eq(crmActivities.id, a.id), isNull(crmActivities.triagedAt))).returning({ id: crmActivities.id });
    if (!claimed) continue;
    handled++;
    if (intent === 'unsubscribe' && contact && !contact.doNotContact) {
      await db.update(crmContacts).set({ doNotContact: true, followUpDays: null, updatedAt: new Date() }).where(eq(crmContacts.id, contact.id));
      await record(db, { contactId: contact.id, dealId: a.dealId, kind: 'note', summary: `${who} asked to stop contact. No more follow-up messages will be drafted.`, actor: AGENT_ACTOR['crm-inbox'] });
    } else if (intent === 'meeting_request') {
      await addTask(d, 'crm-inbox', { contactId: a.contactId, dealId: a.dealId, summary: `Reply to ${who}: they want to meet`, detail: a.summary, dueInHours: 4 });
    } else if (intent === 'pricing') {
      await addTask(d, 'crm-inbox', { contactId: a.contactId, dealId: a.dealId, summary: `Send ${who} the pricing they asked about`, detail: a.summary, dueInHours: 24 });
    } else if (intent === 'complaint') {
      await addTask(d, 'crm-inbox', { contactId: a.contactId, dealId: a.dealId, summary: `Call ${who} back: they sound unhappy`, detail: a.summary, dueInHours: 2 });
    } else if (intent === 'question') {
      await addTask(d, 'crm-inbox', { contactId: a.contactId, dealId: a.dealId, summary: `Answer ${who}'s question`, detail: a.summary, dueInHours: 24 });
    }
  }
  return handled;
}

// ---------------------------------------------------------------------------
// Follow-up agent
// ---------------------------------------------------------------------------

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there';
}

function templateFollowUp(c: Contact, deal: Deal | undefined): { subject: string; body: string } {
  const topic = deal ? deal.title : null;
  return {
    subject: topic ? `Checking in: ${topic}` : 'Checking in',
    body: `Hi ${firstName(c.name)},\n\nI wanted to follow up${topic ? ` on ${topic}` : ''}. Is there anything you need from us, or any questions I can answer?\n\nIf it helps, we can set up a quick call this week.\n\nBest regards,\n${companyName()}`,
  };
}

async function writeFollowUp(d: Deps, c: Contact, deal: Deal | undefined, history: Activity[]): Promise<{ subject: string; body: string }> {
  if (!d.useLlm) return templateFollowUp(c, deal);
  const recent = history.slice(0, 6).map((a) => `- ${a.createdAt.slice(0, 10)} ${a.kind}${a.direction ? ` (${a.direction === 'in' ? 'received' : 'sent'})` : ''}: ${a.summary}`).join('\n');
  const raw = await askJson(
    `You write short, warm follow-up emails for a sales rep at ${companyName()}. Plain text, three to five sentences, no made-up facts, no promises about price or dates, no placeholders in brackets. End with a clear, easy next step.`,
    `Write a follow-up email to ${c.name}${c.company ? ` at ${c.company}` : ''}.\n${deal ? `Open deal: ${deal.title}, stage ${stageInfo(deal.stage).label}.\n` : ''}Recent history:\n${recent || '(none)'}\n\nReturn {"subject": string, "body": string}. Sign off with "${companyName()}".`,
    { client: d.llm, maxTokens: 700 },
  );
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const subject = str(r.subject, 200);
  const body = str(r.body, 3000);
  return subject && body ? { subject, body } : templateFollowUp(c, deal);
}

async function runFollowUp(d: Deps): Promise<number> {
  const db = getDb();
  const [contactRows, dealRows] = await Promise.all([
    db.select().from(crmContacts).where(and(eq(crmContacts.doNotContact, false), sql`${crmContacts.email} is not null`, sql`${crmContacts.status} <> 'archived'`)).limit(1000),
    db.select().from(crmDeals).where(inArray(crmDeals.stage, [...OPEN_STAGES])).limit(1000),
  ]);
  const openDealsBy = new Map<string, Deal[]>();
  for (const r of dealRows) {
    const deal = toDeal(r);
    if (deal.contactId) openDealsBy.set(deal.contactId, [...(openDealsBy.get(deal.contactId) ?? []), deal]);
  }
  let made = 0;
  for (const row of contactRows) {
    if (made >= MAX_DRAFTS_PER_RUN) break;
    const c = toContact(row);
    const deals = openDealsBy.get(c.id) ?? [];
    // People with an open deal are followed up weekly unless told otherwise; everyone else only if a cadence was set.
    const days = c.followUpDays ?? (deals.length ? 7 : null);
    if (!days || !followUpDue({ ...c, followUpDays: days }, d.now.getTime())) continue;
    // One draft per person per period: a pending one, or any made within the period (even if dismissed), is enough.
    const [recent] = await db
      .select({ id: crmDrafts.id })
      .from(crmDrafts)
      .where(and(eq(crmDrafts.contactId, c.id), or(eq(crmDrafts.status, 'pending'), gte(crmDrafts.createdAt, new Date(d.now.getTime() - days * DAY)))))
      .limit(1);
    if (recent) continue;
    const deal = deals.sort((a, b) => b.value - a.value)[0];
    const history = (await db.select().from(crmActivities).where(eq(crmActivities.contactId, c.id)).orderBy(desc(crmActivities.createdAt)).limit(8)).map(toActivity);
    const text = await writeFollowUp(d, c, deal, history);
    const quietDays = Math.floor((d.now.getTime() - Date.parse(c.lastContactAt ?? c.createdAt)) / DAY);
    await db.insert(crmDrafts).values({
      contactId: c.id, dealId: deal?.id ?? null, channel: 'email', subject: text.subject, body: text.body,
      reason: `No contact for ${quietDays} day${quietDays === 1 ? '' : 's'} (follow up every ${days}).`, createdBy: AGENT_ACTOR['crm-follow-up'],
    });
    await addTask(d, 'crm-follow-up', { contactId: c.id, dealId: deal?.id ?? null, summary: `Review the follow-up email for ${c.name}`, dueInHours: 4 });
    made++;
  }
  return made;
}

// ---------------------------------------------------------------------------
// Pipeline agent
// ---------------------------------------------------------------------------

async function runPipeline(d: Deps): Promise<number> {
  const db = getDb();
  const today = d.now.toISOString().slice(0, 10);
  const rows = await db.select().from(crmDeals).where(inArray(crmDeals.stage, [...OPEN_STAGES])).limit(1000);
  let n = 0;
  for (const r of rows) {
    const deal = toDeal(r);
    const quiet = Math.floor((d.now.getTime() - Date.parse(deal.updatedAt)) / DAY);
    if (quiet >= STALE_DEAL_DAYS) {
      if (await addTask(d, 'crm-pipeline', { contactId: deal.contactId, dealId: deal.id, summary: `Check in on "${deal.title}": quiet for ${STALE_DEAL_DAYS}+ days`, detail: `Last activity ${quiet} days ago.`, dueInHours: 0 })) n++;
    }
    if (deal.expectedClose && deal.expectedClose < today) {
      if (await addTask(d, 'crm-pipeline', { contactId: deal.contactId, dealId: deal.id, summary: `Update the close date on "${deal.title}"`, detail: `It was expected to close on ${deal.expectedClose}.`, dueInHours: 0 })) n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Reporting agent
// ---------------------------------------------------------------------------

async function localClock(now: Date): Promise<{ date: string; hour: number; weekday: number; tz: string }> {
  const [row] = await getDb().select({ tz: workforceSettings.timezone }).from(workforceSettings).where(eq(workforceSettings.id, 1));
  const tz = row?.tz ?? 'America/New_York';
  const date = dateInZone(now, tz);
  return { date, hour: Number(timeInZone(now, tz).slice(0, 2)), weekday: new Date(`${date}T12:00:00Z`).getUTCDay(), tz };
}

async function narrative(d: Deps, kind: 'daily' | 'weekly', text: string): Promise<string | null> {
  if (!d.useLlm) return null;
  const raw = await askJson(
    'You summarize a sales CRM report for the business owner in plain, friendly language. Use only the figures given. No bullet points.',
    `Write a ${kind === 'daily' ? 'three' : 'four to five'} sentence summary of this ${kind} report, then one sentence saying the single most important thing to do next.\n\n${text}\n\nReturn {"summary": string}.`,
    { client: d.llm, maxTokens: 500 },
  );
  return raw && typeof raw === 'object' ? (str((raw as Record<string, unknown>).summary, 1200) ?? null) : null;
}

export async function generateReport(kind: 'daily' | 'weekly', opts: { now?: Date; llm?: LlmClient; force?: boolean } = {}): Promise<{ report: Report; created: boolean }> {
  const db = getDb();
  const now = opts.now ?? new Date();
  const d: Deps = { now, llm: opts.llm, useLlm: llmEnabled() || !!opts.llm };
  const clock = await localClock(now);
  // The weekly report is filed under its Monday so a manual run midweek replaces this week's, not next week's.
  const period = kind === 'daily' ? clock.date : new Date(Date.parse(`${clock.date}T12:00:00Z`) - ((clock.weekday + 6) % 7) * DAY).toISOString().slice(0, 10);
  const [existing] = await db.select().from(crmReports).where(and(eq(crmReports.kind, kind), eq(crmReports.period, period)));
  if (existing && !opts.force) return { report: toReport(existing), created: false };

  const from = new Date(now.getTime() - (kind === 'daily' ? 1 : 7) * DAY);
  const [dealRows, contactRows, actRows, [{ n: waiting }]] = await Promise.all([
    db.select().from(crmDeals).limit(1000),
    db.select().from(crmContacts).limit(1000),
    db.select().from(crmActivities).where(or(gte(crmActivities.createdAt, new Date(now.getTime() - 8 * DAY)), and(inArray(crmActivities.kind, ['task', 'meeting']), isNull(crmActivities.doneAt)))).limit(2000),
    db.select({ n: sql<number>`count(*)::int` }).from(crmDrafts).where(eq(crmDrafts.status, 'pending')),
  ]);
  const data = summarizePeriod(dealRows.map(toDeal), contactRows.map(toContact), actRows.map(toActivity), waiting, from, now, now.getTime());
  const label = kind === 'daily' ? clock.date : `week of ${period}`;
  const plain = renderReport(kind, label, data);
  const summary = await narrative(d, kind, plain);
  const body = renderReport(kind, label, data, summary);
  const title = `${kind === 'daily' ? 'Daily' : 'Weekly'} CRM report: ${label}`;
  const values = { kind, period, title, body, data, updatedAt: now };
  const [row] = existing
    ? await db.update(crmReports).set({ title, body, data, emailedAt: null, updatedAt: now }).where(eq(crmReports.id, existing.id)).returning()
    : await db.insert(crmReports).values(values).onConflictDoNothing().returning();
  if (!row) {
    const [again] = await db.select().from(crmReports).where(and(eq(crmReports.kind, kind), eq(crmReports.period, period)));
    return { report: toReport(again), created: false };
  }
  const to = reportRecipients();
  if (to.length) {
    const results = await Promise.all(to.map((address) => sendEmail(address, title, body)));
    if (results.some((r) => r.ok)) await db.update(crmReports).set({ emailedAt: new Date() }).where(eq(crmReports.id, row.id));
  }
  const [fresh] = await db.select().from(crmReports).where(eq(crmReports.id, row.id));
  return { report: toReport(fresh), created: true };
}

async function runDigest(d: Deps): Promise<number> {
  const clock = await localClock(d.now);
  if (clock.hour < 6) return 0; // reports go out in the morning
  let n = 0;
  if ((await generateReport('daily', { now: d.now, llm: d.llm })).created) n++;
  if (clock.weekday === 1 && (await generateReport('weekly', { now: d.now, llm: d.llm })).created) n++;
  return n;
}

// ---------------------------------------------------------------------------

/** Runs the four CRM agents in order. Safe to call often (hourly) and from several places at once. */
export async function runCrmAgents(opts: { now?: Date; llm?: LlmClient } = {}): Promise<CrmAgentSummary[]> {
  const db = getDb();
  const d: Deps = { now: opts.now ?? new Date(), llm: opts.llm, useLlm: llmEnabled() || !!opts.llm };
  const steps: [CrmAgentId, (x: Deps) => Promise<number>][] = [
    ['crm-inbox', runInbox],
    ['crm-follow-up', runFollowUp],
    ['crm-pipeline', runPipeline],
    ['crm-digest', runDigest],
  ];
  const out: CrmAgentSummary[] = [];
  for (const [agent, fn] of steps) {
    const [run] = await db.insert(agentRuns).values({ agent }).returning();
    try {
      const handled = await fn(d);
      await db.update(agentRuns).set({ finishedAt: new Date(), findingsCount: handled }).where(eq(agentRuns.id, run.id));
      out.push({ agent, handled });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await db.update(agentRuns).set({ finishedAt: new Date(), error: message }).where(eq(agentRuns.id, run.id));
      out.push({ agent, handled: 0, error: message });
    }
  }
  return out;
}

/** When each CRM agent last finished a run, for the CRM's agent panel. */
export async function lastCrmRuns(): Promise<Record<string, { at: string | null; handled: number; error: string | null }>> {
  const rows = await getDb().execute<{ agent: string; finished_at: string | null; findings_count: number; error: string | null }>(sql`
    select distinct on (agent) agent, finished_at, findings_count, error from agent_runs
    where agent in ('crm-inbox','crm-follow-up','crm-pipeline','crm-digest') order by agent, started_at desc`);
  return Object.fromEntries(rows.map((r) => [r.agent, { at: r.finished_at ? new Date(r.finished_at).toISOString() : null, handled: Number(r.findings_count), error: r.error }]));
}
