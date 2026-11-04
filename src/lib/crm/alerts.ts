import { and, desc, eq, gt, inArray, lt, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { crmAlerts } from '@/db/schema';
import { smtpConfig } from '@/lib/config';
import { sendEmail, sendSms, twilio, reportRecipients } from './comms';

// Instant alerts. Something that should not wait for the next daily report (an unhappy customer, a hot lead, a big deal
// going quiet, a won deal's invoice going unpaid) is written to a small queue and sent at once to the channels that are
// set up: email, text message, and Microsoft Teams. A channel that fails is retried on the next agent run, a few times,
// and the same event is never alerted twice (the dedupe key).

export type AlertKind = 'complaint' | 'hot_lead' | 'meeting_request' | 'stalled_deal' | 'overdue_invoice' | 'test';
export type Severity = 'critical' | 'important' | 'info';
export type Channel = 'email' | 'sms' | 'teams';

/** Which channels each kind of alert goes to. */
export const CHANNELS_FOR: Record<Severity, readonly Channel[]> = {
  critical: ['email', 'sms', 'teams'],
  important: ['email', 'teams'],
  info: ['email'],
};
const MAX_ATTEMPTS = 5;

const list = (v: string | undefined) => (v ?? '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);

/** Where alerts go, from the environment. Email falls back to the report recipients; texts need Twilio too. */
export function alertRoutes(): { email: string[]; sms: string[]; teams: string | null } {
  const email = list(process.env.CRM_ALERT_EMAIL).filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  const sms = list(process.env.CRM_ALERT_SMS).map((s) => s.replace(/[^\d+]/g, '')).filter((s) => s.replace(/\D/g, '').length >= 7);
  return { email: email.length ? email : reportRecipients(), sms, teams: teamsUrl() };
}

/** The Teams webhook address, if it is a safe one: https, or plain http only for a machine's own address (for testing). */
function teamsUrl(): string | null {
  const raw = (process.env.TEAMS_WEBHOOK_URL ?? '').trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:') return raw;
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return raw;
  } catch { /* not a web address */ }
  return null;
}

/** Which channels are ready to send right now. */
export function channelsReady(): Record<Channel, boolean> {
  const r = alertRoutes();
  return { email: smtpConfig.isConfigured && r.email.length > 0, sms: twilio.isConfigured && r.sms.length > 0, teams: r.teams !== null };
}

export interface NewAlert {
  dedupeKey: string;
  kind: AlertKind;
  severity: Severity;
  title: string;
  body?: string;
  business?: string | null;
  contactId?: string | null;
  dealId?: string | null;
}

/** Puts an alert in the queue unless one with the same key is already there. */
export async function enqueueAlert(a: NewAlert): Promise<{ id: string | null; created: boolean }> {
  const [row] = await getDb()
    .insert(crmAlerts)
    .values({
      dedupeKey: a.dedupeKey.slice(0, 200), kind: a.kind, severity: a.severity, title: a.title.slice(0, 200), body: (a.body ?? '').slice(0, 1000),
      business: a.business ?? null, contactId: a.contactId ?? null, dealId: a.dealId ?? null,
    })
    .onConflictDoNothing({ target: crmAlerts.dedupeKey })
    .returning({ id: crmAlerts.id });
  return { id: row?.id ?? null, created: Boolean(row) };
}

type AlertRow = typeof crmAlerts.$inferSelect;

/** The Teams message: an Adaptive Card, which is what a Teams "Workflows" webhook accepts. */
export function renderTeamsCard(a: Pick<AlertRow, 'title' | 'body' | 'severity' | 'business'>, baseUrl: string | null): Record<string, unknown> {
  const colour = a.severity === 'critical' ? 'Attention' : a.severity === 'important' ? 'Warning' : 'Default';
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', text: a.title, weight: 'Bolder', size: 'Medium', wrap: true, color: colour },
          ...(a.body ? [{ type: 'TextBlock', text: a.body, wrap: true }] : []),
          ...(a.business ? [{ type: 'TextBlock', text: a.business, isSubtle: true, spacing: 'Small' }] : []),
        ],
        ...(baseUrl ? { actions: [{ type: 'Action.OpenUrl', title: 'Open the CRM', url: `${baseUrl.replace(/\/$/, '')}/dashboard/crm` }] } : {}),
      },
    }],
  };
}

async function sendTeams(url: string, card: Record<string, unknown>): Promise<string> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(card), signal: AbortSignal.timeout(6000) });
    return res.ok ? 'ok' : `Teams answered ${res.status}`;
  } catch (err) {
    return err instanceof Error ? err.message : 'Teams could not be reached';
  }
}

async function sendEach(items: string[], fn: (x: string) => Promise<{ ok: boolean; reason?: string }>): Promise<string> {
  const results = await Promise.all(items.map(fn));
  const bad = results.find((r) => !r.ok);
  return bad ? (bad.reason ?? 'failed') : 'ok';
}

