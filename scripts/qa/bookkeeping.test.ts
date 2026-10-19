// Rule tests for the AI bookkeeping copilot. Run: npx tsx scripts/qa/bookkeeping.test.ts
// The pure rules always run. With DATABASE_URL set (a migrated, disposable database) it also
// runs an end-to-end pass: import, match, categorize, approve, auto-post, duplicates, double clicks.
import assert from 'node:assert/strict';
import { parseOfx, readStatementFile, statementKind, validateAiLines } from '../../src/lib/bookkeeping/statementFiles';
import { fromHistory, matchRule, merchantKey, suggestWithAi, vendorFromDescription, AI_CONFIDENCE_CAP, type Rule } from '../../src/lib/bookkeeping/categorize';

// merchant keys ignore numbers, dates and filler words
assert.equal(merchantKey('POS DEBIT ADOBE *CREATIVE CLD 800-833-6687 09/03'), 'ADOBE CREATIVE CLD');
assert.equal(merchantKey('AMZN Mktp US*2K4 123456'), 'AMZN MKTP US');
assert.equal(merchantKey('1234 5678'), 'UNKNOWN');

// rules: longest pattern wins, case-insensitive
const rules: Rule[] = [
  { id: 'r1', pattern: 'ADOBE', accountId: 'a-software', vendorId: null, autoPost: false },
  { id: 'r2', pattern: 'ADOBE STOCK', accountId: 'a-marketing', vendorId: null, autoPost: true },
];
assert.equal(matchRule('Adobe Stock purchase', rules)?.id, 'r2');
assert.equal(matchRule('adobe creative cloud', rules)?.id, 'r1');
assert.equal(matchRule('Staples', rules), null);

// history: needs a clear majority; more repeats, more confidence
assert.equal(fromHistory('X', []), null);
assert.equal(fromHistory('SHELL', [{ merchantKey: 'SHELL', accountId: 'fuel', uses: 1 }])?.confidence, 70);
assert.equal(fromHistory('SHELL', [{ merchantKey: 'SHELL', accountId: 'fuel', uses: 4 }])?.confidence, 92);
assert.equal(fromHistory('SHELL', [{ merchantKey: 'SHELL', accountId: 'fuel', uses: 2 }, { merchantKey: 'SHELL', accountId: 'meals', uses: 2 }]), null, 'a split history is not trusted');
const mixed = fromHistory('SHELL', [{ merchantKey: 'SHELL', accountId: 'fuel', uses: 4 }, { merchantKey: 'SHELL', accountId: 'meals', uses: 1 }]);
assert.equal(mixed?.accountId, 'fuel');
assert.ok((mixed?.confidence ?? 100) < 92, 'disagreement lowers confidence');

// vendors: only an unambiguous name hit counts
const vendors = [{ id: 'v1', name: 'Reliable Metals Co.' }, { id: 'v2', name: 'Ace' }];
assert.equal(vendorFromDescription('ACH RELIABLE METALS CO. 4411', vendors), 'v1');
assert.equal(vendorFromDescription('ACE TOOLS', vendors), null, 'names under 4 letters are not matched');

