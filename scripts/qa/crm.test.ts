// Tests for the CRM: the pure calculations, then the real database flow (deals, history, won deals becoming customers).
// Run: npx tsx scripts/qa/crm.test.ts   (needs DATABASE_URL pointing at a migrated database)
import assert from 'node:assert/strict';
import { ago, crmMetrics, formatDuration, leadScore, type Activity, type Deal } from '../../src/lib/crm/model';

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
  actor: 'Ana', createdAt: '2026-10-29T12:00:00Z', updatedAt: '', ...o,
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
assert.deepEqual(m.activityWeek, { call: 1, email: 1, meeting: 0, note: 0 });
assert.equal(m.tasksOpen, 2);
assert.equal(m.tasksOverdue, 1);
assert.equal(m.owners[0].owner, 'Ana');
assert.equal(crmMetrics([], [], now).winRate, null);

// ---- database ----
async function db() {
  const svc = await import('../../src/lib/crm/service');
  const { getDb } = await import('../../src/db/client');
  const { customers, crmDeals, crmContacts } = await import('../../src/db/schema');
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

    const snap = await svc.snapshot();
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
