// Tests for the CRM: the pure calculations, then the real database flow (deals, history, won deals becoming customers).
// Run: npx tsx scripts/qa/crm.test.ts   (needs DATABASE_URL pointing at a migrated database)
import assert from 'node:assert/strict';
import {
  ago, bucketUpcoming, classifyInbound, crmMetrics, followUpDue, formatDuration, leadScore, nextFollowUp, normalizePhone, parseAddress,
  renderReport, summarizePeriod, type Activity, type Contact, type Deal,
} from '../../src/lib/crm/model';

// ---- pure ----
assert.equal(formatDuration(65), '1m 05s');
assert.equal(formatDuration(3720), '1h 02m');
assert.equal(formatDuration(-4), '0m 00s');
const now = Date.parse('2026-10-30T12:00:00Z');
assert.equal(ago('2026-10-30T11:59:50Z', now), 'just now');
assert.equal(ago('2026-10-30T11:50:00Z', now), '10m ago');
assert.equal(ago('2026-10-30T09:00:00Z', now), '3h ago');
assert.equal(ago('2026-10-28T12:00:00Z', now), '2d ago');

const bare = { email: null, phone: null, company: null, jobTitle: null, source: 'other' as const };
assert.equal(leadScore(bare, 0, 0), 3);
assert.equal(leadScore({ email: 'a@b.co', phone: '1', company: 'X', jobTitle: 'CEO', source: 'referral' }, 5, 20000), 100);
assert.ok(leadScore(bare, 99, 99999) <= 100);
assert.ok(leadScore({ ...bare, source: 'referral' }, 0, 0) > leadScore({ ...bare, source: 'outreach' }, 0, 0));

const d = (o: Partial<Deal>): Deal => ({
  id: Math.random().toString(), title: 't', contactId: null, customerId: null, value: 0, currency: 'USD', stage: 'lead', expectedClose: null,
  owner: 'Ana', source: 'other', lostReason: null, closedAt: null, notes: null, createdAt: '', updatedAt: '', ...o,
});
const t = (o: Partial<Activity>): Activity => ({
  id: Math.random().toString(), dealId: null, contactId: null, kind: 'note', summary: 's', detail: null, durationSeconds: null, dueAt: null, doneAt: null,
  actor: 'Ana', channel: null, direction: null, createdAt: '2026-10-29T12:00:00Z', updatedAt: '', ...o,
});
const m = crmMetrics(
  [
    d({ stage: 'lead', value: 1000 }),
    d({ stage: 'proposal', value: 2000, owner: 'Ben' }),
    d({ stage: 'negotiation', value: 4000 }),
    d({ stage: 'won', value: 3000, closedAt: '2026-10-20T00:00:00Z' }),
    d({ stage: 'won', value: 1000, closedAt: '2026-10-21T00:00:00Z', owner: 'Ben' }),
    d({ stage: 'lost', value: 500, closedAt: '2026-10-22T00:00:00Z' }),
    d({ stage: 'won', value: 9999, closedAt: '2025-01-01T00:00:00Z' }), // too old to count
  ],
  [
    t({ kind: 'call' }), t({ kind: 'email' }), t({ kind: 'note', createdAt: '2026-09-01T00:00:00Z' }),
    t({ kind: 'task', dueAt: '2026-10-29T00:00:00Z' }), t({ kind: 'task', dueAt: '2026-11-05T00:00:00Z' }), t({ kind: 'task', doneAt: '2026-10-29T00:00:00Z' }),
  ],
  now,
);
assert.equal(m.openCount, 3);
assert.equal(m.openValue, 7000);
assert.equal(m.forecast, 100 + 1000 + 3000); // 10% of 1000, 50% of 2000, 75% of 4000
assert.equal(m.wonCount, 2);
assert.equal(m.wonValue, 4000);
assert.equal(m.lostCount, 1);
assert.equal(m.winRate, 66.7);
assert.equal(m.avgDealSize, 2000);
assert.deepEqual(m.activityWeek, { call: 1, email: 1, sms: 0, meeting: 0, note: 0 });
assert.equal(m.tasksOpen, 2);
assert.equal(m.tasksOverdue, 1);
assert.equal(m.owners[0].owner, 'Ana');
assert.equal(crmMetrics([], [], now).winRate, null);