async function main() {
// Claude: ids are checked against the chart, confidence is capped, junk is dropped
const options = [{ id: 'a-software', name: 'Software', type: 'Expense' }, { id: 'a-fuel', name: 'Fuel', type: 'Expense' }];
const fake = (text: string) => ({ messages: { create: async () => ({ content: [{ type: 'text', text }] }) } }) as never;
const out = await suggestWithAi(
  [{ i: 0, description: 'SHELL OIL', amount: -40 }, { i: 1, description: 'MYSTERY', amount: -9 }, { i: 2, description: 'X', amount: -1 }],
  options,
  fake('{"results":[{"i":0,"accountId":"a-fuel","confidence":99,"reason":"Fuel station"},{"i":1,"accountId":"made-up-id","confidence":90,"reason":"?"},{"i":5,"accountId":"a-fuel","confidence":50}]}'),
);
assert.equal(out.get(0)?.accountId, 'a-fuel');
assert.equal(out.get(0)?.confidence, AI_CONFIDENCE_CAP);
assert.equal(out.has(1), false, 'an id that is not in the chart is rejected');
assert.equal(out.has(5), false);
assert.equal((await suggestWithAi([{ i: 0, description: 'A', amount: -1 }], options, fake('not json'))).size, 0);

// statement files: kinds, OFX (1.x without closing tags and 2.x with them), Claude-read PDFs
assert.equal(statementKind('Chase_Sep.QFX', ''), 'ofx');
assert.equal(statementKind('export.csv', 'text/csv'), 'csv');
assert.equal(statementKind('stmt.pdf', 'application/pdf'), 'pdf');
assert.equal(statementKind('photo.jpeg', 'image/jpeg'), 'image');
assert.equal(statementKind('notes.docx', ''), null);
const ofx1 = 'OFXHEADER:100\n<OFX><BANKTRANSLIST><STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260903120000[-5:EST]\n<TRNAMT>-54.99\n<NAME>ADOBE CREATIVE CLOUD\n<MEMO>SUBSCRIPTION\n</STMTTRN><STMTTRN>\n<DTPOSTED>20260904\n<TRNAMT>1200.00\n<NAME>CUSTOMER PAYMENT\n</STMTTRN></BANKTRANSLIST></OFX>';
assert.deepEqual(parseOfx(ofx1), [
  { date: '2026-09-03', description: 'ADOBE CREATIVE CLOUD SUBSCRIPTION', amount: -54.99 },
  { date: '2026-09-04', description: 'CUSTOMER PAYMENT', amount: 1200 },
]);
assert.equal(parseOfx('<STMTTRN><DTPOSTED>20260903</DTPOSTED><TRNAMT>-5.00</TRNAMT><NAME>X</NAME></STMTTRN>')[0].amount, -5);
assert.throws(() => parseOfx('<STMTTRN><TRNAMT>-5.00</TRNAMT></STMTTRN>'), /no usable date/);
assert.deepEqual(
  validateAiLines({ transactions: [{ date: '2026-09-03', description: 'SHELL', amount: -40.126 }, { date: 'Sept 3', description: 'BAD DATE', amount: -1 }, { date: '2026-09-04', description: 'ZERO', amount: 0 }, { date: '2026-09-05', description: '', amount: -2 }] }),
  [{ date: '2026-09-03', description: 'SHELL', amount: -40.13 }],
);
assert.deepEqual(validateAiLines('nope'), []);
const pdfFake = (text: string) => ({ messages: { create: async () => ({ content: [{ type: 'text', text }] }) } }) as never;
const b64 = Buffer.from('%PDF-1.4 fake').toString('base64');
await assert.rejects(readStatementFile({ fileName: 's.pdf', mimeType: 'application/pdf', base64: b64, aiEnabled: false }), /needs Claude/);
await assert.rejects(readStatementFile({ fileName: 's.docx', mimeType: '', base64: b64, aiEnabled: true }), /Upload a CSV/);
assert.equal((await readStatementFile({ fileName: 's.pdf', mimeType: 'application/pdf', base64: b64, aiEnabled: true, client: pdfFake('{"transactions":[{"date":"2026-09-03","description":"SHELL","amount":-40}]}') })).length, 1);
await assert.rejects(readStatementFile({ fileName: 's.pdf', mimeType: 'application/pdf', base64: b64, aiEnabled: true, client: pdfFake('not json') }), /Couldn't find any/);
assert.equal((await readStatementFile({ fileName: 'a.csv', mimeType: 'text/csv', base64: Buffer.from('\uFEFFDate,Description,Amount\n2026-09-03,ADOBE,-54.99').toString('base64'), aiEnabled: false })).length, 1);

console.log('bookkeeping rules: ok');

if (process.env.DATABASE_URL) {
  const { getDb } = await import('../../src/db/client');
  const { accounts, vendors: vendorsTable, bankTransactions } = await import('../../src/db/schema');
  const svc = await import('../../src/lib/bookkeeping/service');
  const { eq } = await import('drizzle-orm');
  process.env.ANTHROPIC_API_KEY = ''; // no model in the end-to-end pass

  const db = getDb();
  const [bank] = await db.insert(accounts).values({ name: 'Checking QA', accountType: 'Bank' }).returning();
  const [software] = await db.insert(accounts).values({ name: 'Software QA', accountType: 'Expense' }).returning();
  const [fuel] = await db.insert(accounts).values({ name: 'Fuel QA', accountType: 'Expense' }).returning();
  await db.insert(vendorsTable).values({ displayName: 'Reliable Metals Co.' });

  const csv = [
    'Date,Description,Amount',
    '2026-09-03,ADOBE CREATIVE CLOUD 4411,-54.99',
    '2026-09-04,SHELL OIL 1234,-40.00',
    '2026-09-04,SHELL OIL 1234,-40.00',
    '2026-09-05,CUSTOMER DEPOSIT,1200.00',
  ].join('\n');
  await svc.createRule({ pattern: 'adobe', accountId: software.id, autoPost: false });

  const first = await svc.importStatement(bank.id, csv);
  assert.equal(first.added, 4, 'two identical lines on one day are both kept');
  assert.equal(first.processed.toReview, 4);
  const again = await svc.importStatement(bank.id, csv);
  assert.equal(again.added, 0, 'the same statement twice adds nothing');
  assert.equal(again.duplicates, 4);

  let o = await svc.getOverview();
  assert.equal(o.counts.review, 4);
  const adobe = o.queue.find((t) => t.description.startsWith('ADOBE'))!;
  assert.equal(adobe.suggestedAccountId, software.id);
  assert.equal(adobe.confidence, 99);
  const deposit = o.queue.find((t) => t.amount > 0)!;
  await assert.rejects(svc.approveLine(deposit.id, { accountId: software.id }), /not booked as an expense/);
  assert.equal((await db.select().from(bankTransactions).where(eq(bankTransactions.id, deposit.id)))[0].status, 'review', 'a refused line goes back to the queue');

  // approve + remember: books an expense, creates a rule, and the same merchant is then suggested
  const shell = o.queue.filter((t) => t.description.startsWith('SHELL'));
  const r1 = await svc.approveLine(shell[0].id, { accountId: fuel.id, makeRule: true });
  assert.equal(r1.ruleCreated, true);
  await assert.rejects(svc.approveLine(shell[0].id, { accountId: fuel.id }), /already handled/, 'a second click cannot book it twice');
  const [exp] = await db.execute<{ n: string }>(`select count(*) as n from expenses` as never);
  assert.equal(Number(exp.n), 1);

  // a rule added after a line is already waiting reaches it on Re-check
  await svc.runBookkeeping({ reconsider: true });
  const waiting = (await svc.getOverview()).queue.find((t) => t.description.startsWith('SHELL'))!;
  assert.equal(waiting.suggestedAccountId, fuel.id, 'the Shell rule created by the approval now suggests fuel');
  assert.equal(waiting.source, 'rule');

  // the other identical Shell line is not "already booked": the one expense belongs to the first line
  await svc.runBookkeeping();
  assert.equal((await svc.getOverview()).counts.matched, 0);

  // bulk approve books only confident lines (the adobe rule, 99%)
  const bulk = await svc.approveConfident();
  assert.equal(bulk.failed, 0);
  assert.ok(bulk.posted >= 1);

  // an auto-post rule books on import, without a click
  await svc.createRule({ pattern: 'staples', accountId: software.id, autoPost: true });
  const auto = await svc.importStatement(bank.id, 'Date,Description,Amount\n2026-09-10,STAPLES STORE 22,-12.50\n2026-09-11,STAPLES STORE 22,+75');
  assert.equal(auto.processed.autoPosted, 1);
  assert.equal(auto.processed.toReview, 1, 'money in is never auto-booked');

  // a statement line that is already booked is recognised, not duplicated
  const { createExpense } = await import('../../src/lib/accounting/expenses');
  await createExpense({ paymentAccountId: bank.id, paymentType: 'Cash', txnDate: '2026-09-20', lines: [{ accountId: fuel.id, amount: 61.25 }] });
  const m = await svc.importStatement(bank.id, 'Date,Description,Amount\n2026-09-21,FUEL STOP,-61.25');
  assert.equal(m.processed.matched, 1);

  // deleting a booked expense puts its line back in the queue
  const { deleteExpense } = await import('../../src/lib/accounting/expenses');
  const posted = (await db.select().from(bankTransactions).where(eq(bankTransactions.status, 'posted')))[0];
  await deleteExpense(posted.postedExpenseId!);
  await svc.runBookkeeping();
  assert.equal((await db.select().from(bankTransactions).where(eq(bankTransactions.id, posted.id)))[0].status, 'review');

  o = await svc.getOverview();
  assert.ok(o.readiness.length === 3);
  await assert.rejects(svc.createRule({ pattern: 'ab', accountId: software.id }), /at least 3/);
  console.log('bookkeeping end to end: ok');
}
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
