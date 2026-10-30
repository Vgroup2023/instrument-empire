// CRM vocabulary and the calculations behind the CRM dashboard. Pure code (no database, no React), so the server, the
// browser and the tests all use the same numbers.

export const STAGES = [
  { key: 'lead', label: 'New lead', probability: 10, color: '#64748b' },
  { key: 'qualified', label: 'Qualified', probability: 25, color: '#3f5fe0' },
  { key: 'proposal', label: 'Proposal', probability: 50, color: '#7c3aed' },
  { key: 'negotiation', label: 'Negotiation', probability: 75, color: '#f59e0b' },
  { key: 'won', label: 'Won', probability: 100, color: '#16a34a' },
  { key: 'lost', label: 'Lost', probability: 0, color: '#dc2626' },
] as const;
export type StageKey = (typeof STAGES)[number]['key'];
export const STAGE_KEYS = STAGES.map((s) => s.key) as unknown as readonly StageKey[];
export const OPEN_STAGES: readonly StageKey[] = ['lead', 'qualified', 'proposal', 'negotiation'];
export const stageInfo = (key: string) => STAGES.find((s) => s.key === key) ?? STAGES[0];

export const SOURCES = ['website', 'referral', 'event', 'outreach', 'other'] as const;
export type Source = (typeof SOURCES)[number];

export const CONTACT_STATUSES = ['lead', 'qualified', 'customer', 'archived'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

/** What a person can record by hand. The system also records created, stage, won, lost and customer entries itself. */
export const MANUAL_KINDS = ['call', 'email', 'meeting', 'note', 'task'] as const;
export type ManualKind = (typeof MANUAL_KINDS)[number];
export const SYSTEM_KINDS = ['created', 'stage', 'won', 'lost', 'customer'] as const;
export const ALL_KINDS = [...MANUAL_KINDS, ...SYSTEM_KINDS] as const;
export type ActivityKind = (typeof ALL_KINDS)[number];

export const KIND_INFO: Record<ActivityKind, { label: string; icon: string }> = {
  call: { label: 'Call', icon: '📞' },
  email: { label: 'Email', icon: '✉️' },
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
  customerId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Deal {
  id: string;
  title: string;
  contactId: string | null;
  customerId: string | null;
  value: number;
  currency: string;
  stage: StageKey;
  expectedClose: string | null;
  owner: string | null;
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
  activityWeek: Record<'call' | 'email' | 'meeting' | 'note', number>;
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
  const activityWeek = { call: 0, email: 0, meeting: 0, note: 0 };
  let tasksOpen = 0, tasksOverdue = 0;
  for (const a of activities) {
    if (a.kind === 'task') {
      if (!a.doneAt) {
        tasksOpen += 1;
        if (a.dueAt && Date.parse(a.dueAt) < now) tasksOverdue += 1;
      }
    } else if ((a.kind === 'call' || a.kind === 'email' || a.kind === 'meeting' || a.kind === 'note') && a.createdAt >= weekAgo) {
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