export interface DeliverySummary { sent: number; retrying: number; failed: number; noChannel: number }

/**
 * Sends what is waiting. Safe to call from several places at once: each alert is claimed before it is sent. Stops
 * starting new ones after `budgetMs`, so a webhook that calls this can still answer quickly.
 */
export async function deliverPending(opts: { limit?: number; budgetMs?: number } = {}): Promise<DeliverySummary> {
  const db = getDb();
  const started = Date.now();
  const ready = channelsReady();
  const routes = alertRoutes();
  const baseUrl = process.env.APP_BASE_URL ?? null;
  const out: DeliverySummary = { sent: 0, retrying: 0, failed: 0, noChannel: 0 };
  const day = new Date(Date.now() - 86_400_000);
  const candidates = await db
    .select()
    .from(crmAlerts)
    .where(or(
      eq(crmAlerts.status, 'pending'),
      and(eq(crmAlerts.status, 'sending'), lt(crmAlerts.updatedAt, new Date(Date.now() - 120_000))),
      and(eq(crmAlerts.status, 'no_channel'), gt(crmAlerts.createdAt, day)),
    ))
    .orderBy(crmAlerts.createdAt)
    .limit(opts.limit ?? 20);

  for (const c of candidates) {
    if (opts.budgetMs && Date.now() - started > opts.budgetMs) break;
    const wanted = CHANNELS_FOR[c.severity as Severity]?.filter((ch) => ready[ch]) ?? [];
    if (wanted.length === 0) {
      await db.update(crmAlerts).set({ status: 'no_channel', updatedAt: new Date() }).where(eq(crmAlerts.id, c.id));
      out.noChannel++;
      continue;
    }
    const [claimed] = await db
      .update(crmAlerts)
      .set({ status: 'sending', updatedAt: new Date() })
      .where(and(eq(crmAlerts.id, c.id), or(eq(crmAlerts.status, 'pending'), eq(crmAlerts.status, 'no_channel'), and(eq(crmAlerts.status, 'sending'), lt(crmAlerts.updatedAt, new Date(Date.now() - 120_000))))))
      .returning();
    if (!claimed) continue;

    const delivered: Record<string, string> = { ...((claimed.delivered as Record<string, string>) ?? {}) };
    const text = `${claimed.title}${claimed.body ? `\n\n${claimed.body}` : ''}${baseUrl ? `\n\n${baseUrl.replace(/\/$/, '')}/dashboard/crm` : ''}`;
    for (const ch of wanted) {
      if (delivered[ch] === 'ok') continue;
      if (ch === 'email') delivered.email = await sendEach(routes.email, (to) => sendEmail(to, `[CRM] ${claimed.title}`, text));
      else if (ch === 'sms') delivered.sms = await sendEach(routes.sms, (to) => sendSms(to, `${claimed.title}${claimed.body ? ` - ${claimed.body}` : ''}`.slice(0, 300)));
      else if (ch === 'teams' && routes.teams) delivered.teams = await sendTeams(routes.teams, renderTeamsCard(claimed, baseUrl));
    }
    const allOk = wanted.every((ch) => delivered[ch] === 'ok');
    const attempts = claimed.attempts + 1;
    const failure = wanted.map((ch) => (delivered[ch] === 'ok' ? null : `${ch}: ${delivered[ch]}`)).filter(Boolean).join('; ');
    const status = allOk ? 'sent' : attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    await db.update(crmAlerts).set({ status, attempts, delivered, lastError: allOk ? null : failure, sentAt: allOk ? new Date() : null, updatedAt: new Date() }).where(eq(crmAlerts.id, c.id));
    if (allOk) out.sent++;
    else if (status === 'failed') out.failed++;
    else out.retrying++;
  }
  return out;
}

export async function recentAlerts(limit = 8): Promise<{ id: string; kind: string; severity: string; title: string; status: string; delivered: Record<string, string>; lastError: string | null; createdAt: string }[]> {
  const rows = await getDb().select().from(crmAlerts).orderBy(desc(crmAlerts.createdAt)).limit(limit);
  return rows.map((r) => ({ id: r.id, kind: r.kind, severity: r.severity, title: r.title, status: r.status, delivered: (r.delivered as Record<string, string>) ?? {}, lastError: r.lastError, createdAt: r.createdAt.toISOString() }));
}

/** Alerts that need looking at: gave up, or nothing was set up to send them. */
export async function alertTrouble(): Promise<{ failed: number; noChannel: number }> {
  const [r] = await getDb().select({
    failed: sql<number>`count(*) filter (where ${crmAlerts.status} = 'failed')::int`,
    noChannel: sql<number>`count(*) filter (where ${crmAlerts.status} = 'no_channel' and ${crmAlerts.createdAt} > now() - interval '7 days')::int`,
  }).from(crmAlerts).where(inArray(crmAlerts.status, ['failed', 'no_channel']));
  return { failed: Number(r?.failed ?? 0), noChannel: Number(r?.noChannel ?? 0) };
}
