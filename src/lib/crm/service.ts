import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { crmActivities, crmContacts, crmDeals, customers } from '@/db/schema';
import { NotFoundError, ValidationError, asRecord, money, oneOf, optEmail, optIsoDate, optText, optUuid, text, uuid } from '@/lib/validation';
import {
  CONTACT_STATUSES, MANUAL_KINDS, SOURCES, STAGE_KEYS, stageInfo,
  type Activity, type ActivityKind, type Contact, type Deal, type StageKey,
} from './model';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toContact(r: typeof crmContacts.$inferSelect): Contact {
  return {
    id: r.id, name: r.name, company: r.company, jobTitle: r.jobTitle, email: r.email, phone: r.phone,
    source: r.source as Contact['source'], status: r.status as Contact['status'], owner: r.owner, customerId: r.customerId,
    notes: r.notes, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}
function toDeal(r: typeof crmDeals.$inferSelect): Deal {
  return {
    id: r.id, title: r.title, contactId: r.contactId, customerId: r.customerId, value: Number(r.value), currency: r.currency,
    stage: r.stage as StageKey, expectedClose: r.expectedClose, owner: r.owner, source: r.source as Deal['source'],
    lostReason: r.lostReason, closedAt: iso(r.closedAt), notes: r.notes, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}
function toActivity(r: typeof crmActivities.$inferSelect): Activity {
  return {
    id: r.id, dealId: r.dealId, contactId: r.contactId, kind: r.kind as ActivityKind, summary: r.summary, detail: r.detail,
    durationSeconds: r.durationSeconds, dueAt: iso(r.dueAt), doneAt: iso(r.doneAt), actor: r.actor,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

function actorName(v: unknown): string {
  return optText(v, 'Your name', 60) ?? 'Office team';
}

async function record(tx: Tx | Db, e: { dealId?: string | null; contactId?: string | null; kind: ActivityKind; summary: string; detail?: string | null; actor: string; durationSeconds?: number | null; dueAt?: Date | null }) {
  const [row] = await tx
    .insert(crmActivities)
    .values({
      dealId: e.dealId ?? null, contactId: e.contactId ?? null, kind: e.kind, summary: e.summary, detail: e.detail ?? null,
      actor: e.actor, durationSeconds: e.durationSeconds ?? null, dueAt: e.dueAt ?? null,
    })
    .returning();
  return toActivity(row);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface Snapshot {
  deals: Deal[];
  contacts: Contact[];
  activities: Activity[];
  /** The database's own clock, handed back as the starting point for the next "what changed" call. */
  now: string;
}

const DEAL_CAP = 1000;
const CONTACT_CAP = 1000;
const ACTIVITY_CAP = 300;

export async function snapshot(): Promise<Snapshot> {
  const db = getDb();
  const [deals, contacts, recent, openTasks, [clock]] = await Promise.all([
    db.select().from(crmDeals).orderBy(desc(crmDeals.updatedAt)).limit(DEAL_CAP),
    db.select().from(crmContacts).orderBy(desc(crmContacts.updatedAt)).limit(CONTACT_CAP),
    db.select().from(crmActivities).orderBy(desc(crmActivities.createdAt)).limit(ACTIVITY_CAP),
    db.select().from(crmActivities).where(and(eq(crmActivities.kind, 'task'), isNull(crmActivities.doneAt))).limit(ACTIVITY_CAP),
    db.execute<{ now: string }>(sql`select to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as now`),
  ]);
  const byId = new Map<string, Activity>();
  for (const a of [...recent, ...openTasks]) byId.set(a.id, toActivity(a));
  const activities = [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { deals: deals.map(toDeal), contacts: contacts.map(toContact), activities, now: clock.now };
}

/** Everything added or changed after `since` (an ISO time), for the live feed. */
export async function changesSince(since: string): Promise<Snapshot> {
  const t = new Date(since);
  if (Number.isNaN(t.getTime())) throw new ValidationError('"since" must be a time.');
  const db = getDb();
  const [deals, contacts, acts, [clock]] = await Promise.all([
    db.select().from(crmDeals).where(gt(crmDeals.updatedAt, t)).limit(DEAL_CAP),
    db.select().from(crmContacts).where(gt(crmContacts.updatedAt, t)).limit(CONTACT_CAP),
    db.select().from(crmActivities).where(gt(crmActivities.updatedAt, t)).orderBy(desc(crmActivities.createdAt)).limit(ACTIVITY_CAP),
    db.execute<{ now: string }>(sql`select to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as now`),
  ]);
  return { deals: deals.map(toDeal), contacts: contacts.map(toContact), activities: acts.map(toActivity), now: clock.now };
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
  if (!partial || has('notes')) out.notes = optText(raw.notes, 'Notes', 2000) ?? null;
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
    const [row] = await tx.insert(crmDeals).values({ ...fields, stage, contactId: contactId ?? null, source: fields.source ?? contact?.source ?? 'other' }).returning();
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
        await ensureCustomer(tx, row, actor);
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

  return getDb().transaction(async (tx) => {
    let contact = contactId ?? null;
    if (dealId) {
      const [deal] = await tx.select().from(crmDeals).where(eq(crmDeals.id, dealId));
      if (!deal) throw new ValidationError('That deal no longer exists.');
      contact = contact ?? deal.contactId;
    } else if (contactId) await requireContact(tx, contactId);
    const a = await record(tx, { dealId: dealId ?? null, contactId: contact, kind, summary, detail, actor, durationSeconds, dueAt: kind === 'task' ? dueAt : null });
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
    .where(and(eq(crmActivities.id, id), eq(crmActivities.kind, 'task')))
    .returning();
  if (!row) throw new NotFoundError('Task not found.');
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

