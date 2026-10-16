// Rule tests for Counsel (the AI lawyer). Run: npx tsx scripts/qa/counsel.test.ts
import assert from 'node:assert/strict';
import { PRACTICE_AREAS, AREA_GROUPS, findArea, findState } from '../../src/lib/counsel/areas';
import { detectUrgent } from '../../src/lib/counsel/guard';
import { buildSystemPrompt, cleanTurns, cleanProfile, MAX_PROFILE_CHARS } from '../../src/lib/counsel/prompt';
import { validateReview } from '../../src/lib/counsel/review';
import { DRAFT_TEMPLATES } from '../../src/lib/counsel/templates';

// catalog
assert.equal(new Set(PRACTICE_AREAS.map((a) => a.id)).size, PRACTICE_AREAS.length, 'area ids are unique');
for (const a of PRACTICE_AREAS) assert.ok(AREA_GROUPS.includes(a.group), `${a.id} has a known group`);
for (const g of ['Business', 'Finance', 'Customs & trade', 'Family & estate', 'Civil & disputes']) assert.ok(PRACTICE_AREAS.some((a) => a.group === g), `${g} is covered`);
for (const t of DRAFT_TEMPLATES) assert.ok(findArea(t.areaId), `template ${t.id} points at a real area`);
assert.equal(findState('tx'), 'TX');
assert.equal(findState('ZZ'), undefined);

// urgency guard
assert.ok(detectUrgent('I was served with a summons yesterday').some((f) => f.id === 'served'));
assert.ok(detectUrgent('CBP sent us a pre-penalty notice').some((f) => f.id === 'agency-contact'));
assert.ok(detectUrgent('We got a subpoena for our records').some((f) => f.id === 'subpoena'));
assert.ok(detectUrgent('Can we undervalue the invoice to pay less duty?').some((f) => f.id === 'sanctions-evasion'));
assert.ok(detectUrgent('my spouse is abusive and I need a restraining order').some((f) => f.id === 'protection'));
assert.equal(detectUrgent('How do I form an LLC in Delaware?').length, 0, 'ordinary questions raise no flag');

// prompt
const p = buildSystemPrompt({ areaId: 'import', state: 'tx', profile: 'Acme LLC imports castings.' }, new Date('2026-03-01'));
assert.match(p, /2026-03-01/);
assert.match(p, /governing state is TX/);
assert.match(p, /Tariff Act of 1930/);
assert.match(p, /<profile>\nAcme LLC imports castings\.\n<\/profile>/);
assert.match(p, /Never invent a case name/);
assert.doesNotMatch(buildSystemPrompt({}), /<profile>/, 'no profile block when none is given');
assert.match(buildSystemPrompt({ mode: 'draft' }), /Drafting mode/);
assert.equal(cleanProfile('x'.repeat(MAX_PROFILE_CHARS + 50)).length, MAX_PROFILE_CHARS);
assert.equal(cleanProfile(42), '');

// conversation checks
assert.equal(cleanTurns([]), null);
assert.equal(cleanTurns('hi'), null);
assert.equal(cleanTurns([{ role: 'system', content: 'x' }]), null, 'only user and assistant roles');
assert.equal(cleanTurns([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]), null, 'must end on a user turn');
assert.deepEqual(cleanTurns([{ role: 'assistant', content: 'hello' }, { role: 'user', content: 'q1' }, { role: 'user', content: 'q2' }]), [{ role: 'user', content: 'q1\n\nq2' }]);

// review validation
assert.equal(validateReview(null), null);
const r = validateReview({
  documentType: 'Supply Agreement',
  parties: ['A', 'B'],
  summary: 'A supply deal.',
  keyTerms: [{ term: 'Term', value: '2 years' }, { term: '', value: 'x' }],
  findings: [
    { severity: 'low', clause: '9', issue: 'Minor' },
    { severity: 'bogus', clause: '4', issue: 'Uncapped indemnity', suggestedFix: 'Cap at fees paid' },
    { severity: 'high', clause: '7.2', issue: 'Auto-renews with 180-day notice' },
    { severity: 'high', issue: '' },
  ],
});
assert.ok(r && !r.unreadable);
assert.deepEqual(r.findings.map((f) => f.severity), ['high', 'medium', 'low'], 'sorted by severity; unknown severity becomes medium; empty issue dropped');
assert.equal(r.keyTerms.length, 1);
assert.equal(validateReview({ unreadable: true })?.unreadable, true);
assert.equal(validateReview({})?.unreadable, true, 'an empty answer counts as unreadable');

console.log('Counsel rules passed.');

// review pipeline against a stand-in model
import { reviewContract } from '../../src/lib/counsel/review';
let seen: { system?: unknown; text?: string } = {};
const fake = {
  messages: {
    create: async (req: { system: string; messages: Array<{ content: Array<{ type: string; text?: string }> }> }) => {
      seen = { system: req.system, text: req.messages[0].content.find((b) => b.type === 'text')?.text };
      return { content: [{ type: 'text', text: 'Here: {"summary":"ok","documentType":"NDA","findings":[{"severity":"high","clause":"5","issue":"Perpetual term"}]}' }] };
    },
  },
} as unknown as Parameters<typeof reviewContract>[1];
async function pipeline() {
  const rv = await reviewContract({ text: 'This agreement '.repeat(30), side: 'buyer', areaId: 'contracts', state: 'tx', goals: 'exit in a year' }, fake);
  assert.equal(rv?.findings[0].severity, 'high');
  assert.match(seen.text ?? '', /the buyer/);
  assert.match(seen.text ?? '', /Governing state.*TX/);
  assert.match(String(seen.system), /untrusted/i, 'documents are treated as untrusted data');
  const failing = { messages: { create: async () => { throw new Error('boom'); } } } as unknown as Parameters<typeof reviewContract>[1];
  assert.equal(await reviewContract({ text: 'x'.repeat(300), side: 'neutral' }, failing), null, 'a model failure gives no review, not a crash');
  console.log('Counsel review pipeline passed.');
}
pipeline().catch((e) => { console.error(e); process.exit(1); });
