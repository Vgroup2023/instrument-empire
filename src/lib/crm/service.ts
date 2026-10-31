import { createDraftInvoiceTx } from '@/lib/accounting/invoices';
import { createSystemTask } from '@/lib/team/tasks';
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { normalizePhone, parseAddress, classifyInbound, type Channel, type Draft, type Report } from './model';
import { sendEmail, sendSms } from './comms';
import { getDb } from '@/db/client';
import { crmActivities, crmContacts, crmDeals, crmDrafts, crmReports, crmTargets, customers, invoiceLines, invoicePayments, invoices } from '@/db/schema';
import { ConflictError, NotFoundError, ValidationError, asRecord, money, oneOf, optEmail, optIsoDate, optText, optUuid, text, uuid } from '@/lib/validation';
import {
  BUSINESS_KEYS, CHANNELS, CONTACT_STATUSES, guessBusiness, MANUAL_KINDS, OPEN_STAGES, SOURCES, STAGE_KEYS, stageInfo,
  type Activity, type ActivityKind, type BusinessFinance, type Collection, type Contact, type Deal, type StageKey, type Target,
} from './model';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toContact(r: typeof crmContacts.$inferSelect): Contact {
  return {
    id: r.id, name: r.name, company: r.company, jobTitle: r.jobTitle, email: r.email, phone: r.phone,
    source: r.source as Contact['source'], status: r.status as Contact['status'], owner: r.owner, business: r.business, customerId: r.customerId,
    notes: r.notes, followUpDays: r.followUpDays, doNotContact: r.doNotContact, lastContactAt: iso(r.lastContactAt),
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}
export function toDeal(r: typeof crmDeals.$inferSelect): Deal {
  return {
    id: r.id, title: r.title, contactId: r.contactId, customerId: r.customerId, invoiceId: r.invoiceId, value: Number(r.value), currency: r.currency,
    stage: r.stage as StageKey, expectedClose: r.expectedClose, owner: r.owner, business: r.business, source: r.source as Deal['source'],
    lostReason: r.lostReason, closedAt: iso(r.closedAt), notes: r.notes, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}
export function toActivity(r: typeof crmActivities.$inferSelect): Activity {
  return {
    id: r.id, dealId: r.dealId, contactId: r.contactId, kind: r.kind as ActivityKind, summary: r.summary, detail: r.detail,
    durationSeconds: r.durationSeconds, dueAt: iso(r.dueAt), doneAt: iso(r.doneAt), actor: r.actor,
    channel: (r.channel as Activity['channel']) ?? null, direction: (r.direction as Activity['direction']) ?? null,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}
export function toDraft(r: typeof crmDrafts.$inferSelect): Draft {
  return {
    id: r.id, contactId: r.contactId, dealId: r.dealId, channel: r.channel as Channel, subject: r.subject, body: r.body, reason: r.reason,
    status: r.status as Draft['status'], createdBy: r.createdBy, sentAt: iso(r.sentAt), error: r.error,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}
export function toReport(r: typeof crmReports.$inferSelect): Report {
  return { id: r.id, kind: r.kind as Report['kind'], period: r.period, title: r.title, body: r.body, emailedAt: iso(r.emailedAt), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() };
}

function actorName(v: unknown): string {
  return optText(v, 'Your name', 60) ?? 'Office team';
}

export interface RecordInput {
  dealId?: string | null;
  contactId?: string | null;
  kind: ActivityKind;
  summary: string;
  detail?: string | null;
  actor: string;
  durationSeconds?: number | null;
  dueAt?: Date | null;
  channel?: Channel | null;
  direction?: 'in' | 'out' | null;
  externalId?: string | null;
  at?: Date;
}

/** Kinds that count as being in touch with the person (so they reset the follow-up clock). */
const TOUCH_KINDS: readonly ActivityKind[] = ['call', 'email', 'sms', 'meeting', 'note'];

export async function record(tx: Tx | Db, e: RecordInput) {
  const at = e.at ?? new Date();
  const [row] = await tx
    .insert(crmActivities)
    .values({
      dealId: e.dealId ?? null, contactId: e.contactId ?? null, kind: e.kind, summary: e.summary, detail: e.detail ?? null,
      actor: e.actor, durationSeconds: e.durationSeconds ?? null, dueAt: e.dueAt ?? null,
      channel: e.channel ?? null, direction: e.direction ?? null, externalId: e.externalId ?? null,
      createdAt: at, updatedAt: at,
    })
    .returning();
  // A meeting booked for later has not happened yet, so it does not count as contact.
  const scheduledLater = e.kind === 'meeting' && e.dueAt && e.dueAt.getTime() > Date.now();
  if (e.contactId && TOUCH_KINDS.includes(e.kind) && !scheduledLater) {
    await tx
      .update(crmContacts)
      .set({ lastContactAt: sql`greatest(coalesce(${crmContacts.lastContactAt}, ${at.toISOString()}::timestamptz), ${at.toISOString()}::timestamptz)` })
      .where(eq(crmContacts.id, e.contactId));
  }
  return toActivity(row);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface Snapshot {
  deals: Deal[];
  contacts: Contact[];
  activities: Activity[];
  /** Messages written by the agents that are waiting for a person (pending) or recently handled. */
  drafts: Draft[];
  reports: Report[];
  /** The database's own clock, handed back as the starting point for the next "what changed" call. */
  now: string;
}

const DEAL_CAP = 1000;
const CONTACT_CAP = 1000;
const ACTIVITY_CAP = 300;

export async function snapshot(): Promise<Snapshot> {
  const db = getDb();
  const [deals, contacts, recent, openTasks, drafts, reports, [clock]] = await Promise.all([
    db.select().from(crmDeals).orderBy(desc(crmDeals.updatedAt)).limit(DEAL_CAP),
    db.select().from(crmContacts).orderBy(desc(crmContacts.updatedAt)).limit(CONTACT_CAP),
    db.select().from(crmActivities).orderBy(desc(crmActivities.createdAt)).limit(ACTIVITY_CAP),
    db.select().from(crmActivities).where(and(inArray(crmActivities.kind, ['task', 'meeting']), isNull(crmActivities.doneAt))).limit(ACTIVITY_CAP),
    db.select().from(crmDrafts).orderBy(desc(crmDrafts.createdAt)).limit(100),
    db.select().from(crmReports).orderBy(desc(crmReports.period), desc(crmReports.createdAt)).limit(40),
    db.execute<{ now: string }>(sql`select to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as now`),
  ]);
  const byId = new Map<string, Activity>();
  for (const a of [...recent, ...openTasks]) byId.set(a.id, toActivity(a));
  const activities = [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { deals: deals.map(toDeal), contacts: contacts.map(toContact), activities, drafts: drafts.map(toDraft), reports: reports.map(toReport), now: clock.now };
}

/** Everything added or changed after `since` (an ISO time), for the live feed. */
export async function changesSince(since: string): Promise<Snapshot> {
  const t = new Date(since);
  if (Number.isNaN(t.getTime())) throw new ValidationError('"since" must be a time.');
  const db = getDb();
  const [deals, contacts, acts, drafts, reports, [clock]] = await Promise.all([
    db.select().from(crmDeals).where(gt(crmDeals.updatedAt, t)).limit(DEAL_CAP),
    db.select().from(crmContacts).where(gt(crmContacts.updatedAt, t)).limit(CONTACT_CAP),
    db.select().from(crmActivities).where(gt(crmActivities.updatedAt, t)).orderBy(desc(crmActivities.createdAt)).limit(ACTIVITY_CAP),
    db.select().from(crmDrafts).where(gt(crmDrafts.updatedAt, t)).limit(100),
    db.select().from(crmReports).where(gt(crmReports.updatedAt, t)).limit(40),
    db.execute<{ now: string }>(sql`select to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as now`),
  ]);
  return { deals: deals.map(toDeal), contacts: contacts.map(toContact), activities: acts.map(toActivity), drafts: drafts.map(toDraft), reports: reports.map(toReport), now: clock.now };
}

export async function activitiesFor(opts: { dealId?: string; contactId?: string }): Promise<Activity[]> {
  const db = getDb();
  const where = opts.dealId ? eq(crmActivities.dealId, uuid(opts.dealId, 'Deal')) : opts.contactId ? eq(crmActivities.contactId, uuid(opts.contactId, 'Contact')) : undefined;
  const rows = await db.select().from(crmActivities).where(where).orderBy(desc(crmActivities.createdAt)).limit(500);
  return rows.map(toActivity);
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

/** A business key, or null for none. Untagged ('' or missing) is allowed. */
function optBusiness(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  return oneOf(v, 'Business', BUSINESS_KEYS);
}

function contactFields(raw: Record<string, unknown>, partial: boolean) {
  const out: Partial<typeof crmContacts.$inferInsert> = {};
  const has = (k: string) => raw[k] !== undefined;
  if (!partial || has('name')) out.name = text(raw.name, 'Name', { max: 120 });
  if (!partial || has('company')) out.company = optText(raw.company, 'Company', 120) ?? null;
  if (!partial || has('jobTitle')) out.jobTitle = optText(raw.jobTitle, 'Job title', 120) ?? null;
  if (!partial || has('email')) out.email = optEmail(raw.email, 'Email') ?? null;
  if (!partial || has('phone')) out.phone = optText(raw.phone, 'Phone', 40) ?? null;
  if (!partial || has('source')) out.source = raw.source === undefined || raw.source === '' ? 'other' : oneOf(raw.source, 'Source', SOURCES);
  if (!partial || has('status')) out.status = raw.status === undefined || raw.status === '' ? 'lead' : oneOf(raw.status, 'Status', CONTACT_STATUSES);
  if (!partial || has('owner')) out.owner = optText(raw.owner, 'Owner', 60) ?? null;
  if (has('business')) out.business = optBusiness(raw.business);
  else if (!partial) out.business = guessBusiness(out.email);
  if (!partial || has('notes')) out.notes = optText(raw.notes, 'Notes', 2000) ?? null;
  if (has('followUpDays')) {
    const v = raw.followUpDays;
    if (v === null || v === '' || v === 0) out.followUpDays = null;
    else if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 365) out.followUpDays = v;
    else throw new ValidationError('Follow up every must be a whole number of days between 1 and 365.');
  }
  if (has('doNotContact')) out.doNotContact = raw.doNotContact === true;
  return out;
}

export async function createContact(input: unknown): Promise<Contact> {
  const raw = asRecord(input, 'The contact');
  const actor = actorName(raw.actor);
  const fields = contactFields(raw, false) as typeof crmContacts.$inferInsert;
  return getDb().transaction(async (tx) => {
    const [row] = await tx.insert(crmContacts).values(fields).returning();
    await record(tx, { contactId: row.id, kind: 'created', summary: `Added ${row.name}${row.company ? ` (${row.company})` : ''}`, actor });
    return toContact(row);
  });
}

export async function updateContact(id: string, input: unknown): Promise<Contact> {
  uuid(id, 'Contact');
  const raw = asRecord(input, 'The contact');
  const fields = contactFields(raw, true);
  const [row] = await getDb().update(crmContacts).set({ ...fields, updatedAt: new Date() }).where(eq(crmContacts.id, id)).returning();
  if (!row) throw new NotFoundError('Contact not found.');
  return toContact(row);
}

export async function deleteContact(id: string): Promise<void> {
  uuid(id, 'Contact');
  const [row] = await getDb().delete(crmContacts).where(eq(crmContacts.id, id)).returning({ id: crmContacts.id });
  if (!row) throw new NotFoundError('Contact not found.');
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

async function requireContact(tx: Tx | Db, id: string | undefined) {
  if (!id) return null;
  const [c] = await tx.select().from(crmContacts).where(eq(crmContacts.id, id));
  if (!c) throw new ValidationError('That contact no longer exists. Choose one from the list.');
  return c;
}

function dealFields(raw: Record<string, unknown>, partial: boolean) {
  const out: Partial<typeof crmDeals.$inferInsert> = {};
  const has = (k: string) => raw[k] !== undefined;
  if (!partial || has('title')) out.title = text(raw.title, 'Deal name', { max: 160 });
  if (!partial || has('value')) out.value = (raw.value === undefined || raw.value === null || raw.value === '' ? 0 : money(raw.value, 'Deal value', { allowZero: true })).toFixed(2);
  if (!partial || has('currency')) out.currency = optText(raw.currency, 'Currency', 3)?.toUpperCase() ?? 'USD';
  if (!partial || has('expectedClose')) out.expectedClose = optIsoDate(raw.expectedClose, 'Expected close date') ?? null;
  if (!partial || has('owner')) out.owner = optText(raw.owner, 'Owner', 60) ?? null;
  if (has('business')) out.business = optBusiness(raw.business);
  if (!partial || has('source')) out.source = raw.source === undefined || raw.source === '' ? 'other' : oneOf(raw.source, 'Source', SOURCES);
  if (!partial || has('notes')) out.notes = optText(raw.notes, 'Notes', 2000) ?? null;
  return out;
}

export async function createDeal(input: unknown): Promise<Deal> {
  const raw = asRecord(input, 'The deal');
  const actor = actorName(raw.actor);
  const stage = raw.stage === undefined || raw.stage === '' ? 'lead' : oneOf(raw.stage, 'Stage', STAGE_KEYS);
  if (stage === 'won' || stage === 'lost') throw new ValidationError('Start a deal in an open stage, then move it to Won or Lost.');
  const contactId = optUuid(raw.contactId, 'Contact');
  const fields = dealFields(raw, false) as typeof crmDeals.$inferInsert;
  return getDb().transaction(async (tx) => {
    const contact = await requireContact(tx, contactId);
    const [row] = await tx.insert(crmDeals).values({ ...fields, stage, contactId: contactId ?? null, source: fields.source ?? contact?.source ?? 'other', business: fields.business ?? contact?.business ?? null }).returning();
    await record(tx, { dealId: row.id, contactId: contactId ?? null, kind: 'created', summary: `Deal created in ${stageInfo(stage).label}`, actor });
    return toDeal(row);
  });
}

/** Makes sure a won deal has a customer on the books, creating one from the contact (or the deal) when it has none. */
async function ensureCustomer(tx: Tx, deal: typeof crmDeals.$inferSelect, actor: string): Promise<string> {
  if (deal.customerId) return deal.customerId;
  const contact = deal.contactId ? await requireContact(tx, deal.contactId) : null;
  if (contact?.customerId) {
    await tx.update(crmDeals).set({ customerId: contact.customerId }).where(eq(crmDeals.id, deal.id));
    return contact.customerId;
  }
  const displayName = (contact?.company || contact?.name || deal.title).slice(0, 120);
  const [customer] = await tx
    .insert(customers)
    .values({ displayName, companyName: contact?.company ?? null, email: contact?.email ?? null, phone: contact?.phone ?? null, currencyCode: deal.currency })
    .returning();
  await tx.update(crmDeals).set({ customerId: customer.id }).where(eq(crmDeals.id, deal.id));
  if (contact) await tx.update(crmContacts).set({ customerId: customer.id, status: 'customer', updatedAt: new Date() }).where(eq(crmContacts.id, contact.id));
  await record(tx, { dealId: deal.id, contactId: contact?.id ?? null, kind: 'customer', summary: `Customer record created: ${displayName}`, actor });
  return customer.id;
}


/**
 * A won deal becomes work for Finance: a draft invoice for the deal value (once, however often the deal is moved
 * around) and a task in Finance's inbox to review and send it. A deal with no value still tells Finance to set up billing.
 */
async function handOffWonDeal(tx: Tx, deal: typeof crmDeals.$inferSelect, customerId: string, actor: string): Promise<void> {
  const amount = Number(deal.value);
  let invoiceId = deal.invoiceId;
  let docNumber: string | null = null;
  if (!invoiceId && amount > 0) {
    const inv = await createDraftInvoiceTx(tx, {
      customerId, description: deal.title.slice(0, 480), amount, currency: deal.currency, notes: `From the won deal "${deal.title}" (recorded by ${actor}).`,
    });
    invoiceId = inv.id;
    docNumber = inv.docNumber;
    await tx.update(crmDeals).set({ invoiceId }).where(eq(crmDeals.id, deal.id));
    await record(tx, { dealId: deal.id, contactId: deal.contactId, kind: 'note', summary: `Draft invoice ${docNumber ?? ''} created for Finance to review`.replace('  ', ' '), actor });
  }
  const money = `${deal.currency} ${amount.toLocaleString('en-US')}`;
  await createSystemTask(tx, {
    source: `crm-won:${deal.id}`,
    fromName: actor,
    toDepartment: 'finance',
    title: invoiceId ? `Review and send the invoice for the won deal "${deal.title}"` : `Set up billing for the won deal "${deal.title}"`,
    detail: invoiceId ? `${actor} won this deal (${money}). A draft invoice${docNumber ? ` (${docNumber})` : ''} is ready in Invoices: check the lines, terms and due date, then send it.` : `${actor} won this deal. It has no value yet, so no invoice was drafted. Agree the amount with Sales, then create the invoice.`,
    href: '/dashboard/invoices',
  });
}

export async function updateDeal(id: string, input: unknown): Promise<Deal> {
  uuid(id, 'Deal');
  const raw = asRecord(input, 'The deal');
  const actor = actorName(raw.actor);
  const fields = dealFields(raw, true);
  const newStage = raw.stage === undefined ? undefined : oneOf(raw.stage, 'Stage', STAGE_KEYS);
  const contactId = raw.contactId === undefined ? undefined : (optUuid(raw.contactId, 'Contact') ?? null);
  const lostReason = raw.lostReason === undefined ? undefined : (optText(raw.lostReason, 'Reason lost', 300) ?? null);

  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(crmDeals).where(eq(crmDeals.id, id)).for('update');
    if (!before) throw new NotFoundError('Deal not found.');
    if (contactId) await requireContact(tx, contactId);
    const patch: Partial<typeof crmDeals.$inferInsert> = { ...fields, updatedAt: new Date() };
    if (contactId !== undefined) patch.contactId = contactId;
    if (lostReason !== undefined) patch.lostReason = lostReason;

    const moved = newStage !== undefined && newStage !== before.stage;
    if (moved) {
      patch.stage = newStage;
      const closing = newStage === 'won' || newStage === 'lost';
      patch.closedAt = closing ? new Date() : null;
      if (newStage !== 'lost' && lostReason === undefined) patch.lostReason = null;
    }
    const [row] = await tx.update(crmDeals).set(patch).where(eq(crmDeals.id, id)).returning();

    if (moved) {
      const from = stageInfo(before.stage).label;
      const to = stageInfo(newStage).label;
      if (newStage === 'won') {
        await record(tx, { dealId: id, contactId: row.contactId, kind: 'won', summary: `Deal won (${row.currency} ${Number(row.value).toLocaleString('en-US')})`, detail: `Moved from ${from}`, actor });
        const customerId = await ensureCustomer(tx, row, actor);
        await handOffWonDeal(tx, row, customerId, actor);
      } else if (newStage === 'lost') {
        await record(tx, { dealId: id, contactId: row.contactId, kind: 'lost', summary: 'Deal lost', detail: row.lostReason ? `Reason: ${row.lostReason}` : `Moved from ${from}`, actor });
      } else {
        await record(tx, { dealId: id, contactId: row.contactId, kind: 'stage', summary: `Moved from ${from} to ${to}`, actor });
      }
    }
    const [fresh] = await tx.select().from(crmDeals).where(eq(crmDeals.id, id));
    return toDeal(fresh);
  });
}

export async function deleteDeal(id: string): Promise<void> {
  uuid(id, 'Deal');
  const [row] = await getDb().delete(crmDeals).where(eq(crmDeals.id, id)).returning({ id: crmDeals.id });
  if (!row) throw new NotFoundError('Deal not found.');
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export async function logActivity(input: unknown): Promise<Activity> {
  const raw = asRecord(input, 'The activity');
  const kind = oneOf(raw.kind, 'Activity type', MANUAL_KINDS);
  const dealId = optUuid(raw.dealId, 'Deal');
  const contactId = optUuid(raw.contactId, 'Contact');
  if (!dealId && !contactId) throw new ValidationError('Choose a deal or a contact for this activity.');
  const summary = text(raw.summary, 'Summary', { max: 200 });
  const detail = optText(raw.detail, 'Details', 4000) ?? null;
  const actor = actorName(raw.actor);
  let durationSeconds: number | null = null;
  if (raw.durationSeconds !== undefined && raw.durationSeconds !== null && raw.durationSeconds !== '') {
    if (typeof raw.durationSeconds !== 'number' || !Number.isFinite(raw.durationSeconds) || raw.durationSeconds < 0 || raw.durationSeconds > 86_400) {
      throw new ValidationError('Duration must be between 0 seconds and 24 hours.');
    }
    durationSeconds = Math.round(raw.durationSeconds);
  }
  let dueAt: Date | null = null;
  if (raw.dueAt) {
    dueAt = new Date(String(raw.dueAt));
    if (Number.isNaN(dueAt.getTime())) throw new ValidationError('Due date is not a valid time.');
  }
  if (kind === 'task' && !dueAt) throw new ValidationError('A task needs a due date.');
  const channel: Channel | null = kind === 'email' ? 'email' : kind === 'sms' ? 'sms' : kind === 'call' ? 'call' : null;
  const direction = channel ? (raw.direction === 'in' ? 'in' : 'out') : null;

  return getDb().transaction(async (tx) => {
    let contact = contactId ?? null;
    if (dealId) {
      const [deal] = await tx.select().from(crmDeals).where(eq(crmDeals.id, dealId));
      if (!deal) throw new ValidationError('That deal no longer exists.');
      contact = contact ?? deal.contactId;
    } else if (contactId) await requireContact(tx, contactId);
    const a = await record(tx, { dealId: dealId ?? null, contactId: contact, kind, summary, detail, actor, durationSeconds, dueAt: kind === 'task' || kind === 'meeting' ? dueAt : null, channel, direction });
    // A logged touch counts as movement on the deal, so it shows up as changed in the live feed.
    if (dealId) await tx.update(crmDeals).set({ updatedAt: new Date() }).where(eq(crmDeals.id, dealId));
    return a;
  });
}

export async function setTaskDone(id: string, done: boolean): Promise<Activity> {
  uuid(id, 'Task');
  const db = getDb();
  const [row] = await db
    .update(crmActivities)
    .set({ doneAt: done ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(crmActivities.id, id), inArray(crmActivities.kind, ['task', 'meeting'])))
    .returning();
  if (!row) throw new NotFoundError('Task or meeting not found.');
  return toActivity(row);
}

export async function deleteActivity(id: string): Promise<void> {
  uuid(id, 'Activity');
  const [row] = await getDb()
    .delete(crmActivities)
    .where(and(eq(crmActivities.id, id), inArray(crmActivities.kind, [...MANUAL_KINDS])))
    .returning({ id: crmActivities.id });
  if (!row) throw new NotFoundError('Activity not found, or it is a system entry that cannot be deleted.');
}


// ---------------------------------------------------------------------------
// Receiving: emails, texts and calls arriving from outside
// ---------------------------------------------------------------------------

export interface InboundInput {
  channel: Channel;
  direction?: 'in' | 'out';
  /** Who it came from (an email address with an optional name, or a phone number). */
  from?: string;
  /** Who it went to; used instead of `from` when direction is 'out'. */
  to?: string;
  name?: string;
  subject?: string;
  body?: string;
  /** The sender's own id for this message or call, so a repeat delivery is recorded only once. */
  externalId?: string;
  durationSeconds?: number;
  occurredAt?: string;
  status?: string;
}

export interface InboundResult {
  activity: Activity;
  contact: Contact;
  duplicate: boolean;
  createdContact: boolean;
}

async function findContact(tx: Tx | Db, email: string | null, phone: string | null) {
  if (email) {
    const [c] = await tx.select().from(crmContacts).where(sql`lower(${crmContacts.email}) = ${email}`).limit(1);
    if (c) return c;
  }
  if (phone) {
    const [c] = await tx
      .select()
      .from(crmContacts)
      .where(sql`right(regexp_replace(coalesce(${crmContacts.phone}, ''), '\\D', '', 'g'), ${phone.length}) = ${phone}`)
      .limit(1);
    if (c) return c;
  }
  return null;
}

/** Records something that arrived from outside: matches the sender to a contact (or adds one), and files it on their open deal. */
export async function ingestCommunication(input: unknown): Promise<InboundResult> {
  const raw = asRecord(input, 'The message');
  const channel = oneOf(raw.channel, 'Channel', CHANNELS);
  const direction: 'in' | 'out' = raw.direction === 'out' ? 'out' : 'in';
  const party = (direction === 'in' ? raw.from : raw.to) as unknown;
  const partyText = typeof party === 'string' ? party.trim() : '';
  const addr = channel === 'email' ? parseAddress(partyText) : { name: null, email: null };
  const phone = channel === 'email' ? null : normalizePhone(partyText);
  if (!addr.email && !phone) throw new ValidationError(channel === 'email' ? 'The email needs a valid sender address.' : 'The message needs a phone number.');
  const externalId = optText(raw.externalId, 'Message id', 200);
  const subject = optText(raw.subject, 'Subject', 300);
  const body = optText(raw.body, 'Message', 20_000);
  const nameHint = optText(raw.name, 'Name', 120) ?? addr.name ?? undefined;
  const duration = typeof raw.durationSeconds === 'number' && Number.isFinite(raw.durationSeconds) && raw.durationSeconds >= 0 && raw.durationSeconds <= 86_400 ? Math.round(raw.durationSeconds) : null;
  let at = new Date();
  if (typeof raw.occurredAt === 'string' && raw.occurredAt) {
    const t = new Date(raw.occurredAt);
    if (!Number.isNaN(t.getTime()) && t.getTime() <= Date.now() + 60_000) at = t;
  }
  const status = optText(raw.status, 'Status', 40);

  const kind: ActivityKind = channel === 'email' ? 'email' : channel === 'call' ? 'call' : channel === 'web' ? 'note' : 'sms';
  const summary =
    channel === 'email' ? (subject ?? '(no subject)')
    : channel === 'call' ? `${direction === 'in' ? 'Incoming' : 'Outgoing'} call${status ? ` (${status.replace(/-/g, ' ')})` : ''}`
    : channel === 'web' ? (subject ?? 'Web form message')
    : (body ?? 'Text message').replace(/\s+/g, ' ').slice(0, 120);
  const detail = channel === 'sms' || channel === 'whatsapp' ? (body && body.length > 120 ? body : null) : (body ?? null);

  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      if (externalId) {
        const [dup] = await tx.select().from(crmActivities).where(eq(crmActivities.externalId, externalId));
        if (dup) {
          const [c] = dup.contactId ? await tx.select().from(crmContacts).where(eq(crmContacts.id, dup.contactId)) : [];
          return { activity: toActivity(dup), contact: toContact(c), duplicate: true, createdContact: false } satisfies InboundResult;
        }
      }
      let contact = await findContact(tx, addr.email, phone);
      let createdContact = false;
      if (!contact) {
        const label = nameHint ?? addr.email?.split('@')[0] ?? partyText;
        const [c] = await tx
          .insert(crmContacts)
          .values({ name: label.slice(0, 120), email: addr.email, phone: phone ? partyText.slice(0, 40) : null, source: 'other', status: 'lead', business: guessBusiness(addr.email) })
          .returning();
        contact = c;
        createdContact = true;
        await record(tx, { contactId: c.id, kind: 'created', summary: `Added ${c.name} from an incoming ${channel === 'email' ? 'email' : channel === 'call' ? 'call' : 'message'}`, actor: 'Inbox', at });
      }
      const [openDeal] = await tx
        .select()
        .from(crmDeals)
        .where(and(eq(crmDeals.contactId, contact.id), inArray(crmDeals.stage, [...OPEN_STAGES])))
        .orderBy(desc(crmDeals.updatedAt))
        .limit(1);
      const activity = await record(tx, {
        dealId: openDeal?.id ?? null, contactId: contact.id, kind, summary, detail, actor: contact.name, channel, direction,
        durationSeconds: duration, externalId: externalId ?? null, at,
      });
      if (openDeal) await tx.update(crmDeals).set({ updatedAt: new Date() }).where(eq(crmDeals.id, openDeal.id));
      // Asking to stop is acted on straight away, not at the next agent run.
      if (direction === 'in' && classifyInbound(subject, body) === 'unsubscribe') {
        await tx.update(crmContacts).set({ doNotContact: true, followUpDays: null, updatedAt: new Date() }).where(eq(crmContacts.id, contact.id));
        await record(tx, { contactId: contact.id, dealId: openDeal?.id ?? null, kind: 'note', summary: `${contact.name} asked to stop contact. No more follow-up messages will be drafted.`, actor: 'Inbox' });
        await tx.update(crmActivities).set({ triagedAt: new Date() }).where(eq(crmActivities.id, activity.id));
      }
      const [fresh] = await tx.select().from(crmContacts).where(eq(crmContacts.id, contact.id));
      return { activity, contact: toContact(fresh), duplicate: false, createdContact } satisfies InboundResult;
    });
  } catch (err) {
    // Two copies of the same delivery arriving together: the database refuses the second. Treat it as already recorded.
    if (externalId && (err as { code?: string }).code === '23505') {
      const [dup] = await db.select().from(crmActivities).where(eq(crmActivities.externalId, externalId));
      if (dup?.contactId) {
        const [c] = await db.select().from(crmContacts).where(eq(crmContacts.id, dup.contactId));
        return { activity: toActivity(dup), contact: toContact(c), duplicate: true, createdContact: false };
      }
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Sending, and the drafts the agents write for approval
// ---------------------------------------------------------------------------

/** Sends an email or text to a contact now, and records it on their history. */
export async function sendToContact(input: unknown): Promise<Activity> {
  const raw = asRecord(input, 'The message');
  const contactId = uuid(raw.contactId, 'Contact');
  const dealId = optUuid(raw.dealId, 'Deal');
  const channel = oneOf(raw.channel, 'Channel', ['email', 'sms'] as const);
  const subject = optText(raw.subject, 'Subject', 300);
  const body = text(raw.body, 'Message', { max: 10_000 });
  const actor = actorName(raw.actor);
  return deliver({ contactId, dealId: dealId ?? null, channel, subject: subject ?? null, body, actor });
}

async function deliver(m: { contactId: string; dealId: string | null; channel: 'email' | 'sms'; subject: string | null; body: string; actor: string }): Promise<Activity> {
  const db = getDb();
  const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, m.contactId));
  if (!contact) throw new NotFoundError('Contact not found.');
  if (contact.doNotContact) throw new ConflictError(`${contact.name} asked not to be contacted.`);
  let result;
  if (m.channel === 'email') {
    if (!contact.email) throw new ValidationError(`${contact.name} has no email address.`);
    result = await sendEmail(contact.email, m.subject ?? 'Following up', m.body);
  } else {
    if (!contact.phone) throw new ValidationError(`${contact.name} has no phone number.`);
    result = await sendSms(contact.phone, m.body);
  }
  if (!result.ok) throw new ConflictError(result.reason);
  return record(db, {
    dealId: m.dealId, contactId: contact.id, kind: m.channel === 'email' ? 'email' : 'sms',
    summary: m.channel === 'email' ? (m.subject ?? 'Following up') : m.body.replace(/\s+/g, ' ').slice(0, 120),
    detail: m.channel === 'email' ? m.body : m.body.length > 120 ? m.body : null,
    actor: m.actor, channel: m.channel, direction: 'out',
  });
}

/** Sends a draft (optionally edited first), or dismisses it. Only a person calls this; agents only ever write drafts. */
export async function actOnDraft(id: string, input: unknown): Promise<{ draft: Draft; activity: Activity | null }> {
  uuid(id, 'Draft');
  const raw = asRecord(input, 'The request');
  const action = oneOf(raw.action, 'Action', ['send', 'dismiss'] as const);
  const actor = actorName(raw.actor);
  const db = getDb();
  const [draft] = await db.select().from(crmDrafts).where(eq(crmDrafts.id, id));
  if (!draft) throw new NotFoundError('Draft not found.');
  if (draft.status !== 'pending' && draft.status !== 'failed') throw new ConflictError('That draft has already been handled.');
  if (action === 'dismiss') {
    const [row] = await db.update(crmDrafts).set({ status: 'dismissed', updatedAt: new Date() }).where(eq(crmDrafts.id, id)).returning();
    return { draft: toDraft(row), activity: null };
  }
  const subject = raw.subject === undefined ? draft.subject : (optText(raw.subject, 'Subject', 300) ?? null);
  const body = raw.body === undefined ? draft.body : text(raw.body, 'Message', { max: 10_000 });
  try {
    const activity = await deliver({ contactId: draft.contactId, dealId: draft.dealId, channel: draft.channel === 'sms' ? 'sms' : 'email', subject, body, actor });
    const [row] = await db.update(crmDrafts).set({ status: 'sent', subject, body, sentAt: new Date(), error: null, updatedAt: new Date() }).where(eq(crmDrafts.id, id)).returning();
    return { draft: toDraft(row), activity };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not send.';
    await db.update(crmDrafts).set({ status: 'failed', subject, body, error: message, updatedAt: new Date() }).where(eq(crmDrafts.id, id));
    throw err;
  }
}


// ---------------------------------------------------------------------------
// Collections and targets
// ---------------------------------------------------------------------------

/** Each won deal's invoice with what has been billed, paid and is still owed. */
export async function collections(): Promise<Collection[]> {
  const db = getDb();
  const lineTotals = db
    .select({ invoiceId: invoiceLines.invoiceId, total: sql<string>`sum(${invoiceLines.amount})`.as('line_total') })
    .from(invoiceLines).groupBy(invoiceLines.invoiceId).as('line_totals');
  const paymentTotals = db
    .select({ invoiceId: invoicePayments.invoiceId, paid: sql<string>`sum(${invoicePayments.amount})`.as('paid_total') })
    .from(invoicePayments).groupBy(invoicePayments.invoiceId).as('payment_totals');
  const rows = await db
    .select({
      dealId: crmDeals.id, invoiceId: invoices.id, docNumber: invoices.docNumber, currency: invoices.currencyCode,
      dueDate: invoices.dueDate, total: lineTotals.total, paid: paymentTotals.paid, today: sql<string>`CURRENT_DATE::text`,
    })
    .from(crmDeals)
    .innerJoin(invoices, eq(invoices.id, crmDeals.invoiceId))
    .leftJoin(lineTotals, eq(lineTotals.invoiceId, invoices.id))
    .leftJoin(paymentTotals, eq(paymentTotals.invoiceId, invoices.id))
    .where(eq(crmDeals.stage, 'won'))
    .limit(1000);
  return rows.map((r) => {
    const total = Number(r.total ?? 0);
    const paid = Number(r.paid ?? 0);
    const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
    return {
      dealId: r.dealId, invoiceId: r.invoiceId, docNumber: r.docNumber, currency: r.currency, total, paid, balance,
      dueDate: r.dueDate, overdue: balance > 0 && !!r.dueDate && r.dueDate < r.today,
    };
  });
}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const checkPeriod = (v: unknown): string => {
  if (typeof v !== 'string' || !PERIOD.test(v)) throw new ValidationError('The month must look like 2026-11.');
  return v;
};

export async function listTargets(period: string): Promise<Target[]> {
  const db = getDb();
  const rows = await db.select().from(crmTargets).where(eq(crmTargets.period, checkPeriod(period)));
  return rows.map((r) => ({ period: r.period, owner: r.owner, amount: Number(r.amount) }));
}

/** Sets a month's target for the team (empty owner) or a person. An amount of 0 or none clears it. */
export async function setTarget(input: unknown, actor: string): Promise<Target[]> {
  const o = asRecord(input);
  const period = checkPeriod(o.period);
  const owner = optText(o.owner, 'Person', 120)?.trim() ?? '';
  const raw = o.amount;
  const db = getDb();
  if (raw === undefined || raw === null || raw === '' || Number(raw) === 0) {
    await db.delete(crmTargets).where(and(eq(crmTargets.period, period), eq(crmTargets.owner, owner)));
  } else {
    const amount = money(raw, 'Target');
    await db.insert(crmTargets).values({ period, owner, amount: String(amount), setBy: actor })
      .onConflictDoUpdate({ target: [crmTargets.period, crmTargets.owner], set: { amount: String(amount), setBy: actor, updatedAt: new Date() } });
  }
  return listTargets(period);
}

/**
 * Billed, paid and overdue invoice amounts for each business, per currency. An invoice belongs to the business of the
 * CRM contact who is that customer, so invoices made by hand in Invoices count too once the contact is tagged.
 */
export async function businessFinance(): Promise<BusinessFinance[]> {
  const db = getDb();
  const rows = await db.execute<{ business: string | null; currency: string; billed: string; paid: string; overdue: string }>(sql`
    with line_totals as (select invoice_id, sum(amount) as total from invoice_lines group by invoice_id),
         pay_totals as (select invoice_id, sum(amount) as paid from invoice_payments group by invoice_id),
         owner_of as (select customer_id, min(business) as business from crm_contacts where customer_id is not null and business is not null group by customer_id)
    select o.business as business, i.currency_code as currency,
           coalesce(sum(l.total), 0) as billed,
           coalesce(sum(coalesce(p.paid, 0)), 0) as paid,
           coalesce(sum(case when i.due_date < current_date and l.total - coalesce(p.paid, 0) > 0 then l.total - coalesce(p.paid, 0) else 0 end), 0) as overdue
    from invoices i
    join line_totals l on l.invoice_id = i.id
    left join pay_totals p on p.invoice_id = i.id
    left join owner_of o on o.customer_id = i.customer_id
    group by o.business, i.currency_code`);
  return [...rows].map((r) => ({ business: r.business, currency: r.currency, billed: Number(r.billed), paid: Number(r.paid), overdue: Number(r.overdue) }));
}
