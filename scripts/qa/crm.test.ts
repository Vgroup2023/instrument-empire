// Tests for the CRM: the pure calculations, then the real database flow (deals, history, won deals becoming customers).
// Run: npx tsx scripts/qa/crm.test.ts   (needs DATABASE_URL pointing at a migrated database)
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  ago, bucketUpcoming, classifyInbound, crmMetrics, followUpDue, formatDuration, leadScore, nextFollowUp, normalizePhone, parseAddress,
  csvCell, wonDealsCsv, wonDealTotals, WON_LINE_COLUMNS, type WonDealLine, guessBusiness, monthOf, monthProgress, needsFollowUp, openValueSeries, reorderSchedule, reordersToAct, stageInfo, renderReport, summarizePeriod, type Activity, type Contact, type Deal,
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
  id: Math.random().toString(), title: 't', contactId: null, customerId: null, invoiceId: null, business: null, value: 0, currency: 'USD', stage: 'lead', expectedClose: null,
  owner: 'Ana', source: 'other', lostReason: null, closedAt: null, notes: null, createdAt: '', updatedAt: '', ...o,
});
const t = (o: Partial<Activity>): Activity => ({
  id: Math.random().toString(), dealId: null, contactId: null, kind: 'note', summary: 's', detail: null, durationSeconds: null, dueAt: null, doneAt: null,
  actor: 'Ana', channel: null, direction: null, priority: null, triage: null, createdAt: '2026-10-29T12:00:00Z', updatedAt: '', ...o,
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
  id: 'c', name: 'P', company: null, jobTitle: null, email: 'p@x.co', phone: null, source: 'other', status: 'lead', owner: null, business: null, customerId: null, notes: null,
  followUpDays: 7, reorderDays: null, doNotContact: false, lastContactAt: '2026-10-20T12:00:00Z', createdAt: '2026-09-01T00:00:00Z', updatedAt: '', ...o,
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

assert.equal(guessBusiness('mario@bluestarimex.com'), 'bluestarimex');
assert.equal(guessBusiness('X@BlueStarImex.COM'), 'bluestarimex');
assert.equal(guessBusiness('someone@gmail.com'), null);
assert.equal(guessBusiness(null), null);
assert.equal(monthOf('2026-10-31T23:59:59Z'), '2026-10');
assert.equal(monthOf('2026-11-01T00:00:00Z'), '2026-11');
assert.equal(monthProgress('2026-11', Date.parse('2026-10-15T00:00:00Z')), 0);
assert.equal(monthProgress('2026-11', Date.parse('2026-12-15T00:00:00Z')), 1);
assert.equal(monthProgress('2026-11', Date.parse('2026-11-16T00:00:00Z')), 0.5);

// ---- triage and alerts (pure) ----

// ---- completed deals: file and totals ----
assert.equal(csvCell('plain'), 'plain');
assert.equal(csvCell('a,b'), '"a,b"');
assert.equal(csvCell('say "hi"'), '"say ""hi"""');
assert.equal(csvCell('two\nlines'), '"two\nlines"');
assert.equal(csvCell(null), '');
assert.equal(csvCell(12.5), '12.5');
for (const evil of ['=HYPERLINK("http://x")', '+1+1', '-2+3', '@SUM(A1)']) assert.ok(csvCell(evil).replace(/^"/, '').startsWith("'"), `${evil} is kept as text`);
const wl = (o: Partial<WonDealLine> = {}): WonDealLine => ({
  dealId: 'd1', dealNo: 1, item: 1, invoiceNo: 'INV-1001', closedAt: '2026-10-20T10:00:00Z', customer: 'Acme, Inc.', business: 'bluestarimex', product: 'Lures "Pro"',
  qty: 2, unitPrice: 50, amount: 100, currency: 'USD', broughtInBy: 'Dana R', source: 'referral', ...o,
});
const csv = wonDealsCsv([wl(), wl({ item: 2, product: '=cmd', qty: 1, unitPrice: 25.5, amount: 25.5 }), wl({ dealId: 'd2', dealNo: 2, business: null, broughtInBy: null, currency: 'CAD', amount: 10 })]);
const csvLines = csv.trimEnd().split('\r\n');
assert.equal(csvLines[0], WON_LINE_COLUMNS.join(','));
assert.equal(csvLines.length, 4);
assert.equal(csvLines[1], '1,1,INV-1001,2026-10-20,"Acme, Inc.",BlueStarImex,"Lures ""Pro""",2,50.00,100.00,USD,Dana R,referral');
assert.ok(csvLines[2].includes(",'=cmd,"), 'a formula typed as a product is neutralised');
assert.ok(csvLines[3].startsWith('2,1,INV-1001,') && csvLines[3].includes(',CAD,,referral'), 'no business and nobody brought it in leave empty cells');
assert.equal(wonDealsCsv([]), WON_LINE_COLUMNS.join(',') + '\r\n');
const wt = wonDealTotals([wl(), wl({ item: 2, amount: 25.5 }), wl({ dealId: 'd2', dealNo: 2, currency: 'CAD', amount: 10 })]);
assert.deepEqual(wt, { deals: 2, items: 3, byCurrency: [{ currency: 'USD', amount: 125.5 }, { currency: 'CAD', amount: 10 }] });
assert.deepEqual(wonDealTotals([]), { deals: 0, items: 0, byCurrency: [] });

async function pureTriage() {
  const { rulesTriage, parseTriage, priorityScore } = await import('../../src/lib/crm/triage');
  const { renderTeamsCard } = await import('../../src/lib/crm/alerts');
  const rc = rulesTriage('Where is my order?', 'This is urgent, I cannot wait');
  assert.equal(rc.intent, 'question');
  assert.equal(rc.urgency, 3, 'a question reads as 2, and "urgent" adds one');
  assert.equal(rc.source, 'rules');
  assert.equal(rulesTriage('Stop', 'stop').doNotContact, true);
  assert.equal(rulesTriage('Thanks', 'Thanks\nGot it, much appreciated').summary, 'Thanks: Got it, much appreciated', 'a body that starts with the subject does not repeat it');
  assert.equal(rulesTriage(null, 'Where is my   order?').summary, 'Where is my order?', 'a text message has only its body');
  assert.equal(rulesTriage('Hello', null).summary, 'Hello');
  assert.equal(rulesTriage('x', 'I am not happy with this').intent, 'complaint');

  const fb = rulesTriage('Hello', 'Hello there');
  const ok = parseTriage({ intent: 'pricing', urgency: 9, sentiment: 5, business: 'pivit-fishing', summary: 'Wants a wholesale price', tasks: [{ summary: 'Send the price list', dueInHours: 9999 }, { nope: 1 }, 'bad'], confidence: 0.9 }, fb);
  assert.equal(ok.intent, 'pricing');
  assert.equal(ok.urgency, 5, 'urgency is limited to 1 to 5');
  assert.equal(ok.sentiment, 1, 'sentiment is limited to -1 to 1');
  assert.equal(ok.business, 'pivit-fishing');
  assert.deepEqual(ok.tasks, [{ summary: 'Send the price list', dueInHours: 168 }], 'bad tasks are dropped and hours limited');
  assert.equal(ok.source, 'ai');
  assert.equal(parseTriage({ intent: 'bogus', business: 'nope', urgency: 'high' }, fb).intent, 'other', 'an unknown intent falls back to the rules');
  assert.equal(parseTriage({ intent: 'bogus', business: 'nope' }, fb).business, null, 'an unknown business is dropped');
  assert.equal(parseTriage('not json', fb), fb);
  assert.equal(parseTriage(null, fb), fb);
  assert.equal(parseTriage({ intent: 'unsubscribe', confidence: 0.4 }, fb).intent, 'other', 'a weak "stop" from Claude is not trusted when the rules did not see one');
  assert.equal(parseTriage({ intent: 'unsubscribe', confidence: 0.95, doNotContact: true }, fb).doNotContact, true);

  assert.equal(priorityScore({ intent: 'complaint', urgency: 5, dealValue: 20000, overdueInvoice: true, daysWaiting: 30, newContact: true }), 100, 'capped at 100');
  assert.equal(priorityScore({ intent: 'other', urgency: 1, dealValue: 0, overdueInvoice: false, daysWaiting: 0 }), 11);
  assert.equal(priorityScore({ intent: 'pricing', urgency: 3, dealValue: 12000, overdueInvoice: false, daysWaiting: 2 }), 66);
  assert.ok(priorityScore({ intent: 'question', urgency: 2, dealValue: 0, overdueInvoice: true, daysWaiting: 0 }) > priorityScore({ intent: 'question', urgency: 2, dealValue: 0, overdueInvoice: false, daysWaiting: 0 }));

  const card = renderTeamsCard({ title: 'Unhappy customer: Ann', body: 'Wants a refund', severity: 'critical', business: 'bluestarimex' }, 'https://app.example.com/') as { attachments: { contentType: string; content: { body: { text: string; color?: string }[]; actions?: { url: string }[] } }[] };
  assert.equal(card.attachments[0].contentType, 'application/vnd.microsoft.card.adaptive');
  assert.equal(card.attachments[0].content.body[0].text, 'Unhappy customer: Ann');
  assert.equal(card.attachments[0].content.body[0].color, 'Attention');
  assert.equal(card.attachments[0].content.actions?.[0].url, 'https://app.example.com/dashboard/crm');
  assert.equal((renderTeamsCard({ title: 't', body: '', severity: 'info', business: null }, null) as { attachments: { content: { actions?: unknown } }[] }).attachments[0].content.actions, undefined, 'no link when the app address is unknown');

  // ---- quotes, reorders and the pipeline value chart ----
  assert.equal(stageInfo('proposal').label, 'Quote sent');
  const T = Date.parse('2026-11-08T12:00:00Z');
  const dl = (o: Partial<Deal>) => d({ id: Math.random().toString(), ...o });
  assert.equal(needsFollowUp({ stage: 'proposal', updatedAt: '2026-11-05T11:00:00Z' }, T), true, 'a quote quiet for 3 days needs following up');
  assert.equal(needsFollowUp({ stage: 'proposal', updatedAt: '2026-11-06T11:00:00Z' }, T), false, 'a quote quiet for under 3 days does not');
  assert.equal(needsFollowUp({ stage: 'negotiation', updatedAt: '2026-11-05T11:00:00Z' }, T), false, 'other stages wait 7 days');
  assert.equal(needsFollowUp({ stage: 'negotiation', updatedAt: '2026-11-01T11:00:00Z' }, T), true);
  assert.equal(needsFollowUp({ stage: 'lead', updatedAt: '2020-01-01T00:00:00Z' }, T), false, 'a brand-new lead is not "followed up"');
  assert.equal(needsFollowUp({ stage: 'won', updatedAt: '2020-01-01T00:00:00Z' }, T), false, 'closed deals never are');

  const cust = (o: Partial<Contact>) => person({ status: 'customer', ...o });
  const won = (contactId: string, closedAt: string, value = 1000, o: Partial<Deal> = {}) => dl({ contactId, stage: 'won', value, closedAt, createdAt: '2026-01-01T00:00:00Z', updatedAt: closedAt, ...o });
  const sched = (contacts: Contact[], deals: Deal[]) => reorderSchedule(contacts, deals, T);
  assert.equal(sched([cust({ id: 'a' })], [won('a', '2026-08-01T00:00:00Z')]).length, 0, 'no schedule, not listed');
  assert.equal(sched([cust({ id: 'a', reorderDays: 90 })], []).length, 0, 'no won deal yet, not listed');
  assert.equal(sched([cust({ id: 'a', reorderDays: 90, status: 'archived' })], [won('a', '2026-08-01T00:00:00Z')]).length, 0, 'archived, not listed');
  let r = sched([cust({ id: 'a', name: 'Summit', reorderDays: 90 })], [won('a', '2026-08-01T00:00:00Z', 5000)]);
  assert.equal(r.length, 1);
  assert.equal(r[0].dueAt, '2026-10-30T00:00:00.000Z', 'last order plus the cycle');
  assert.equal(r[0].status, 'due');
  assert.equal(r[0].daysSince, 99);
  assert.equal(r[0].daysUntil, -9, 'nine days overdue');
  assert.equal(r[0].lastValue, 5000);
  assert.equal(sched([cust({ id: 'a', reorderDays: 90 })], [won('a', '2026-08-15T00:00:00Z')])[0].status, 'soon', 'due in 6 days is "soon"');
  assert.equal(sched([cust({ id: 'a', reorderDays: 90 })], [won('a', '2026-09-20T00:00:00Z')])[0].status, 'later');
  r = sched([cust({ id: 'a', reorderDays: 60 })], [won('a', '2026-05-01T00:00:00Z'), won('a', '2026-10-01T00:00:00Z', 2000)]);
  assert.equal(r[0].lastValue, 2000, 'the cycle runs from the most recent won deal');
  assert.equal(r[0].status, 'later');
  const started = sched([cust({ id: 'a', reorderDays: 90 })], [won('a', '2026-08-01T00:00:00Z'), dl({ contactId: 'a', stage: 'lead', createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z' })]);
  assert.equal(started[0].inPipeline, true, 'a deal opened since the last order means the reorder is being worked');
  assert.equal(reordersToAct(started).length, 0, 'and it is not listed to act on');
  const olderOpen = sched([cust({ id: 'a', reorderDays: 90 })], [dl({ contactId: 'a', stage: 'lead', createdAt: '2026-03-01T00:00:00Z' }), won('a', '2026-08-01T00:00:00Z')]);
  assert.equal(olderOpen[0].inPipeline, false, 'an open deal older than the last order does not count');
  const many = sched([cust({ id: 'late', reorderDays: 90 }), cust({ id: 'early', reorderDays: 30 })], [won('late', '2026-09-01T00:00:00Z'), won('early', '2026-10-01T00:00:00Z')]);
  assert.deepEqual(many.map((x) => x.contactId), ['early', 'late'], 'soonest due first');
  assert.deepEqual(reordersToAct(many).map((x) => x.contactId), ['early'], 'only due and soon ones need acting on');

  const series = openValueSeries([
    dl({ value: 1000, stage: 'qualified', createdAt: '2026-06-10T00:00:00Z' }),
    dl({ value: 500, stage: 'won', createdAt: '2026-08-01T00:00:00Z', closedAt: '2026-09-15T00:00:00Z' }),
    dl({ value: 300, stage: 'lost', createdAt: '2026-10-05T00:00:00Z', closedAt: '2026-10-20T00:00:00Z' }),
    dl({ value: 200, stage: 'lead', createdAt: '2026-11-03T00:00:00Z' }),
  ], T, 6);
  assert.deepEqual(series.map((x) => x.label), ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']);
  assert.deepEqual(series.map((x) => x.value), [1000, 1000, 1500, 1000, 1000, 1200], 'open value at the end of each month, then now');

  // ---- the do-this-next list ----
  const { nextActions, actionLevel } = await import('../../src/lib/crm/model');
  const NOW = Date.parse('2026-11-04T12:00:00Z');
  const ann = person({ id: 'ann', name: 'Ann', business: 'bluestarimex' });
  const bob = person({ id: 'bob', name: 'Bob' });
  const msg = (o: Partial<Activity>) => t({ kind: 'email', direction: 'in', channel: 'email', contactId: 'ann', summary: 'Where is my order?', createdAt: '2026-11-04T10:00:00Z', priority: 80, triage: { intent: 'complaint', urgency: 5, sentiment: -0.8, summary: 'Shipment held, no reply yet', business: null, confidence: 0.9, source: 'ai' }, ...o });
  const run = (activities: Activity[], drafts: never[] = []) => nextActions({ activities, contacts: [ann, bob], deals: [], drafts, now: NOW });
  assert.equal(actionLevel(70), 'now'); assert.equal(actionLevel(69), 'today'); assert.equal(actionLevel(40), 'today'); assert.equal(actionLevel(39), 'soon');

  let list = run([msg({})]);
  assert.equal(list.length, 1);
  assert.equal(list[0].type, 'message');
  assert.equal(list[0].level, 'now');
  assert.equal(list[0].why, 'Shipment held, no reply yet', "the AI's summary is shown");
  assert.equal(list[0].business, 'bluestarimex', "the contact's business is carried over");
  assert.equal(run([msg({}), t({ kind: 'email', direction: 'out', channel: 'email', contactId: 'ann', createdAt: '2026-11-04T11:00:00Z' })]).length, 0, 'once we have replied it is not listed');
  assert.equal(run([msg({}), t({ kind: 'email', direction: 'out', channel: 'email', contactId: 'ann', createdAt: '2026-11-04T09:00:00Z' })]).length, 1, 'a reply from before the message does not count');
  assert.equal(run([msg({ doneAt: '2026-11-04T11:00:00Z' })]).length, 0, 'a message marked handled is not listed');
  assert.equal(run([msg({ createdAt: '2026-09-01T10:00:00Z' })]).length, 0, 'messages older than 30 days are not listed');
  list = run([msg({ id: 'm1', createdAt: '2026-11-03T10:00:00Z', priority: 50 }), msg({ id: 'm2', createdAt: '2026-11-04T10:00:00Z', priority: 60 })]);
  assert.equal(list.length, 1, 'one item per contact: the latest message');
  assert.equal(list[0].id, 'm2');
  const waiting = run([msg({ priority: 60, createdAt: '2026-10-30T12:00:00Z' })])[0];
  assert.equal(waiting.score, 65, 'a message that has waited five days scores five more');

  const overdueTask = t({ kind: 'task', contactId: 'bob', summary: 'Call Bob', dueAt: '2026-11-02T12:00:00Z', createdAt: '2026-11-01T12:00:00Z' });
  list = run([overdueTask]);
  assert.equal(list[0].score, 62, 'a task two days overdue: 30 + 30 + 2');
  assert.equal(list[0].overdue, true);
  assert.equal(list[0].level, 'today');
  assert.equal(run([t({ kind: 'task', contactId: 'bob', summary: 'Someday', dueAt: null })])[0].score, 30);
  assert.equal(run([t({ kind: 'task', contactId: 'bob', summary: 'Tomorrow', dueAt: '2026-11-05T06:00:00Z' })])[0].score, 40, 'due within a day adds 10');
  assert.equal(run([t({ kind: 'task', contactId: 'bob', summary: 'Done', doneAt: '2026-11-04T08:00:00Z' })]).length, 0, 'finished tasks are not listed');

  const fromMessage = run([msg({ id: 'mm', priority: 85 }), t({ kind: 'task', contactId: 'ann', summary: 'Call Ann back: they sound unhappy', dueAt: '2026-11-04T14:00:00Z', createdAt: '2026-11-04T10:01:00Z' })]);
  assert.equal(fromMessage.length, 1, 'a task made from a message replaces it');
  assert.equal(fromMessage[0].type, 'task');
  assert.ok(fromMessage[0].score >= 85, "and takes the message's priority");
  assert.equal(fromMessage[0].why, 'Shipment held, no reply yet', "and its summary");

  const draft = (status: 'pending' | 'failed' | 'sent' | 'dismissed') => ({ id: 'd-' + status, contactId: 'bob', dealId: null, channel: 'email', subject: 'Checking in', body: 'Hi', reason: 'Quiet for 14 days', status, createdBy: 'Follow-up agent', sentAt: null, error: status === 'failed' ? 'SMTP refused it' : null, createdAt: '2026-11-04T08:00:00Z', updatedAt: '' }) as never;
  list = nextActions({ activities: [], contacts: [ann, bob], deals: [], drafts: [draft('pending'), draft('failed'), draft('sent'), draft('dismissed')], now: NOW });
  assert.deepEqual(list.map((x) => [x.type, x.score]), [['draft', 45], ['draft', 25]], 'only pending and failed drafts, the failed one first');
  assert.equal(list[0].why, 'SMTP refused it');

  list = run([overdueTask, msg({ priority: 90 }), t({ kind: 'task', contactId: 'bob', summary: 'Someday', dueAt: null })]);
  assert.deepEqual(list.map((x) => x.score), [...list.map((x) => x.score)].sort((a, b) => b - a), 'highest score first');
  assert.equal(nextActions({ activities: [msg({}), overdueTask], contacts: [ann, bob], deals: [], drafts: [], now: NOW, limit: 1 }).length, 1, 'the list can be cut short');
}

// ---- database ----
async function db() {
  const svc = await import('../../src/lib/crm/service');
  const { getDb } = await import('../../src/db/client');
  const { customers, crmDeals, crmContacts } = await import('../../src/db/schema');
  const and0 = <T>(x: T) => x;
  const { inArray, eq } = await import('drizzle-orm');
  const made = { deals: [] as string[], contacts: [] as string[], customers: [] as string[], invoices: [] as string[] };
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

    // ...and hands the work to Finance once: one draft invoice for the deal value and one task in Finance's inbox
    const { invoices, invoiceLines, teamTasks } = await import('../../src/db/schema');
    const [afterWin] = await getDb().select().from(crmDeals).where(eq(crmDeals.id, deal.id));
    assert.ok(afterWin.invoiceId, 'won deal has a draft invoice');
    made.invoices.push(afterWin.invoiceId!);
    const [inv] = await getDb().select().from(invoices).where(eq(invoices.id, afterWin.invoiceId!));
    assert.equal(inv.customerId, won.customerId);
    const lines = await getDb().select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id));
    assert.equal(lines.length, 1);
    assert.equal(Number(lines[0].amount), 2500);
    const handoffs = await getDb().select().from(teamTasks).where(eq(teamTasks.source, `crm-won:${deal.id}`));
    assert.equal(handoffs.length, 1);
    assert.equal(handoffs[0].toDepartment, 'finance');
    assert.equal(handoffs[0].status, 'open');
    const invCount = await getDb().select().from(invoices).where(eq(invoices.customerId, won.customerId!));
    assert.equal(invCount.length, 1, 'winning twice does not bill twice');

    // collections: the won deal's invoice shows as billed and still owed
    const coll = (await svc.collections()).find((x) => x.dealId === deal.id);
    assert.ok(coll, 'collections include the won deal');
    assert.equal(coll!.total, 2500);
    assert.equal(coll!.paid, 0);
    assert.equal(coll!.balance, 2500);
    assert.equal(coll!.overdue, false);

    // business: tagged by hand, inherited by a deal from its contact, guessed from the email domain, and validated
    assert.equal(c.business, null, 'a plain email stays untagged');
    const tagged = await svc.updateContact(c.id, { business: 'pivit-fishing' });
    assert.equal(tagged.business, 'pivit-fishing');
    const bizDeal = await svc.createDeal({ title: 'QA business deal', value: 100, contactId: c.id, actor: 'Tester' });
    made.deals.push(bizDeal.id);
    assert.equal(bizDeal.business, 'pivit-fishing', 'a deal takes its contact\'s business');
    const retagged = await svc.updateDeal(bizDeal.id, { business: 'globlex-ai' });
    assert.equal(retagged.business, 'globlex-ai');
    const cleared = await svc.updateContact(c.id, { business: '' });
    assert.equal(cleared.business, null);
    await assert.rejects(() => svc.updateContact(c.id, { business: 'nope' }));
    const auto = await svc.createContact({ name: 'QA Auto', email: 'qa-auto@bluestarimex.com', actor: 'Tester' });
    made.contacts.push(auto.id);
    assert.equal(auto.business, 'bluestarimex', 'the email domain tags a new contact');
    const fin = await svc.businessFinance();
    assert.ok(Array.isArray(fin));

    // quotes: reaching Quote sent makes one follow-up task, due in three days
    {
      const qd = await svc.createDeal({ title: 'QA quote deal', value: 800, contactId: c.id, owner: 'Tester', actor: 'Tester' });
      made.deals.push(qd.id);
      const quoteTasks = async () => (await svc.activitiesFor({ dealId: qd.id })).filter((x) => x.kind === 'task' && x.summary.startsWith('Follow up on the quote'));
      assert.equal((await quoteTasks()).length, 0, 'no quote task before the quote is sent');
      await svc.updateDeal(qd.id, { stage: 'proposal', actor: 'Tester' });
      let qt = await quoteTasks();
      assert.equal(qt.length, 1, 'moving to Quote sent adds a follow-up task');
      const days = (Date.parse(qt[0].dueAt!) - Date.now()) / 86_400_000;
      assert.ok(days > 2.9 && days < 3.1, 'due in about three days');
      await svc.updateDeal(qd.id, { stage: 'negotiation', actor: 'Tester' });
      await svc.updateDeal(qd.id, { stage: 'proposal', actor: 'Tester' });
      assert.equal((await quoteTasks()).length, 1, 'while that task is open, a second one is not added');
      await svc.setTaskDone(qt[0].id, true);
      await svc.updateDeal(qd.id, { stage: 'negotiation', actor: 'Tester' });
      await svc.updateDeal(qd.id, { stage: 'proposal', actor: 'Tester' });
      assert.equal((await quoteTasks()).length, 2, 'once it is done, sending another quote adds a new one');
      const direct = await svc.createDeal({ title: 'QA quote direct', value: 1, stage: 'proposal', actor: 'Tester' });
      made.deals.push(direct.id);
      assert.equal((await svc.activitiesFor({ dealId: direct.id })).filter((x) => x.kind === 'task').length, 1, 'a deal created straight into Quote sent gets the task too');
    }

    // reorder schedule on a contact: saved, validated, cleared
    {
      const rc = await svc.createContact({ name: 'QA Reorder', email: 'qa-reorder@example.com', actor: 'Tester' });
      made.contacts.push(rc.id);
      assert.equal(rc.reorderDays, null);
      assert.equal((await svc.updateContact(rc.id, { reorderDays: 90 })).reorderDays, 90);
      assert.equal((await svc.updateContact(rc.id, { reorderDays: 60 })).reorderDays, 60);
      await assert.rejects(() => svc.updateContact(rc.id, { reorderDays: 0.5 }));
      await assert.rejects(() => svc.updateContact(rc.id, { reorderDays: 1000 }));
      await assert.rejects(() => svc.updateContact(rc.id, { reorderDays: 'soon' }));
      assert.equal((await svc.updateContact(rc.id, { reorderDays: 60 })).reorderDays, 60, 'a refused value changes nothing');
      assert.equal((await svc.updateContact(rc.id, { reorderDays: null })).reorderDays, null, 'cleared');
      assert.equal((await svc.updateContact(rc.id, { name: 'QA Reorder 2' })).reorderDays, null, 'saving other fields leaves it alone');
    }

    // triage and alerts: a complaint is read, tasked, tagged, alerted and delivered to Teams, once
    {
      const alerts = await import('../../src/lib/crm/alerts');
      const { afterInbound } = await import('../../src/lib/crm/inbound');
      const { crmAlerts, crmActivities: acts } = await import('../../src/db/schema');
      const dbx = getDb();
      const keep = { TEAMS_WEBHOOK_URL: process.env.TEAMS_WEBHOOK_URL, CRM_ALERT_EMAIL: process.env.CRM_ALERT_EMAIL, CRM_ALERT_SMS: process.env.CRM_ALERT_SMS, APP_BASE_URL: process.env.APP_BASE_URL };
      delete process.env.TEAMS_WEBHOOK_URL; delete process.env.CRM_ALERT_EMAIL; delete process.env.CRM_ALERT_SMS;
      const alertIds: string[] = [];
      const hits: { body: string }[] = [];
      let failNext = 1;
      const hook = createServer((req, res) => {
        let b = '';
        req.on('data', (d) => { b += d; });
        req.on('end', () => { hits.push({ body: b }); if (failNext > 0) { failNext--; res.statusCode = 500; } res.end('ok'); });
      });
      await new Promise<void>((r) => hook.listen(0, '127.0.0.1', () => r()));
      try {
        // nothing set up: the alert is kept, marked so, and nothing is sent
        const key = `qa-alert-${Date.now()}`;
        const first = await alerts.enqueueAlert({ dedupeKey: key, kind: 'stalled_deal', severity: 'important', title: 'QA stalled deal', body: 'quiet for 9 days' });
        assert.equal(first.created, true);
        assert.ok(first.id);
        alertIds.push(first.id!);
        assert.equal((await alerts.enqueueAlert({ dedupeKey: key, kind: 'stalled_deal', severity: 'important', title: 'again' })).created, false, 'the same key is never queued twice');
        const none = await alerts.deliverPending({ ids: [first.id!] });
        assert.equal(none.noChannel, 1);
        assert.equal((await dbx.select().from(crmAlerts).where(eq(crmAlerts.id, first.id!)))[0].status, 'no_channel');

        // a Teams webhook that fails once: retried, then delivered with the card
        const port = (hook.address() as { port: number }).port;
        process.env.TEAMS_WEBHOOK_URL = `http://127.0.0.1:${port}/hook`;
        process.env.APP_BASE_URL = 'https://app.example.com';
        assert.deepEqual(alerts.channelsReady(), { email: false, sms: false, teams: true });
        await alerts.deliverPending({ ids: [first.id!] });
        let row = (await dbx.select().from(crmAlerts).where(eq(crmAlerts.id, first.id!)))[0];
        assert.equal(row.status, 'pending', 'a failed delivery goes back to waiting');
        assert.equal(row.attempts, 1);
        assert.match(row.lastError ?? '', /teams/);
        await alerts.deliverPending({ ids: [first.id!] });
        row = (await dbx.select().from(crmAlerts).where(eq(crmAlerts.id, first.id!)))[0];
        assert.equal(row.status, 'sent');
        assert.equal(row.attempts, 2);
        assert.ok(hits.at(-1)!.body.includes('QA stalled deal'), 'the card reached the webhook');

        // a complaint arriving by email, read by a fake Claude, handled the moment it arrives
        const fake = { messages: { create: async () => ({ content: [{ type: 'text', text: JSON.stringify({ intent: 'complaint', urgency: 5, sentiment: -0.9, business: 'bluestarimex', summary: 'Shipment held and nobody has replied', tasks: [{ summary: 'Check the customs hold', dueInHours: 2 }], confidence: 0.9 }) }] }) } } as never;
        const inbound = await svc.ingestCommunication({ channel: 'email', from: 'Pat Angry <pat.qa@example.org>', subject: 'Third time asking', body: 'My shipment is held and nobody has replied. Very upset.', externalId: `qa-msg-${Date.now()}` });
        made.contacts.push(inbound.contact.id);
        await afterInbound(inbound, { llm: fake });
        const [stored] = await dbx.select().from(acts).where(eq(acts.id, inbound.activity.id));
        assert.ok(stored.triagedAt, 'the message is marked read');
        assert.equal((stored.triage as { source: string }).source, 'ai');
        assert.ok((stored.priority ?? 0) >= 70, 'a very urgent complaint is high priority');
        const asSeen = (await svc.activitiesFor({ contactId: inbound.contact.id })).find((x) => x.id === inbound.activity.id)!;
        assert.equal(asSeen.triage?.intent, 'complaint', 'the reading is part of the activity the screens get');
        assert.equal(asSeen.triage?.summary, 'Shipment held and nobody has replied');
        assert.equal(asSeen.priority, stored.priority);
        const handled = await svc.setTaskDone(inbound.activity.id, true);
        assert.ok(handled.doneAt, 'a received message can be marked handled');
        assert.equal((await svc.setTaskDone(inbound.activity.id, false)).doneAt, null, 'and reopened');
        await assert.rejects(() => svc.setTaskDone(handled.id.replace(/.$/, (c) => (c === '0' ? '1' : '0')), true), 'an unknown id is refused');
        const out = await svc.logActivity({ kind: 'note', contactId: inbound.contact.id, summary: 'A plain note', actor: 'Tester' });
        await assert.rejects(() => svc.setTaskDone(out.id, true), 'a plain note cannot be marked done');
        const tasks = (await svc.activitiesFor({ contactId: inbound.contact.id })).filter((x) => x.kind === 'task').map((x) => x.summary);
        assert.ok(tasks.some((x) => x.startsWith('Call Pat Angry back')), 'the complaint task is made');
        assert.ok(tasks.includes('Check the customs hold'), "Claude's own task is added");
        const [tagged] = await getDb().select().from(crmContacts).where(eq(crmContacts.id, inbound.contact.id));
        assert.equal(tagged.business, 'bluestarimex', 'an untagged contact takes the business the message is about');
        const [alert] = await dbx.select().from(crmAlerts).where(eq(crmAlerts.dedupeKey, `complaint:${inbound.activity.id}`));
        assert.ok(alert, 'an alert was raised');
        alertIds.push(alert.id);
        assert.equal(alert.severity, 'critical');
        assert.equal(alert.status, 'sent', 'and delivered straight away');
        assert.ok(hits.some((h) => h.body.includes('Unhappy customer: Pat Angry')));
        // handling it again (the agent run) does nothing more
        const hitsBefore = hits.length;
        await afterInbound(inbound, { llm: fake });
        assert.equal((await dbx.select().from(crmAlerts).where(eq(crmAlerts.dedupeKey, `complaint:${inbound.activity.id}`))).length, 1);
        assert.equal(hits.length, hitsBefore, 'no second alert is sent');
      } finally {
        hook.close();
        for (const [k, v] of Object.entries(keep)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        if (alertIds.length) await dbx.delete(crmAlerts).where(inArray(crmAlerts.id, alertIds));
      }
    }

    // targets: set, change, read back and clear, for the team and for a person
    const month = '2099-01';
    await svc.setTarget({ period: month, amount: 50000 }, 'Tester');
    await svc.setTarget({ period: month, owner: 'QA Rep', amount: 12000 }, 'Tester');
    let tg = await svc.listTargets(month);
    assert.equal(tg.find((x) => x.owner === '')?.amount, 50000);
    await svc.setTarget({ period: month, amount: 60000 }, 'Tester');
    tg = await svc.listTargets(month);
    assert.equal(tg.length, 2);
    assert.equal(tg.find((x) => x.owner === '')?.amount, 60000);
    await assert.rejects(() => svc.setTarget({ period: '2099-13', amount: 1 }, 'Tester'));
    await assert.rejects(() => svc.setTarget({ period: month, amount: -5 }, 'Tester'));
    await svc.setTarget({ period: month, amount: 0 }, 'Tester');
    await svc.setTarget({ period: month, owner: 'QA Rep' }, 'Tester');
    assert.equal((await svc.listTargets(month)).length, 0);

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
    assert.deepEqual(inbox.map((r) => r.agent), ['crm-inbox', 'crm-follow-up', 'crm-pipeline', 'crm-alerts', 'crm-digest']);
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

    // completed deals: one row per invoice line, numbered, with who brought it in, and narrowed by business
    {
      const { invoiceLines: lineT, products: prodT } = await import('../../src/db/schema');
      const tag = `QA-${Date.now().toString(36)}`;
      const cw = await svc.createContact({ name: 'Wendy Won', company: `${tag} Co`, email: `won-${tag}@example.com`, actor: 'Tester' });
      made.contacts.push(cw.id);
      const w1 = await svc.createDeal({ title: `${tag} trade order`, value: 4000, contactId: cw.id, owner: 'Dana R', business: 'bluestarimex', source: 'referral', actor: 'Tester' });
      const w2 = await svc.createDeal({ title: `${tag} free sample`, value: 0, contactId: cw.id, owner: 'Sam K', business: 'pivit-fishing', actor: 'Tester' });
      made.deals.push(w1.id, w2.id);
      const open = await svc.createDeal({ title: `${tag} still open`, value: 999, contactId: cw.id, actor: 'Tester' });
      made.deals.push(open.id);
      const won1 = await svc.updateDeal(w1.id, { stage: 'won', actor: 'Tester' });
      await svc.updateDeal(w2.id, { stage: 'won', actor: 'Tester' });
      assert.ok(won1.invoiceId, 'winning a deal with a value drafts its invoice');
      made.invoices.push(won1.invoiceId!);
      const [prod] = await getDb().insert(prodT).values({ name: `${tag} Jig 3oz`, type: 'Inventory' }).returning();
      await getDb().insert(lineT).values({ invoiceId: won1.invoiceId!, productId: prod.id, description: 'Box of 12', qty: '3', unitPrice: '100', amount: '300', lineNumber: 2 });

      const all = (await svc.completedDeals()).lines.filter((l) => l.customer === `${tag} Co`);
      assert.equal(all.length, 3, 'two invoice lines for the first deal plus one line for the deal with no invoice');
      assert.ok(!all.some((l) => /still open/.test(l.product)), 'open deals are not completed deals');
      const first = all.filter((l) => l.dealId === w1.id);
      assert.deepEqual(first.map((l) => l.item), [1, 2]);
      assert.equal(first[0].product, `${tag} trade order`);
      assert.equal(first[0].amount, 4000);
      assert.equal(first[1].product, `${tag} Jig 3oz: Box of 12`, 'a linked product shows its name and the line note');
      assert.equal(first[1].qty, 3);
      assert.equal(first[1].unitPrice, 100);
      assert.ok(first.every((l) => l.invoiceNo && l.broughtInBy === 'Dana R' && l.business === 'bluestarimex' && l.source === 'referral'));
      assert.equal(first[0].dealNo, first[1].dealNo, 'lines of one deal share its number');
      const bare = all.find((l) => l.dealId === w2.id)!;
      assert.equal(bare.invoiceNo, null);
      assert.equal(bare.product, `${tag} free sample`);
      assert.equal(bare.amount, 0);
      assert.equal(bare.broughtInBy, 'Sam K');
      assert.ok(bare.dealNo > first[0].dealNo || bare.dealNo < first[0].dealNo, 'each deal has its own number');

      const blue = (await svc.completedDeals('bluestarimex')).lines.filter((l) => l.customer === `${tag} Co`);
      assert.deepEqual(blue.map((l) => l.dealId), [w1.id, w1.id], 'the business filter keeps only that business');
      assert.equal(blue[0].dealNo, first[0].dealNo, 'filtering does not renumber deals');
      assert.ok(!(await svc.completedDeals('globlex-ai')).lines.some((l) => l.customer === `${tag} Co`));
      await assert.rejects(() => svc.completedDeals('acme'), /not recognised/);
      await getDb().delete(lineT).where(eq(lineT.productId, prod.id));
      await getDb().delete(prodT).where(eq(prodT.id, prod.id));
    }

    const snap = await svc.snapshot();
    assert.ok(Array.isArray(snap.drafts) && Array.isArray(snap.reports));
    assert.ok(snap.deals.some((x) => x.id === deal.id));
    assert.ok(snap.contacts.some((x) => x.id === c.id));
    assert.match(snap.now, /^\d{4}-\d\d-\d\dT/);
  } finally {
    const d2 = getDb();
    if (made.deals.length) await d2.delete(crmDeals).where(inArray(crmDeals.id, made.deals));
    if (made.contacts.length) await d2.delete(crmContacts).where(inArray(crmContacts.id, made.contacts));
    const { invoices: invT, teamTasks: ttT } = await import('../../src/db/schema');
    if (made.deals.length) for (const id of made.deals) await d2.delete(ttT).where(eq(ttT.source, `crm-won:${id}`));
    if (made.invoices.length) await d2.delete(invT).where(inArray(invT.id, made.invoices));
    if (made.customers.length) await d2.delete(customers).where(inArray(customers.id, made.customers));
  }
}

// CI has no database, so the database half runs only where DATABASE_URL is set.
pureTriage().then(
  () => {
    // CI has no database, so the database half runs only where DATABASE_URL is set.
    if (!process.env.DATABASE_URL) {
      console.log('crm: ok (calculations only; set DATABASE_URL to run the database checks too)');
      return;
    }
    return db().then(() => { console.log('crm: ok'); process.exit(0); });
  },
).catch((err) => { console.error(err); process.exit(1); });
