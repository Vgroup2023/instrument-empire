// CRM vocabulary and the calculations behind the CRM dashboard. Pure code (no database, no React), so the server, the
// browser and the tests all use the same numbers.

export const STAGES = [
  { key: 'lead', label: 'New lead', probability: 10, color: '#64748b' },
  { key: 'qualified', label: 'Qualified', probability: 25, color: '#3f5fe0' },
  { key: 'proposal', label: 'Quote sent', probability: 50, color: '#7c3aed' },
  { key: 'negotiation', label: 'Negotiation', probability: 75, color: '#f59e0b' },
  { key: 'won', label: 'Won', probability: 100, color: '#16a34a' },
  { key: 'lost', label: 'Lost', probability: 0, color: '#dc2626' },
] as const;
export type StageKey = (typeof STAGES)[number]['key'];
export const STAGE_KEYS = STAGES.map((s) => s.key) as unknown as readonly StageKey[];
export const OPEN_STAGES: readonly StageKey[] = ['lead', 'qualified', 'proposal', 'negotiation'];
export const stageInfo = (key: string) => STAGES.find((s) => s.key === key) ?? STAGES[0];

/** The group's businesses. A contact or deal belongs to at most one; untagged ones show as "Not tagged". */
// `color` is the accent used for dots, tags and text; `from`/`via`/`to` are the gradient stops of the business button;
// `ink` is the text colour that reads best on that gradient.
export const BUSINESSES = [
  { key: 'dr-simplicios', name: 'Dr. Simplicios', tagline: 'Concierge care for seniors', color: '#a16207', from: '#f7dd8a', via: '#d9a520', to: '#b07d0b', ink: '#3b2a00' },
  { key: 'bluestarimex', name: 'BlueStarImex', tagline: 'Global trade solutions', color: '#1d4ed8', from: '#2563eb', via: '#1d4ed8', to: '#1e3a8a', ink: '#ffffff' },
  { key: 'pivit-fishing', name: 'PIVIT Fishing', tagline: 'Premium jigs and lures', color: '#0f766e', from: '#0b857a', via: '#0f766e', to: '#115e59', ink: '#ffffff' },
  { key: 'globlex-ai', name: 'Globlex AI', tagline: 'The AI architect co.', color: '#64748b', from: '#f1f5f9', via: '#cbd5e1', to: '#94a3b8', ink: '#1e293b' },
] as const;
export type BusinessKey = (typeof BUSINESSES)[number]['key'];
export const BUSINESS_KEYS = BUSINESSES.map((b) => b.key) as unknown as readonly BusinessKey[];
export const businessInfo = (key: string | null | undefined) => BUSINESSES.find((b) => b.key === key) ?? null;

/** Email domains that identify a business, used to tag new contacts automatically. Anything else stays untagged. */
const DOMAIN_BUSINESS: Record<string, BusinessKey> = {
  'bluestarimex.com': 'bluestarimex',
  'globlexai.com': 'globlex-ai',
};
export function guessBusiness(email: string | null | undefined): BusinessKey | null {
  const domain = email?.split('@')[1]?.trim().toLowerCase();
  return (domain && DOMAIN_BUSINESS[domain]) || null;
}

export const SOURCES = ['website', 'referral', 'event', 'outreach', 'other'] as const;
export type Source = (typeof SOURCES)[number];