// ---- receiving, follow-ups, reports (pure) ----
assert.equal(normalizePhone('+1 (201) 686-8698'), '2016868698');
assert.equal(normalizePhone('201.686.8698'), '2016868698');
assert.equal(normalizePhone('12'), null);
assert.equal(normalizePhone(null), null);
assert.deepEqual(parseAddress('Dana Rivera <Dana@Rivera.test>'), { name: 'Dana Rivera', email: 'dana@rivera.test' });
assert.deepEqual(parseAddress('"Rivera, Dana" <d@r.test>'), { name: 'Rivera, Dana', email: 'd@r.test' });
assert.deepEqual(parseAddress('plain@x.org'), { name: null, email: 'plain@x.org' });
assert.deepEqual(parseAddress('not an address'), { name: null, email: null });
assert.equal(classifyInbound('Re: quote', 'Please unsubscribe me'), 'unsubscribe');
assert.equal(classifyInbound(null, 'STOP'), 'unsubscribe');
assert.equal(classifyInbound('Hello', 'Can we schedule a call next week?'), 'meeting_request');
assert.equal(classifyInbound('Pricing', 'How much for 50 units?'), 'pricing');
assert.equal(classifyInbound('Order', 'I am very disappointed with the delay'), 'complaint');
assert.equal(classifyInbound('Hi', 'Where is my package?'), 'question');
assert.equal(classifyInbound('Thanks', 'Got it'), 'other');
const person = (o: Partial<Contact>): Contact => ({
  id: 'c', name: 'P', company: null, jobTitle: null, email: 'p@x.co', phone: null, source: 'other', status: 'lead', owner: null, customerId: null, notes: null,
  followUpDays: 7, doNotContact: false, lastContactAt: '2026-10-20T12:00:00Z', createdAt: '2026-09-01T00:00:00Z', updatedAt: '', ...o,
});
assert.equal(nextFollowUp(person({})), '2026-10-27T12:00:00.000Z');
assert.equal(nextFollowUp(person({ followUpDays: null })), null);
assert.equal(nextFollowUp(person({ doNotContact: true })), null);
assert.equal(nextFollowUp(person({ lastContactAt: null })), '2026-09-08T00:00:00.000Z');
assert.equal(followUpDue(person({}), Date.parse('2026-10-27T12:00:01Z')), true);
assert.equal(followUpDue(person({}), Date.parse('2026-10-26T12:00:00Z')), false);
const upcoming = bucketUpcoming(
  [{ dueAt: '2026-10-29T08:00:00Z' }, { dueAt: '2026-10-30T15:00:00Z' }, { dueAt: '2026-10-30T09:00:00Z' }, { dueAt: '2026-10-31T09:00:00Z' }, { dueAt: '2026-11-03T09:00:00Z' }, { dueAt: '2026-12-25T09:00:00Z' }],
  Date.parse('2026-10-30T12:00:00Z'),
);
assert.deepEqual(upcoming.map((g) => g.label), ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later']);
assert.equal(upcoming[1].items[0].dueAt, '2026-10-30T09:00:00Z', 'earlier first within a group');

const period = summarizePeriod(
  [d({ stage: 'won', value: 3000, closedAt: '2026-10-29T13:30:00Z', createdAt: '2026-10-01T00:00:00Z' }), d({ stage: 'lead', value: 500, updatedAt: '2026-09-01T00:00:00Z', title: 'Quiet one', createdAt: '2026-09-01T00:00:00Z' })],
  [person({ id: 'n1', createdAt: '2026-10-29T13:00:00Z' })],
  [
    t({ kind: 'email', direction: 'in', createdAt: '2026-10-29T14:00:00Z' }), t({ kind: 'email', direction: 'out', createdAt: '2026-10-29T15:00:00Z' }),
    t({ kind: 'sms', direction: 'in', createdAt: '2026-10-29T16:00:00Z' }), t({ kind: 'stage', createdAt: '2026-10-29T17:00:00Z' }),
    t({ kind: 'meeting', dueAt: '2026-11-02T15:00:00Z', summary: 'Demo', createdAt: '2026-10-28T00:00:00Z' }),
  ],
  2, new Date('2026-10-29T12:00:00Z'), new Date('2026-10-30T12:00:00Z'),
);
assert.equal(period.newContacts, 1);
assert.deepEqual(period.received, { email: 1, sms: 1, call: 0 });
assert.deepEqual(period.sent, { email: 1, sms: 0, call: 0 });
assert.equal(period.wonCount, 1);
assert.equal(period.wonValue, 3000);
assert.equal(period.dealsMoved, 1);
assert.equal(period.draftsWaiting, 2);
assert.equal(period.staleDeals.length, 1);
assert.equal(period.upcomingMeetings.length, 1);
const text = renderReport('daily', '2026-10-30', period, 'All good.');
assert.match(text, /^Daily CRM report: 2026-10-30\n\nAll good\./);
assert.match(text, /Received: 1 emails, 1 texts, 0 calls/);
assert.match(text, /Quiet one: nothing for/);
assert.match(text, /Demo/);

// ---- database ----
async function db() {
  const svc = await import('../../src/lib/crm/service');
  const { getDb } = await import('../../src/db/client');
  const { customers, crmDeals, crmContacts } = await import('../../src/db/schema');
  const and0 = <T>(x: T) => x;
  const { inArray, eq } = await import('drizzle-orm');
  const made = { deals: [] as string[], contacts: [] as string[], customers: [] as string[] };
  try {
    const c = await svc.createContact({ name: 'QA Contact', company: 'QA Corp', email: 'qa@example.com', source: 'referral', actor: 'Tester' });
    made.contacts.push(c.id);
    assert.equal(c.status, 'lead');

    const deal = await svc.createDeal({ title: 'QA deal', value: 2500, contactId: c.id, owner: 'Tester', actor: 'Tester' });
    made.deals.push(deal.id);
    assert.equal(deal.stage, 'lead');
    await assert.rejects(() => svc.createDeal({ title: 'x', stage: 'won' }), /open stage/);
    await assert.rejects(() => svc.createDeal({ title: 'x', value: -5 }), /negative|greater/);
    await assert.rejects(() => svc.createDeal({ title: '' }), /required/);

    const call = await svc.logActivity({ kind: 'call', dealId: deal.id, summary: 'Intro call', durationSeconds: 185, actor: 'Tester' });
    assert.equal(call.durationSeconds, 185);
    assert.equal(call.contactId, c.id, 'an activity on a deal also lands on the deal\'s contact');
    await assert.rejects(() => svc.logActivity({ kind: 'call', summary: 'orphan' }), /deal or a contact/);
    await assert.rejects(() => svc.logActivity({ kind: 'task', dealId: deal.id, summary: 'no date' }), /due date/);
    await assert.rejects(() => svc.logActivity({ kind: 'stage', dealId: deal.id, summary: 'forged' }), /Activity type/);
    const task = await svc.logActivity({ kind: 'task', dealId: deal.id, summary: 'Send quote', dueAt: new Date(Date.now() + 86_400_000).toISOString() });
    assert.equal((await svc.setTaskDone(task.id, true)).doneAt !== null, true);
    assert.equal((await svc.setTaskDone(task.id, false)).doneAt, null);

    const moved = await svc.updateDeal(deal.id, { stage: 'proposal', actor: 'Tester' });
    assert.equal(moved.stage, 'proposal');
    assert.equal(moved.closedAt, null);

    // a change shows up in the live feed
    const before = new Date(Date.now() - 60_000).toISOString();
    const feed = await svc.changesSince(before);
    assert.ok(feed.deals.some((x) => x.id === deal.id));
    assert.ok(feed.activities.some((x) => x.id === call.id));
    const later = await svc.changesSince(new Date(Date.now() + 60_000).toISOString());
    assert.equal(later.deals.length + later.activities.length, 0);

    // winning creates the customer once, and links it everywhere
    const won = await svc.updateDeal(deal.id, { stage: 'won', actor: 'Tester' });
    assert.equal(won.stage, 'won');
    assert.ok(won.closedAt);
    assert.ok(won.customerId, 'won deal has a customer');
    made.customers.push(won.customerId!);
    const [cust] = await getDb().select().from(customers).where(eq(customers.id, won.customerId!));
    assert.equal(cust.displayName, 'QA Corp');
    const [contactAfter] = await getDb().select().from(crmContacts).where(eq(crmContacts.id, c.id));
    assert.equal(contactAfter.status, 'customer');
    assert.equal(contactAfter.customerId, won.customerId);
    // moving it around again does not make a second customer
    await svc.updateDeal(deal.id, { stage: 'negotiation', actor: 'Tester' });
    const again = await svc.updateDeal(deal.id, { stage: 'won', actor: 'Tester' });
    assert.equal(again.customerId, won.customerId);

    const history = await svc.activitiesFor({ dealId: deal.id });
    const kinds = history.map((h) => h.kind);
    for (const k of ['created', 'call', 'task', 'stage', 'won', 'customer']) assert.ok(kinds.includes(k as never), `history has a ${k} entry`);
    assert.equal(kinds.filter((k) => k === 'customer').length, 1);

    // losing records the reason; system entries cannot be deleted by hand
    const lost = await svc.createDeal({ title: 'QA lost deal', value: 100, actor: 'Tester' });
    made.deals.push(lost.id);
    const l2 = await svc.updateDeal(lost.id, { stage: 'lost', lostReason: 'Price', actor: 'Tester' });
    assert.equal(l2.lostReason, 'Price');
    assert.ok(l2.closedAt);
    const reopened = await svc.updateDeal(lost.id, { stage: 'qualified', actor: 'Tester' });
    assert.equal(reopened.closedAt, null);
    assert.equal(reopened.lostReason, null);
    const sys = (await svc.activitiesFor({ dealId: lost.id })).find((h) => h.kind === 'created')!;
    await assert.rejects(() => svc.deleteActivity(sys.id), /system entry/);
    await svc.deleteActivity(call.id);

    // ---- receiving ----
    const key = `qa-${Date.now()}`;
    const got = await svc.ingestCommunication({ channel: 'email', from: `Newcomer Nick <nick-${key}@example.test>`, subject: 'Question about pricing', body: 'How much does it cost?', externalId: `<${key}@mail>` });
    made.contacts.push(got.contact.id);
    assert.equal(got.createdContact, true);
    assert.equal(got.duplicate, false);
    assert.equal(got.contact.name, 'Newcomer Nick');
    assert.equal(got.activity.direction, 'in');
    assert.equal(got.activity.channel, 'email');
    const repeat = await svc.ingestCommunication({ channel: 'email', from: `nick-${key}@example.test`, subject: 'Question about pricing', externalId: `<${key}@mail>` });
    assert.equal(repeat.duplicate, true, 'the same message delivered twice is recorded once');
    assert.equal(repeat.activity.id, got.activity.id);
    const second = await svc.ingestCommunication({ channel: 'email', from: `NICK-${key}@Example.test`, subject: 'Another', externalId: `<${key}-2@mail>` });
    assert.equal(second.contact.id, got.contact.id, 'the sender is matched by address, ignoring case');
    assert.equal(second.createdContact, false);
    assert.ok(second.contact.lastContactAt, 'receiving something resets the follow-up clock');
    await assert.rejects(() => svc.ingestCommunication({ channel: 'email', from: 'not an address' }), /valid sender/);
    await assert.rejects(() => svc.ingestCommunication({ channel: 'sms', from: '12' }), /phone number/);

    // a text from a number already on file (written differently) matches that contact
    const phoneContact = await svc.createContact({ name: 'Phone Pat', phone: '(555) 010-4477', actor: 'Tester' });
    made.contacts.push(phoneContact.id);
    const txt = await svc.ingestCommunication({ channel: 'sms', from: '+1 555 010 4477', body: 'Running late, call me', externalId: `SM${key}` });
    assert.equal(txt.contact.id, phoneContact.id);
    assert.equal(txt.activity.kind, 'sms');
    const phoneCall = await svc.ingestCommunication({ channel: 'call', direction: 'in', from: '5550104477', status: 'completed', durationSeconds: 240, externalId: `CA${key}` });
    assert.equal(phoneCall.activity.durationSeconds, 240);
    assert.equal(phoneCall.activity.summary, 'Incoming call (completed)');
    // a message from someone with an open deal lands on that deal
    const onDeal = await svc.createDeal({ title: 'QA inbound deal', contactId: phoneContact.id, value: 100, actor: 'Tester' });
    made.deals.push(onDeal.id);
    const filed = await svc.ingestCommunication({ channel: 'sms', from: '5550104477', body: 'About the deal' });
    assert.equal(filed.activity.dealId, onDeal.id);

    // asking to stop is acted on straight away
    const stop = await svc.ingestCommunication({ channel: 'email', from: `nick-${key}@example.test`, subject: 'Re: update', body: 'Please unsubscribe me from these emails' });
    assert.equal(stop.contact.doNotContact, true);
    assert.equal(stop.contact.followUpDays, null);
    await assert.rejects(() => svc.sendToContact({ contactId: got.contact.id, channel: 'email', subject: 'Hi', body: 'Hello' }), /asked not to be contacted/);

    // scheduling a meeting for later, and ticking it off
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const meeting = await svc.logActivity({ kind: 'meeting', dealId: onDeal.id, summary: 'Product demo', dueAt: soon, actor: 'Tester' });
    assert.equal(meeting.dueAt, soon);
    assert.equal(meeting.doneAt, null);
    assert.ok((await svc.setTaskDone(meeting.id, true)).doneAt);

    // ---- agents ----
    const agents = await import('../../src/lib/crm/agents');
    const { crmDrafts, crmActivities, crmReports } = await import('../../src/db/schema');
    const { and: andOp } = await import('drizzle-orm');
    const inbox = await agents.runCrmAgents({ now: new Date() });
    assert.deepEqual(inbox.map((r) => r.agent), ['crm-inbox', 'crm-follow-up', 'crm-pipeline', 'crm-digest']);
    assert.ok(inbox.every((r) => !r.error), `agents ran clean: ${JSON.stringify(inbox.filter((r) => r.error))}`);
    const tasksFor = async (contactId: string) => (await svc.activitiesFor({ contactId })).filter((x) => x.kind === 'task');
    assert.ok((await tasksFor(got.contact.id)).some((x) => /pricing|question/i.test(x.summary)), 'the inbox agent made a task for the pricing question');
    const noMore = await agents.runCrmAgents({ now: new Date() });
    assert.equal(noMore[0].handled, 0, 'a second run does not read the same messages again');
    assert.equal((await tasksFor(got.contact.id)).filter((x) => /pricing/i.test(x.summary)).length, 1);

    // follow-up agent: a contact quiet for longer than their cadence gets one draft, not one per run
    const quiet = await svc.createContact({ name: 'Quiet Quinn', email: `quinn-${key}@example.test`, followUpDays: 7, actor: 'Tester' });
    made.contacts.push(quiet.id);
    await getDb().update(crmContacts).set({ lastContactAt: new Date(Date.now() - 10 * 86_400_000) }).where(eq(crmContacts.id, quiet.id));
    const r1 = await agents.runCrmAgents({ now: new Date() });
    assert.ok(r1[1].handled >= 1, 'a follow-up draft was written');
    const drafts = await getDb().select().from(crmDrafts).where(eq(crmDrafts.contactId, quiet.id));
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].status, 'pending');
    assert.match(drafts[0].body, /Hi Quiet,/);
    await agents.runCrmAgents({ now: new Date() });
    assert.equal((await getDb().select().from(crmDrafts).where(eq(crmDrafts.contactId, quiet.id))).length, 1, 'no second draft in the same period');
    assert.equal((await getDb().select().from(crmDrafts).where(eq(crmDrafts.contactId, got.contact.id))).length, 0, 'nothing is drafted for someone who asked to stop');
    // dismissing a draft works, and it cannot be handled twice
    const dismissed = await svc.actOnDraft(drafts[0].id, { action: 'dismiss' });
    assert.equal(dismissed.draft.status, 'dismissed');
    await assert.rejects(() => svc.actOnDraft(drafts[0].id, { action: 'send' }), /already been handled/);

    // pipeline agent: a deal untouched for weeks gets one check-in task
    const stale = await svc.createDeal({ title: 'QA stale deal', value: 900, actor: 'Tester' });
    made.deals.push(stale.id);
    await getDb().update(crmDeals).set({ updatedAt: new Date(Date.now() - 30 * 86_400_000) }).where(eq(crmDeals.id, stale.id));
    await agents.runCrmAgents({ now: new Date() });
    await agents.runCrmAgents({ now: new Date() });
    const staleTasks = (await svc.activitiesFor({ dealId: stale.id })).filter((x) => x.kind === 'task');
    assert.equal(staleTasks.length, 1, 'one check-in task, however many times the agent runs');

    // reporting agent: one report per period, rewritten only when asked
    const first = await agents.generateReport('daily', { now: new Date(), force: true });
    assert.equal(first.report.kind, 'daily');
    assert.match(first.report.body, /^Daily CRM report: /);
    const reuse = await agents.generateReport('daily', { now: new Date() });
    assert.equal(reuse.created, false);
    assert.equal(reuse.report.id, first.report.id);
    const weekly = await agents.generateReport('weekly', { now: new Date(), force: true });
    assert.match(weekly.report.title, /week of \d{4}-\d\d-\d\d/);
    await getDb().delete(crmReports).where(and0(eq(crmReports.id, first.report.id)));
    await getDb().delete(crmReports).where(eq(crmReports.id, weekly.report.id));
    void crmActivities; void andOp;

    const snap = await svc.snapshot();
    assert.ok(Array.isArray(snap.drafts) && Array.isArray(snap.reports));
    assert.ok(snap.deals.some((x) => x.id === deal.id));
    assert.ok(snap.contacts.some((x) => x.id === c.id));
    assert.match(snap.now, /^\d{4}-\d\d-\d\dT/);
  } finally {
    const d2 = getDb();
    if (made.deals.length) await d2.delete(crmDeals).where(inArray(crmDeals.id, made.deals));
    if (made.contacts.length) await d2.delete(crmContacts).where(inArray(crmContacts.id, made.contacts));
    if (made.customers.length) await d2.delete(customers).where(inArray(customers.id, made.customers));
  }
}

// CI has no database, so the database half runs only where DATABASE_URL is set.
if (!process.env.DATABASE_URL) {
  console.log('crm: ok (calculations only; set DATABASE_URL to run the database checks too)');
} else {
  db().then(
    () => { console.log('crm: ok'); process.exit(0); },
    (err) => { console.error(err); process.exit(1); },
  );
}