export const CONTACT_STATUSES = ['lead', 'qualified', 'customer', 'archived'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

/** What a person can record by hand. The system also records created, stage, won, lost and customer entries itself. */
export const MANUAL_KINDS = ['call', 'email', 'sms', 'meeting', 'note', 'task'] as const;
export type ManualKind = (typeof MANUAL_KINDS)[number];
export const SYSTEM_KINDS = ['created', 'stage', 'won', 'lost', 'customer'] as const;
export const ALL_KINDS = [...MANUAL_KINDS, ...SYSTEM_KINDS] as const;
export type ActivityKind = (typeof ALL_KINDS)[number];

export const KIND_INFO: Record<ActivityKind, { label: string; icon: string }> = {
  call: { label: 'Call', icon: '📞' },
  email: { label: 'Email', icon: '✉️' },
  sms: { label: 'Text message', icon: '💬' },
  meeting: { label: 'Meeting', icon: '🤝' },
  note: { label: 'Note', icon: '📝' },
  task: { label: 'Task', icon: '✅' },
  created: { label: 'Created', icon: '✨' },
  stage: { label: 'Stage change', icon: '➡️' },
  won: { label: 'Won', icon: '🏆' },
  lost: { label: 'Lost', icon: '📉' },
  customer: { label: 'Customer', icon: '🧾' },
};

export interface Contact {
  id: string;
  name: string;
  company: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  source: Source;
  status: ContactStatus;
  owner: string | null;
  business: string | null;
  customerId: string | null;
  notes: string | null;
  /** Follow up every this many days (7 = weekly); null for none. */
  followUpDays: number | null;
  /** Reorders every this many days (90 = quarterly); null for no schedule. */
  reorderDays: number | null;
  doNotContact: boolean;
  lastContactAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Deal {
  id: string;
  title: string;
  contactId: string | null;
  customerId: string | null;
  /** The invoice made when the deal was won, if any. */
  invoiceId: string | null;
  value: number;
  currency: string;
  stage: StageKey;
  expectedClose: string | null;
  owner: string | null;
  business: string | null;
  source: Source;
  lostReason: string | null;
  closedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  dealId: string | null;
  contactId: string | null;
  kind: ActivityKind;
  summary: string;
  detail: string | null;
  durationSeconds: number | null;
  dueAt: string | null;
  doneAt: string | null;
  actor: string;
  /** How it travelled (email, sms, call, whatsapp, web), when it was a message or call. */
  channel: Channel | null;
  /** 'in' for something received, 'out' for something we sent or did. */
  direction: 'in' | 'out' | null;
  /** For a received message: 0 to 100, how soon it needs a person. Null until it has been read. */
  priority: number | null;
  /** For a received message: what reading it found. */
  triage: ActivityTriage | null;
  createdAt: string;
  updatedAt: string;
}

/** What reading a received message found (see triage.ts). */
export interface ActivityTriage {
  intent: InboundIntent;
  urgency: number;
  sentiment: number;
  summary: string;
  business: string | null;
  confidence: number;
  source: 'ai' | 'rules';
}

export const CHANNELS = ['email', 'sms', 'call', 'whatsapp', 'web'] as const;
export type Channel = (typeof CHANNELS)[number];

export interface Draft {
  id: string;
  contactId: string;
  dealId: string | null;
  channel: Channel;
  subject: string | null;
  body: string;
  reason: string | null;
  status: 'pending' | 'sent' | 'dismissed' | 'failed';
  createdBy: string;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Report {
  id: string;
  kind: 'daily' | 'weekly';
  period: string;
  title: string;
  body: string;
  emailedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lead score, 0 to 100, from what is known about the contact and how much has happened with them. The same inputs
 * always give the same score, so a rep can see why a lead ranks where it does.
 */
export function leadScore(c: Pick<Contact, 'email' | 'phone' | 'company' | 'jobTitle' | 'source'>, activityCount: number, openDealValue: number): number {
  let s = 0;
  if (c.email) s += 15;
  if (c.phone) s += 10;
  if (c.company) s += 10;
  if (c.jobTitle) s += 5;
  s += { referral: 20, event: 12, website: 10, outreach: 6, other: 3 }[c.source] ?? 0;
  s += Math.min(25, activityCount * 5);
  if (openDealValue >= 10_000) s += 15;
  else if (openDealValue > 0) s += 8;
  return Math.max(0, Math.min(100, s));
}

export interface StageRow {
  key: StageKey;
  label: string;
  color: string;
  count: number;
  value: number;
}
export interface OwnerRow {
  owner: string;
  open: number;
  openValue: number;
  won: number;
  wonValue: number;
}
export interface CrmMetrics {
  openCount: number;
  openValue: number;
  /** Open deal value weighted by each stage's win probability. */
  forecast: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  /** Won out of all closed deals this period, or null when nothing has closed. */
  winRate: number | null;
  avgDealSize: number | null;
  stages: StageRow[];
  owners: OwnerRow[];
  /** Calls, emails, meetings and notes recorded in the last 7 days, by kind. */
  activityWeek: Record<'call' | 'email' | 'sms' | 'meeting' | 'note', number>;
  tasksOpen: number;
  tasksOverdue: number;
}

export function crmMetrics(deals: Deal[], activities: Activity[], now = Date.now(), periodStart = new Date(now - 90 * 86_400_000).toISOString()): CrmMetrics {
  const stages: StageRow[] = STAGES.map((s) => ({ key: s.key, label: s.label, color: s.color, count: 0, value: 0 }));
  const owners = new Map<string, OwnerRow>();
  const ownerRow = (name: string | null) => {
    const key = name?.trim() || 'Unassigned';
    let r = owners.get(key);
    if (!r) owners.set(key, (r = { owner: key, open: 0, openValue: 0, won: 0, wonValue: 0 }));
    return r;
  };
  let openCount = 0, openValue = 0, forecast = 0, wonCount = 0, wonValue = 0, lostCount = 0;
  for (const d of deals) {
    const row = stages.find((s) => s.key === d.stage)!;
    row.count += 1;
    row.value += d.value;
    const o = ownerRow(d.owner);
    if (OPEN_STAGES.includes(d.stage)) {
      openCount += 1;
      openValue += d.value;
      forecast += (d.value * stageInfo(d.stage).probability) / 100;
      o.open += 1;
      o.openValue += d.value;
    } else if (d.closedAt && d.closedAt >= periodStart) {
      if (d.stage === 'won') {
        wonCount += 1;
        wonValue += d.value;
        o.won += 1;
        o.wonValue += d.value;
      } else lostCount += 1;
    }
  }
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
  const activityWeek = { call: 0, email: 0, sms: 0, meeting: 0, note: 0 };
  let tasksOpen = 0, tasksOverdue = 0;
  for (const a of activities) {
    if (a.kind === 'task') {
      if (!a.doneAt) {
        tasksOpen += 1;
        if (a.dueAt && Date.parse(a.dueAt) < now) tasksOverdue += 1;
      }
    } else if (a.kind === 'meeting' && a.dueAt && !a.doneAt && Date.parse(a.dueAt) > now) {
      // A meeting booked for later is not something that happened this week.
    } else if ((a.kind === 'call' || a.kind === 'email' || a.kind === 'sms' || a.kind === 'meeting' || a.kind === 'note') && a.createdAt >= weekAgo) {
      activityWeek[a.kind] += 1;
    }
  }
  const closed = wonCount + lostCount;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    openCount,
    openValue: round2(openValue),
    forecast: round2(forecast),
    wonCount,
    wonValue: round2(wonValue),
    lostCount,
    winRate: closed ? Math.round((wonCount / closed) * 1000) / 10 : null,
    avgDealSize: wonCount ? round2(wonValue / wonCount) : null,
    stages: stages.map((s) => ({ ...s, value: round2(s.value) })),
    owners: [...owners.values()].sort((a, b) => b.wonValue - a.wonValue || b.openValue - a.openValue),
    activityWeek,
    tasksOpen,
    tasksOverdue,
  };
}

/** "3m 05s" for a call timer or a logged duration. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(r).padStart(2, '0')}s`;
}

/** 'just now', '5m ago', '3h ago', '2d ago', or 'Oct 12', from an ISO time. */
export function ago(isoTime: string, now = Date.now()): string {
  const t = Date.parse(isoTime);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Receiving messages and calls: who sent it, and what it is about
// ---------------------------------------------------------------------------

/** The part of a phone number that identifies it: the last ten digits, so +1 (201) 555-0100 and 201.555.0100 match. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length < 7) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** 'Dana Rivera <dana@rivera.test>' to { name, email }; a bare address gives no name. */
export function parseAddress(raw: string | null | undefined): { name: string | null; email: string | null } {
  const text = (raw ?? '').trim();
  const angled = /^(.*?)<([^>]+)>\s*$/.exec(text);
  const email = (angled ? angled[2] : text).trim().toLowerCase();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  const name = angled ? angled[1].replace(/^["'\s]+|["'\s]+$/g, '') : '';
  return { name: name || null, email: valid };
}

export type InboundIntent = 'unsubscribe' | 'meeting_request' | 'pricing' | 'complaint' | 'question' | 'other';

/** A plain-rules read of what a received message wants. An AI reading can replace this, but this always works. */
export function classifyInbound(subject: string | null | undefined, body: string | null | undefined): InboundIntent {
  const t = `${subject ?? ''} ${body ?? ''}`.toLowerCase();
  if (/\b(unsubscribe|stop emailing|stop texting|remove me|do not contact|don't contact|opt.?out)\b/.test(t) || /^\s*stop\s*$/.test((body ?? '').toLowerCase())) return 'unsubscribe';
  if (/\b(refund|complain|unacceptable|disappointed|not happy|angry|cancel(l)?ed? my|terrible)\b/.test(t)) return 'complaint';
  if (/\b(meet|meeting|call me|schedule|reschedule|book a|availability|available (on|at|next)|demo)\b/.test(t)) return 'meeting_request';
  if (/\b(price|pricing|quote|quotation|cost|how much|proposal|estimate)\b/.test(t)) return 'pricing';
  if (t.includes('?')) return 'question';
  return 'other';
}

export const INTENT_LABEL: Record<InboundIntent, string> = {
  unsubscribe: 'Asked to stop contact',
  meeting_request: 'Wants to meet',
  pricing: 'Asking about price',
  complaint: 'Unhappy',
  question: 'Has a question',
  other: 'Message',
};

/** When the next follow-up is due for a contact: the last contact plus their cadence, or null if they have none. */
export function nextFollowUp(c: Pick<Contact, 'followUpDays' | 'lastContactAt' | 'createdAt' | 'doNotContact'>): string | null {
  if (!c.followUpDays || c.doNotContact) return null;
  return new Date(Date.parse(c.lastContactAt ?? c.createdAt) + c.followUpDays * 86_400_000).toISOString();
}

export function followUpDue(c: Pick<Contact, 'followUpDays' | 'lastContactAt' | 'createdAt' | 'doNotContact'>, now = Date.now()): boolean {
  const next = nextFollowUp(c);
  return next !== null && Date.parse(next) <= now;
}

/** Groups upcoming meetings and tasks by when they fall, for the Upcoming tab. */
export function bucketUpcoming<T extends { dueAt: string | null }>(items: T[], now = Date.now(), tzOffsetMinutes = 0): { label: string; items: T[] }[] {
  const dayStart = (t: number) => Math.floor((t - tzOffsetMinutes * 60_000) / 86_400_000);
  const today = dayStart(now);
  const groups: Record<string, T[]> = { Overdue: [], Today: [], Tomorrow: [], 'This week': [], Later: [] };
  for (const it of items) {
    if (!it.dueAt) continue;
    const t = Date.parse(it.dueAt);
    const d = dayStart(t);
    if (t < now && d < today) groups.Overdue.push(it);
    else if (d <= today) groups.Today.push(it);
    else if (d === today + 1) groups.Tomorrow.push(it);
    else if (d <= today + 7) groups['This week'].push(it);
    else groups.Later.push(it);
  }
  return Object.entries(groups).filter(([, v]) => v.length).map(([label, v]) => ({ label, items: v.sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1)) }));
}

// ---------------------------------------------------------------------------
// Reports: what happened in a period, and the plain-text report built from it
// ---------------------------------------------------------------------------

export interface ReportData {
  from: string;
  to: string;
  newContacts: number;
  received: Record<'email' | 'sms' | 'call', number>;
  sent: Record<'email' | 'sms' | 'call', number>;
  meetingsHeld: number;
  dealsCreated: number;
  dealsMoved: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  openCount: number;
  openValue: number;
  forecast: number;
  overdueTasks: number;
  upcomingMeetings: { when: string; summary: string; who: string | null }[];
  staleDeals: { title: string; days: number; value: number }[];
  hotLeads: { name: string; company: string | null; score: number }[];
  draftsWaiting: number;
}

const money0 = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Turns the period's figures into a readable report. The same figures always give the same text. */
export function renderReport(kind: 'daily' | 'weekly', label: string, d: ReportData, summary?: string | null): string {
  const lines: string[] = [];
  lines.push(`${kind === 'daily' ? 'Daily' : 'Weekly'} CRM report: ${label}`);
  if (summary) lines.push('', summary);
  lines.push('', 'WHAT HAPPENED');
  lines.push(`- New contacts: ${d.newContacts}`);
  lines.push(`- Received: ${d.received.email} emails, ${d.received.sms} texts, ${d.received.call} calls`);
  lines.push(`- Sent or made: ${d.sent.email} emails, ${d.sent.sms} texts, ${d.sent.call} calls`);
  lines.push(`- Meetings held: ${d.meetingsHeld}`);
  lines.push(`- Deals created: ${d.dealsCreated}, moved between stages: ${d.dealsMoved}`);
  lines.push(`- Won: ${d.wonCount}${d.wonCount ? ` (${money0(d.wonValue)})` : ''}, lost: ${d.lostCount}`);
  lines.push('', 'PIPELINE NOW');
  lines.push(`- Open: ${d.openCount} deals worth ${money0(d.openValue)}; expected revenue ${money0(d.forecast)}`);
  lines.push('', 'NEEDS ATTENTION');
  lines.push(`- Overdue tasks: ${d.overdueTasks}`);
  lines.push(`- Messages waiting for your approval: ${d.draftsWaiting}`);
  if (d.staleDeals.length) {
    lines.push('- Quiet deals:');
    for (const s of d.staleDeals.slice(0, 5)) lines.push(`    ${s.title}: nothing for ${s.days} days (${money0(s.value)})`);
  }
  if (d.upcomingMeetings.length) {
    lines.push('', 'COMING UP');
    for (const m of d.upcomingMeetings.slice(0, 8)) lines.push(`- ${m.when}: ${m.summary}${m.who ? ` with ${m.who}` : ''}`);
  }
  if (d.hotLeads.length) {
    lines.push('', 'HOTTEST LEADS');
    for (const h of d.hotLeads.slice(0, 3)) lines.push(`- ${h.name}${h.company ? ` (${h.company})` : ''}: score ${h.score}`);
  }
  return lines.join('\n');
}

/** The figures for a period, worked out from the lists the CRM already holds. */
export function summarizePeriod(
  deals: Deal[], contacts: Contact[], activities: Activity[], draftsWaiting: number, from: Date, to: Date, now = to.getTime(),
): ReportData {
  const f = from.toISOString();
  const t = to.toISOString();
  const inRange = (iso: string) => iso >= f && iso < t;
  const count = (kind: ActivityKind, dir: 'in' | 'out') =>
    activities.filter((a) => a.kind === kind && inRange(a.createdAt) && (a.direction ?? 'out') === dir).length;
  const m = crmMetrics(deals, activities, now, f);
  const won = deals.filter((d) => d.stage === 'won' && d.closedAt && inRange(d.closedAt));
  const lost = deals.filter((d) => d.stage === 'lost' && d.closedAt && inRange(d.closedAt));
  const meetingsHeld = activities.filter((a) => a.kind === 'meeting' && ((a.dueAt && inRange(a.dueAt) && a.dueAt <= new Date(now).toISOString()) || (!a.dueAt && inRange(a.createdAt)))).length;
  const nameOf = (id: string | null) => contacts.find((c) => c.id === id)?.name ?? null;
  const horizon = new Date(now + 7 * 86_400_000).toISOString();
  const nowIso = new Date(now).toISOString();
  const openDealValueByContact = new Map<string, number>();
  for (const d of deals) if (d.contactId && OPEN_STAGES.includes(d.stage)) openDealValueByContact.set(d.contactId, (openDealValueByContact.get(d.contactId) ?? 0) + d.value);
  const actCount = new Map<string, number>();
  for (const a of activities) if (a.contactId && a.kind !== 'created') actCount.set(a.contactId, (actCount.get(a.contactId) ?? 0) + 1);
  return {
    from: f,
    to: t,
    newContacts: contacts.filter((c) => inRange(c.createdAt)).length,
    received: { email: count('email', 'in'), sms: count('sms', 'in'), call: count('call', 'in') },
    sent: { email: count('email', 'out'), sms: count('sms', 'out'), call: count('call', 'out') },
    meetingsHeld,
    dealsCreated: deals.filter((d) => inRange(d.createdAt)).length,
    dealsMoved: activities.filter((a) => a.kind === 'stage' && inRange(a.createdAt)).length,
    wonCount: won.length,
    wonValue: won.reduce((s, d) => s + d.value, 0),
    lostCount: lost.length,
    openCount: m.openCount,
    openValue: m.openValue,
    forecast: m.forecast,
    overdueTasks: m.tasksOverdue,
    upcomingMeetings: activities
      .filter((a) => a.kind === 'meeting' && a.dueAt && !a.doneAt && a.dueAt > nowIso && a.dueAt <= horizon)
      .sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1))
      .map((a) => ({ when: new Date(a.dueAt!).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) + ' UTC', summary: a.summary, who: nameOf(a.contactId) })),
    staleDeals: deals
      .filter((d) => OPEN_STAGES.includes(d.stage))
      .map((d) => ({ title: d.title, days: Math.floor((now - Date.parse(d.updatedAt)) / 86_400_000), value: d.value }))
      .filter((d) => d.days >= STALE_DEAL_DAYS)
      .sort((a, b) => b.value - a.value),
    hotLeads: contacts
      .filter((c) => c.status === 'lead' || c.status === 'qualified')
      .map((c) => ({ name: c.name, company: c.company, score: leadScore(c, actCount.get(c.id) ?? 0, openDealValueByContact.get(c.id) ?? 0) }))
      .filter((c) => c.score >= 60)
      .sort((a, b) => b.score - a.score),
    draftsWaiting,
  };
}

/** A deal with nothing recorded for this many days counts as quiet. */
export const STALE_DEAL_DAYS = 14;

/** One won deal's invoice and how much of it has been paid. */
export interface Collection {
  dealId: string;
  invoiceId: string;
  docNumber: string | null;
  currency: string;
  total: number;
  paid: number;
  balance: number;
  dueDate: string | null;
  overdue: boolean;
}

/** A month's sales target for the whole team (owner is empty) or one person. */
export interface Target { period: string; owner: string; amount: number }

/** The month (YYYY-MM, UTC) a timestamp falls in. */
export const monthOf = (isoTime: string | number | Date): string => new Date(isoTime).toISOString().slice(0, 7);

/** How far through a month we are, 0 to 1: before it starts 0, after it ends 1. */
export function monthProgress(period: string, now = Date.now()): number {
  const [y, m] = period.split('-').map(Number);
  const start = Date.UTC(y, m - 1, 1);
  const end = Date.UTC(y, m, 1);
  return Math.max(0, Math.min(1, (now - start) / (end - start)));
}

/** One business's billed, paid and overdue invoice amounts in one currency. */
export interface BusinessFinance { business: string | null; currency: string; billed: number; paid: number; overdue: number }

// ---------------------------------------------------------------------------
// The "do this next" list
// ---------------------------------------------------------------------------

export type ActionLevel = 'now' | 'today' | 'soon';
export const actionLevel = (score: number): ActionLevel => (score >= 70 ? 'now' : score >= 40 ? 'today' : 'soon');

export interface NextAction {
  /** The activity or draft this comes from. */
  id: string;
  type: 'message' | 'task' | 'draft';
  score: number;
  level: ActionLevel;
  title: string;
  /** The plain-words reason (the AI's one-line summary of the message when there is one). */
  why: string;
  /** Small facts shown under it, such as "Wants to meet · waiting 2d". */
  meta: string;
  contactId: string | null;
  dealId: string | null;
  business: string | null;
  overdue: boolean;
  /** For a message, what it is; null otherwise. */
  intent: InboundIntent | null;
  /** The message or task (to mark it done) or the draft. */
  activity: Activity | null;
}

const DAY_MS = 86_400_000;

/**
 * Everything waiting on a person, ranked: customer messages nobody has answered, open tasks, and follow-up drafts
 * waiting to be approved. A message's score is the priority it was given when it was read, growing as it waits; a task's
 * grows when it is overdue or due today and for a bigger deal. A task made from a message takes that message's priority
 * and summary, and the message is not listed a second time. The same inputs always give the same list.
 */
export function nextActions(i: { activities: Activity[]; contacts: Contact[]; deals: Deal[]; drafts: Draft[]; now?: number; limit?: number }): NextAction[] {
  const now = i.now ?? Date.now();
  const contactById = new Map(i.contacts.map((c) => [c.id, c]));
  const dealById = new Map(i.deals.map((d) => [d.id, d]));

  const lastOut = new Map<string, string>();
  for (const a of i.activities) {
    if (a.contactId && a.direction === 'out' && a.channel && (!lastOut.get(a.contactId) || a.createdAt > lastOut.get(a.contactId)!)) lastOut.set(a.contactId, a.createdAt);
  }
  const unanswered = new Map<string, Activity>();
  for (const a of i.activities) {
    if (a.direction !== 'in' || !a.contactId || a.doneAt || !['email', 'sms', 'note'].includes(a.kind)) continue;
    if (now - Date.parse(a.createdAt) > 30 * DAY_MS) continue;
    const out = lastOut.get(a.contactId);
    if (out && out > a.createdAt) continue;
    const cur = unanswered.get(a.contactId);
    if (!cur || a.createdAt > cur.createdAt) unanswered.set(a.contactId, a);
  }

  const out: NextAction[] = [];
  const absorbed = new Set<string>();
  const valueTier = (d: Deal | undefined) => (!d || !OPEN_STAGES.includes(d.stage) ? 0 : d.value >= 10_000 ? 15 : d.value >= 1_000 ? 10 : d.value > 0 ? 5 : 0);

  for (const a of i.activities) {
    if (a.kind !== 'task' || a.doneAt) continue;
    const contact = a.contactId ? contactById.get(a.contactId) : undefined;
    const deal = a.dealId ? dealById.get(a.dealId) : undefined;
    let score = 30 + valueTier(deal);
    let overdue = false;
    if (a.dueAt) {
      const hours = (now - Date.parse(a.dueAt)) / 3_600_000;
      if (hours > 0) { overdue = true; score += 30 + Math.min(15, Math.floor(hours / 24)); }
      else if (hours > -24) score += 10;
    }
    const msg = a.contactId ? unanswered.get(a.contactId) : undefined;
    if (msg) { absorbed.add(msg.id); score = Math.max(score, msg.priority ?? 0); }
    score = Math.min(100, score);
    const due = a.dueAt ? `${overdue ? 'was due' : 'due'} ${new Date(a.dueAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })} UTC` : 'no due time';
    out.push({
      id: a.id, type: 'task', score, level: actionLevel(score), title: a.summary,
      why: msg?.triage?.summary || a.detail || (contact ? `For ${contact.name}` : ''),
      meta: [contact?.name, due].filter(Boolean).join(' · '),
      contactId: a.contactId, dealId: a.dealId, business: deal?.business ?? contact?.business ?? null, overdue, intent: msg?.triage?.intent ?? null, activity: a,
    });
  }

  for (const m of unanswered.values()) {
    if (absorbed.has(m.id)) continue;
    const contact = m.contactId ? contactById.get(m.contactId) : undefined;
    const waitingDays = Math.floor((now - Date.parse(m.createdAt)) / DAY_MS);
    const score = Math.min(100, (m.priority ?? 20) + Math.min(10, waitingDays));
    const intent = m.triage?.intent ?? null;
    out.push({
      id: m.id, type: 'message', score, level: actionLevel(score), title: `Reply to ${contact?.name ?? 'a contact'}`,
      why: m.triage?.summary || m.summary,
      meta: [intent ? INTENT_LABEL[intent] : 'Message', `waiting ${ago(m.createdAt, now).replace(' ago', '')}`].join(' · '),
      contactId: m.contactId, dealId: m.dealId, business: contact?.business ?? null, overdue: false, intent, activity: m,
    });
  }

  for (const d of i.drafts) {
    if (d.status !== 'pending' && d.status !== 'failed') continue;
    const contact = contactById.get(d.contactId);
    const score = d.status === 'failed' ? 45 : 25;
    out.push({
      id: d.id, type: 'draft', score, level: actionLevel(score), title: d.status === 'failed' ? `Resend the follow-up to ${contact?.name ?? 'a contact'}` : `Approve the follow-up to ${contact?.name ?? 'a contact'}`,
      why: d.status === 'failed' ? (d.error ?? 'It could not be sent.') : (d.reason ?? d.subject ?? ''),
      meta: `Draft ${d.channel} · written ${ago(d.createdAt, now)}`,
      contactId: d.contactId, dealId: d.dealId, business: contact?.business ?? null, overdue: false, intent: null, activity: null,
    });
  }

  return out.sort((a, b) => b.score - a.score || (a.activity?.createdAt ?? '') .localeCompare(b.activity?.createdAt ?? '')).slice(0, i.limit ?? 50);
}

// ---------------------------------------------------------------------------
// Quotes, reorders and the pipeline's value over time
// ---------------------------------------------------------------------------

/** How long a sent quote may go quiet before it is time to follow up, and the same for other open deals. */
export const QUOTE_FOLLOW_UP_DAYS = 3;
export const DEAL_QUIET_DAYS = 7;

/** An open deal that has gone quiet for long enough that someone should get back in touch. */
export function needsFollowUp(d: Pick<Deal, 'stage' | 'updatedAt'>, now = Date.now()): boolean {
  if (!OPEN_STAGES.includes(d.stage) || d.stage === 'lead') return false;
  const quiet = (now - Date.parse(d.updatedAt)) / DAY_MS;
  return quiet >= (d.stage === 'proposal' ? QUOTE_FOLLOW_UP_DAYS : DEAL_QUIET_DAYS);
}

export interface ReorderItem {
  contactId: string;
  name: string;
  company: string | null;
  business: string | null;
  owner: string | null;
  /** The cycle: reorders every this many days. */
  everyDays: number;
  lastOrderAt: string;
  lastValue: number;
  currency: string;
  dueAt: string;
  /** Days since the last order. */
  daysSince: number;
  /** Days until it is due; negative once overdue. */
  daysUntil: number;
  /** due: today or overdue. soon: within 14 days. later: further off. */
  status: 'due' | 'soon' | 'later';
  /** A deal opened since the last order is already being worked, so it is not nagged about again. */
  inPipeline: boolean;
}

/**
 * Each customer on a reorder schedule, and when they are next due: the date of their last won deal plus their cycle.
 * Customers with no won deal yet, no schedule, or that were archived are left out. Soonest first.
 */
export function reorderSchedule(contacts: Contact[], deals: Deal[], now = Date.now()): ReorderItem[] {
  const out: ReorderItem[] = [];
  for (const c of contacts) {
    if (!c.reorderDays || c.status === 'archived') continue;
    const mine = deals.filter((d) => d.contactId === c.id);
    const won = mine.filter((d) => d.stage === 'won').sort((a, b) => ((b.closedAt ?? b.updatedAt) < (a.closedAt ?? a.updatedAt) ? -1 : 1));
    const last = won[0];
    if (!last) continue;
    const lastOrderAt = last.closedAt ?? last.updatedAt;
    const dueMs = Date.parse(lastOrderAt) + c.reorderDays * DAY_MS;
    const daysUntil = Math.ceil((dueMs - now) / DAY_MS);
    out.push({
      contactId: c.id, name: c.name, company: c.company, business: last.business ?? c.business, owner: c.owner ?? last.owner, everyDays: c.reorderDays,
      lastOrderAt, lastValue: last.value, currency: last.currency, dueAt: new Date(dueMs).toISOString(),
      daysSince: Math.max(0, Math.floor((now - Date.parse(lastOrderAt)) / DAY_MS)), daysUntil,
      status: dueMs <= now ? 'due' : dueMs <= now + 14 * DAY_MS ? 'soon' : 'later',
      inPipeline: mine.some((d) => OPEN_STAGES.includes(d.stage) && Date.parse(d.createdAt) > Date.parse(lastOrderAt)),
    });
  }
  return out.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/** Reorders due now or within two weeks that nobody has started: what the Reorders tab and the pipeline column show. */
export const reordersToAct = (items: ReorderItem[]): ReorderItem[] => items.filter((r) => r.status !== 'later' && !r.inPipeline);

/**
 * The value of open deals at the end of each of the last `months` months (and now, for the current one). A deal counts
 * from the day it was created until the day it was won or lost, at the value it has now.
 */
export function openValueSeries(deals: Deal[], now = Date.now(), months = 6): { label: string; value: number }[] {
  const nowDate = new Date(now);
  const out: { label: string; value: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const end = i === 0 ? now : Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - i + 1, 1) - 1;
    let value = 0;
    for (const d of deals) {
      if (Date.parse(d.createdAt) > end) continue;
      const closed = OPEN_STAGES.includes(d.stage) ? null : Date.parse(d.closedAt ?? d.updatedAt);
      if (closed === null || closed > end) value += d.value;
    }
    out.push({ label: new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - i, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }), value });
  }
  return out;
}
