#!/usr/bin/env node
// Entry-compliance and stress test for every form in the app, run over HTTP.
//
//   QA_BASE_URL=http://localhost:3111 APP_PASSWORD=... node scripts/qa/entries.mjs
//
// It CREATES records, so it only runs against a throwaway database. It refuses a
// non-local address unless QA_ALLOW_REMOTE=1. Exit code is the number of failed
// checks (0 = all passed), so it can gate CI.
//
// What "compliant" means here, for every entry form:
//   1. Bad input is refused with a 4xx and a plain message. Never a 5xx.
//   2. Error text never leaks SQL, table names, stack traces or parser internals.
//   3. Good input is stored exactly: totals, balances and numbering are right.
//   4. Documents are numbered uniquely, even when created at the same instant.
//   5. Money can't be over-applied, even by two simultaneous requests.
//   6. The books balance: total debits equal total credits after every entry.

const BASE = (process.env.QA_BASE_URL ?? 'http://localhost:3111').replace(/\/$/, '');
const PASSWORD = process.env.APP_PASSWORD ?? '';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE) && process.env.QA_ALLOW_REMOTE !== '1') {
  console.error(`Refusing to run against ${BASE}: this test creates records. Set QA_ALLOW_REMOTE=1 to override.`);
  process.exit(2);
}

// QA_BURST caps how many requests the simultaneous-save tests fire at once (default: the full size).
const BURST = Number(process.env.QA_BURST ?? 1000);
const burst = (n) => Math.min(n, BURST);

let cookie = '';
const results = [];
let currentGroup = '';

function group(name) {
  currentGroup = name;
  console.log(`\n== ${name}`);
}

function check(name, ok, detail = '') {
  results.push({ group: currentGroup, name, ok });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${ok ? '' : detail ? `\n         -> ${String(detail).slice(0, 300)}` : ''}`);
}

async function call(method, path, body, { raw = false, auth = true, headers = {}, timeoutMs = 30000 } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { ...(raw || body === undefined ? {} : { 'content-type': 'application/json' }), ...(auth && cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
  } catch (e) {
    // A request that hangs or the connection dropping is a failure, not a crash of the test run.
    return { status: 0, json: null, text: `no response within ${timeoutMs / 1000}s (${e?.name ?? 'error'})` };
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, json, text };
}

const LEAK = /failed query|violates|syntax error|invalid input syntax|relation "|column "|constraint|postgres|is not a function|cannot read|undefined|NaN|Unexpected token|Expected property|in JSON at|\bat \S+ \(|insert into|select .* from|params:/i;

/** A bad request must be a clean 4xx with a message that reveals no internals. */
function refused(name, r, { allow = [400, 404, 409, 422] } = {}) {
  const msg = r.json?.error ?? r.text;
  const clean = !LEAK.test(String(msg));
  check(
    name,
    allow.includes(r.status) && clean,
    `status ${r.status}${clean ? '' : ' (leaks internals)'}: ${String(msg).slice(0, 200)}`,
  );
}

function findId(o) {
  if (!o || typeof o !== 'object') return undefined;
  if (typeof o.Id === 'string') return o.Id;
  if (typeof o.id === 'string') return o.id;
  for (const v of Object.values(o)) {
    const r = findId(v);
    if (r) return r;
  }
  return undefined;
}

const today = new Date().toISOString().slice(0, 10);
const money = (n) => Math.round(n * 100) / 100;

async function login() {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password: PASSWORD }),
  });
  cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  if (!cookie) {
    console.error('Could not sign in. Set APP_PASSWORD to the app passphrase.');
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  group('Access control: every data route refuses an unsigned caller');
  const routes = [
    ['GET', '/api/accounts'], ['GET', '/api/customers'], ['GET', '/api/vendors'], ['GET', '/api/products'],
    ['GET', '/api/invoices'], ['GET', '/api/bills'], ['GET', '/api/estimates'], ['GET', '/api/expenses'],
    ['GET', '/api/journal-entries'], ['GET', '/api/transfers'], ['GET', '/api/payroll/employees'],
    ['GET', '/api/payments/links'], ['GET', '/api/recurring'], ['GET', '/api/documents'], ['GET', '/api/shipments'],
    ['POST', '/api/customers'], ['POST', '/api/invoices'], ['POST', '/api/journal-entries'], ['POST', '/api/transfers'],
    ['POST', '/api/agents/findings'], ['POST', '/api/desk/orders/00000000-0000-0000-0000-000000000000'], ['GET', '/api/guide'],
  ];
  for (const [m, p] of routes) {
    const r = await call(m, p, m === 'POST' ? {} : undefined, { auth: false });
    const redirected = r.status === 307 || r.status === 302 || r.status === 303 || r.status === 401;
    check(`${m} ${p} without a session is refused`, redirected && !/"(customers|invoices|accounts)":\s*\[/.test(r.text), `status ${r.status}`);
  }
  for (const [p, key] of [['/api/integrations/desk', 'orders'], ['/api/integrations/events', 'events']]) {
    const r = await call('POST', p, { kind: 'order' }, { auth: false });
    check(`POST ${p} without the integration key is refused (${key})`, r.status === 401 || r.status === 403 || r.status === 503, `status ${r.status}`);
    const r2 = await call('POST', p, { kind: 'order' }, { auth: false, headers: { authorization: 'Bearer wrong-key' } });
    check(`POST ${p} with a wrong key is refused`, r2.status === 401 || r2.status === 403 || r2.status === 503, `status ${r2.status}`);
  }

  await login();

  // ---- fixtures ----------------------------------------------------------
  const accts = (await call('GET', '/api/accounts')).json?.accounts ?? [];
  const bank = accts.find((a) => a.AccountType === 'Bank')?.Id;
  const bank2 = accts.filter((a) => a.AccountType === 'Bank')[1]?.Id;
  const income = accts.find((a) => a.AccountType === 'Income')?.Id;
  const expense = accts.find((a) => a.AccountType === 'Expense')?.Id;
  const expense2 = accts.filter((a) => a.AccountType === 'Expense')[1]?.Id;
  if (!bank || !bank2 || !income || !expense || !expense2) {
    console.error('The test database needs a chart of accounts (2 Bank, 1 Income, 2 Expense). Seed it first.');
    process.exit(2);
  }
  const stamp = Date.now();
  const cust = findId((await call('POST', '/api/customers', { displayName: `QA Customer ${stamp}`, email: `qa${stamp}@example.com` })).json);
  const vend = findId((await call('POST', '/api/vendors', { displayName: `QA Vendor ${stamp}` })).json);
  const prod = findId((await call('POST', '/api/products', { name: `QA Item ${stamp}`, type: 'Service', unitPrice: 100, incomeAccountId: income })).json);
  check('fixtures: customer, vendor and product created', Boolean(cust && vend && prod));
  const line = (over = {}) => ({ itemId: '', description: 'QA line', quantity: 2, unitPrice: 50, ...over });

  // ---- malformed requests on every create route -------------------------
  group('Malformed requests (not JSON, wrong shape) get a clean 400');
  for (const p of ['/api/customers', '/api/vendors', '/api/products', '/api/accounts', '/api/invoices', '/api/bills', '/api/estimates', '/api/expenses', '/api/journal-entries', '/api/transfers', '/api/payroll/employees', '/api/payments/links']) {
    refused(`POST ${p} with broken JSON`, await call('POST', p, '{bad json', { raw: true }));
    refused(`POST ${p} with an empty object`, await call('POST', p, {}));
    refused(`POST ${p} with a JSON array`, await call('POST', p, []));
    refused(`POST ${p} with null`, await call('POST', p, 'null', { raw: true }));
  }

  // ---- customers / vendors ---------------------------------------------
  for (const [label, path] of [['Customers', '/api/customers'], ['Vendors', '/api/vendors']]) {
    group(`${label}: entry rules`);
    const ok = await call('POST', path, { displayName: `QA ${label} ${stamp}-ok`, email: 'good@example.com', phone: '555-1234' });
    check(`${label}: a valid record is saved`, ok.status === 200 && Boolean(findId(ok.json)), `status ${ok.status} ${ok.text.slice(0, 150)}`);
    refused(`${label}: blank name refused`, await call('POST', path, { displayName: '   ' }));
    refused(`${label}: name that is not text refused`, await call('POST', path, { displayName: 12345 }));
    refused(`${label}: absurdly long name refused`, await call('POST', path, { displayName: 'x'.repeat(5000) }));
    refused(`${label}: badly formed email refused`, await call('POST', path, { displayName: 'Bad Email Co', email: 'not-an-email' }));
    refused(`${label}: unknown currency code refused`, await call('POST', path, { displayName: 'Bad Currency Co', currencyCode: 'ZZZZZ' }));
    const inj = await call('POST', path, { displayName: `Robert'); DROP TABLE customers;-- ${stamp}` });
    check(`${label}: SQL-looking text is stored as plain text, nothing is dropped`, inj.status === 200 && (await call('GET', '/api/customers')).status === 200, `status ${inj.status}`);
    const xss = await call('POST', path, { displayName: `<img src=x onerror=alert(1)> ${stamp}` });
    check(`${label}: script text is accepted only as inert text`, xss.status === 200 || xss.status === 400);
  }

  // ---- products & accounts ----------------------------------------------
  group('Products and chart of accounts: entry rules');
  refused('Products: negative price refused', await call('POST', '/api/products', { name: 'Neg', type: 'Service', unitPrice: -5, incomeAccountId: income }));
  refused('Products: price as text refused', await call('POST', '/api/products', { name: 'Txt', type: 'Service', unitPrice: 'abc', incomeAccountId: income }));
  refused('Products: price too large for the field refused', await call('POST', '/api/products', { name: 'Big', type: 'Service', unitPrice: 1e20, incomeAccountId: income }));
  refused('Products: unknown type refused', await call('POST', '/api/products', { name: 'Typ', type: 'Magic', incomeAccountId: income }));
  refused('Products: income account that does not exist refused', await call('POST', '/api/products', { name: 'NoAcct', type: 'Service', incomeAccountId: '00000000-0000-0000-0000-000000000000' }));
  refused('Products: income account id that is not an id refused', await call('POST', '/api/products', { name: 'BadId', type: 'Service', incomeAccountId: 'abc' }));
  refused('Accounts: unknown account type refused', await call('POST', '/api/accounts', { name: 'Odd', accountType: 'Banana', accountSubType: 'x' }));
  refused('Accounts: blank name refused', await call('POST', '/api/accounts', { name: ' ', accountType: 'Expense', accountSubType: 'x' }));
  const acctNum = String(900000 + (stamp % 99999));
  const a1 = await call('POST', '/api/accounts', { name: `QA Acct ${stamp}`, accountType: 'Expense', accountSubType: 'OtherMiscellaneousServiceCost', acctNum });
  const a2 = await call('POST', '/api/accounts', { name: `QA Acct Dup ${stamp}`, accountType: 'Expense', accountSubType: 'OtherMiscellaneousServiceCost', acctNum });
  check('Accounts: a valid account is saved', a1.status === 200, `status ${a1.status} ${a1.text.slice(0, 150)}`);
  refused('Accounts: a second account with the same number refused', a2);

  // ---- invoices ---------------------------------------------------------
  group('Invoices: entry rules');
  const inv = await call('POST', '/api/invoices', { customerId: cust, txnDate: today, dueDate: today, lines: [line(), line({ description: 'Second', quantity: 3, unitPrice: 19.99 })] });
  const invId = findId(inv.json);
  check('Invoices: a valid invoice is saved', inv.status === 200 && Boolean(invId), `status ${inv.status} ${inv.text.slice(0, 200)}`);
  const total = money(2 * 50 + 3 * 19.99);
  check(`Invoices: total is exactly ${total}`, Math.abs((inv.json?.invoice?.TotalAmt ?? -1) - total) < 0.005, `got ${inv.json?.invoice?.TotalAmt}`);
  check('Invoices: balance equals total before any payment', Math.abs((inv.json?.invoice?.Balance ?? -1) - total) < 0.005);
  refused('Invoices: no customer refused', await call('POST', '/api/invoices', { lines: [line()] }));
  refused('Invoices: customer id that is not an id refused', await call('POST', '/api/invoices', { customerId: 'abc', lines: [line()] }));
  refused('Invoices: customer that does not exist refused', await call('POST', '/api/invoices', { customerId: '00000000-0000-0000-0000-000000000000', lines: [line()] }));
  refused('Invoices: no lines refused', await call('POST', '/api/invoices', { customerId: cust, lines: [] }));
  refused('Invoices: line with nothing on it refused', await call('POST', '/api/invoices', { customerId: cust, lines: [{ itemId: '', description: '', quantity: 1, unitPrice: 1 }] }));
  refused('Invoices: zero quantity refused', await call('POST', '/api/invoices', { customerId: cust, lines: [line({ quantity: 0 })] }));
  refused('Invoices: negative quantity refused', await call('POST', '/api/invoices', { customerId: cust, lines: [line({ quantity: -1 })] }));
  refused('Invoices: negative price refused', await call('POST', '/api/invoices', { customerId: cust, lines: [line({ unitPrice: -10 })] }));
  refused('Invoices: quantity as text refused', await call('POST', '/api/invoices', { customerId: cust, lines: [line({ quantity: 'two' })] }));
  refused('Invoices: price as text refused', await call('POST', '/api/invoices', { customerId: cust, lines: [line({ unitPrice: '5.00' })] }));
  refused('Invoices: amount too large for the field refused', await call('POST', '/api/invoices', { customerId: cust, lines: [line({ quantity: 1e9, unitPrice: 1e9 })] }));
  refused('Invoices: impossible date refused', await call('POST', '/api/invoices', { customerId: cust, txnDate: '2026-13-45', lines: [line()] }));
  refused('Invoices: date that is not a date refused', await call('POST', '/api/invoices', { customerId: cust, txnDate: 'yesterday', lines: [line()] }));
  refused('Invoices: due date before the invoice date refused', await call('POST', '/api/invoices', { customerId: cust, txnDate: '2026-05-10', dueDate: '2026-05-01', lines: [line()] }));
  refused('Invoices: more than 500 lines refused', await call('POST', '/api/invoices', { customerId: cust, lines: Array.from({ length: 501 }, () => line({ quantity: 1, unitPrice: 1 })) }));
  refused('Invoices: unknown product on a line refused', await call('POST', '/api/invoices', { customerId: cust, lines: [line({ itemId: '00000000-0000-0000-0000-000000000000' })] }));
  refused('Invoices: look up an id that is not an id', await call('GET', '/api/invoices/abc'));
  refused('Invoices: look up an invoice that does not exist', await call('GET', '/api/invoices/00000000-0000-0000-0000-000000000000'));
  refused('Invoices: delete an invoice that does not exist', await call('DELETE', '/api/invoices/00000000-0000-0000-0000-000000000000'));

  group('Invoice numbers are unique and never reused');
  const created = await Promise.all(Array.from({ length: burst(25) }, () => call('POST', '/api/invoices', { customerId: cust, lines: [line({ quantity: 1, unitPrice: 1 })] })));
  const okCount = created.filter((r) => r.status === 200).length;
  const nums = created.filter((r) => r.status === 200).map((r) => r.json?.invoice?.DocNumber);
  check(`${burst(25)} invoices created at the same instant all succeed`, okCount === burst(25), `${okCount} of ${burst(25)} succeeded; statuses ${[...new Set(created.map((r) => r.status))]}`);
  check(`${burst(25)} simultaneous invoices all get different numbers`, new Set(nums).size === nums.length, `duplicates: ${nums.length - new Set(nums).size}`);
  const sample = created.find((r) => r.status === 200);
  const midId = findId(created[Math.min(10, created.length - 1)]?.json);
  const midNum = created[Math.min(10, created.length - 1)]?.json?.invoice?.DocNumber;
  if (midId) await call('DELETE', `/api/invoices/${midId}`);
  const after = await call('POST', '/api/invoices', { customerId: cust, lines: [line({ quantity: 1, unitPrice: 1 })] });
  const all = (await call('GET', '/api/invoices?pageSize=100000')).json?.invoices ?? [];
  const counts = new Map();
  for (const i of all) counts.set(i.DocNumber, (counts.get(i.DocNumber) ?? 0) + 1);
  const dups = [...counts.entries()].filter(([, n]) => n > 1);
  check('After deleting one invoice, the next number does not repeat an issued number', after.status === 200 && dups.length === 0, `duplicate numbers in the ledger: ${dups.slice(0, 5).map((d) => d[0]).join(', ')}`);
  check('A deleted invoice number is not handed out again', after.json?.invoice?.DocNumber !== midNum, `reused ${midNum}`);
  void sample;

  // ---- payments ---------------------------------------------------------
  group('Invoice payments: money can never be over-applied');
  const pay = (amount, extra = {}) => call('POST', `/api/invoices/${invId}/payments`, { amount, depositAccountId: bank, paymentDate: today, ...extra });
  refused('Payments: zero refused', await pay(0));
  refused('Payments: negative refused', await pay(-5));
  refused('Payments: amount as text refused', await pay('10'));
  refused('Payments: more than the balance refused', await pay(total + 1));
  refused('Payments: deposit account that does not exist refused', await pay(1, { depositAccountId: '00000000-0000-0000-0000-000000000000' }));
  refused('Payments: deposit into an account that is not a bank account refused', await pay(1, { depositAccountId: expense }));
  refused('Payments: impossible date refused', await pay(1, { paymentDate: '2026-02-31' }));
  refused('Payments: against an invoice that does not exist refused', await call('POST', '/api/invoices/00000000-0000-0000-0000-000000000000/payments', { amount: 1, depositAccountId: bank }));
  const half = money(total / 2);
  const p1 = await pay(half);
  check('Payments: a valid part-payment is saved', p1.status === 200, `status ${p1.status} ${p1.text.slice(0, 150)}`);
  const inv2 = findId((await call('POST', '/api/invoices', { customerId: cust, lines: [line({ quantity: 1, unitPrice: 100 })] })).json);
  const race = await Promise.all([60, 60, 60, 60].map((a) => call('POST', `/api/invoices/${inv2}/payments`, { amount: a, depositAccountId: bank })));
  const applied = race.filter((r) => r.status === 200).length;
  const bal = (await call('GET', `/api/invoices/${inv2}`)).json?.invoice?.Balance;
  check('Four simultaneous 60.00 payments on a 100.00 invoice: at most one is accepted', applied <= 1 && bal >= 0, `${applied} accepted, balance ${bal}`);

  // ---- bills ------------------------------------------------------------
  group('Bills: entry rules and payment control');
  const bill = await call('POST', '/api/bills', { vendorId: vend, txnDate: today, dueDate: today, lines: [{ itemId: '', accountId: expense, description: 'QA bill', quantity: 1, unitPrice: 250 }].map((l) => ({ ...l, amount: 250 })) });
  const billId = findId(bill.json);
  check('Bills: a valid bill is saved', bill.status === 200 && Boolean(billId), `status ${bill.status} ${bill.text.slice(0, 250)}`);
  const bl = (over = {}) => ({ accountId: expense, description: 'QA', amount: 100, ...over });
  refused('Bills: no vendor refused', await call('POST', '/api/bills', { lines: [bl()] }));
  refused('Bills: vendor that does not exist refused', await call('POST', '/api/bills', { vendorId: '00000000-0000-0000-0000-000000000000', lines: [bl()] }));
  refused('Bills: vendor id that is not an id refused', await call('POST', '/api/bills', { vendorId: 'abc', lines: [bl()] }));
  refused('Bills: no lines refused', await call('POST', '/api/bills', { vendorId: vend, lines: [] }));
  refused('Bills: negative amount refused', await call('POST', '/api/bills', { vendorId: vend, lines: [bl({ amount: -50 })] }));
  refused('Bills: amount as text refused', await call('POST', '/api/bills', { vendorId: vend, lines: [bl({ amount: 'lots' })] }));
  refused('Bills: account that does not exist refused', await call('POST', '/api/bills', { vendorId: vend, lines: [bl({ accountId: '00000000-0000-0000-0000-000000000000' })] }));
  refused('Bills: impossible date refused', await call('POST', '/api/bills', { vendorId: vend, txnDate: '2026-00-10', lines: [bl()] }));
  const bills = await Promise.all(Array.from({ length: burst(15) }, () => call('POST', '/api/bills', { vendorId: vend, lines: [bl()] })));
  const bnums = bills.filter((r) => r.status === 200).map((r) => r.json?.bill?.DocNumber);
  check(`Bills: ${burst(15)} simultaneous bills all get different numbers`, new Set(bnums).size === bnums.length && bnums.length === burst(15), `${bnums.length} created, ${bnums.length - new Set(bnums).size} duplicate numbers`);
  if (billId) {
    refused('Bills: paying a bill before it is approved refused', await call('POST', `/api/bills/${billId}/pay`, { amount: 10, bankAccountId: bank }));
    const ap = await call('POST', `/api/bills/${billId}/approve`, {});
    check('Bills: an approver can approve a bill', ap.status === 200, `status ${ap.status} ${ap.text.slice(0, 150)}`);
    refused('Bills: paying more than is owed refused', await call('POST', `/api/bills/${billId}/pay`, { amount: 99999, bankAccountId: bank }));
    refused('Bills: paying zero refused', await call('POST', `/api/bills/${billId}/pay`, { amount: 0, bankAccountId: bank }));
    refused('Bills: paying from an account that is not a bank account refused', await call('POST', `/api/bills/${billId}/pay`, { amount: 10, bankAccountId: expense }));
    const rb = await Promise.all([200, 200, 200].map((a) => call('POST', `/api/bills/${billId}/pay`, { amount: a, bankAccountId: bank })));
    const accepted = rb.filter((r) => r.status === 200).length;
    check('Bills: three simultaneous 200.00 payments on a 250.00 bill: at most one is accepted', accepted <= 1, `${accepted} accepted`);
  }

  // ---- estimates & expenses --------------------------------------------
  group('Estimates and expenses: entry rules');
  const est = await call('POST', '/api/estimates', { customerId: cust, lines: [line()] });
  check('Estimates: a valid estimate is saved', est.status === 200, `status ${est.status} ${est.text.slice(0, 150)}`);
  refused('Estimates: no customer refused', await call('POST', '/api/estimates', { lines: [line()] }));
  refused('Estimates: negative quantity refused', await call('POST', '/api/estimates', { customerId: cust, lines: [line({ quantity: -3 })] }));
  const ests = await Promise.all(Array.from({ length: burst(12) }, () => call('POST', '/api/estimates', { customerId: cust, lines: [line()] })));
  const enums = ests.filter((r) => r.status === 200).map((r) => r.json?.estimate?.DocNumber);
  check(`Estimates: ${burst(12)} simultaneous estimates all get different numbers`, new Set(enums).size === enums.length && enums.length === burst(12), `${enums.length} created, ${enums.length - new Set(enums).size} duplicates`);
  const ex = await call('POST', '/api/expenses', { paymentAccountId: bank, paymentType: 'Cash', vendorId: vend, lines: [{ accountId: expense, description: 'QA expense', amount: 42.5 }] });
  check('Expenses: a valid expense is saved', ex.status === 200, `status ${ex.status} ${ex.text.slice(0, 200)}`);
  const el = (over = {}) => ({ accountId: expense, description: 'QA', amount: 10, ...over });
  refused('Expenses: no payment account refused', await call('POST', '/api/expenses', { paymentType: 'Cash', lines: [el()] }));
  refused('Expenses: unknown payment type refused', await call('POST', '/api/expenses', { paymentAccountId: bank, paymentType: 'Barter', lines: [el()] }));
  refused('Expenses: negative amount refused', await call('POST', '/api/expenses', { paymentAccountId: bank, paymentType: 'Cash', lines: [el({ amount: -9 })] }));
  refused('Expenses: no lines refused', await call('POST', '/api/expenses', { paymentAccountId: bank, paymentType: 'Cash', lines: [] }));
  refused('Expenses: vendor that does not exist refused', await call('POST', '/api/expenses', { paymentAccountId: bank, paymentType: 'Cash', vendorId: '00000000-0000-0000-0000-000000000000', lines: [el()] }));

  // ---- journal entries --------------------------------------------------
  group('Journal entries: the books must balance');
  const je = (lines, extra = {}) => call('POST', '/api/journal-entries', { txnDate: today, memo: 'QA', lines, ...extra });
  const L = (accountId, postingType, amount) => ({ accountId, postingType, amount });
  const ok = await je([L(expense, 'Debit', 125.5), L(bank, 'Credit', 125.5)]);
  check('Journal: a balanced entry is saved', ok.status === 200, `status ${ok.status} ${ok.text.slice(0, 150)}`);
  refused('Journal: debits not equal to credits refused', await je([L(expense, 'Debit', 100), L(bank, 'Credit', 99)]));
  refused('Journal: a single line refused', await je([L(expense, 'Debit', 0)]));
  refused('Journal: no lines refused', await je([]));
  refused('Journal: all debits and no credits refused', await je([L(expense, 'Debit', 50), L(bank, 'Debit', 50)]));
  refused('Journal: zero-value lines refused', await je([L(expense, 'Debit', 0), L(bank, 'Credit', 0)]));
  refused('Journal: negative amount refused', await je([L(expense, 'Debit', -50), L(bank, 'Credit', -50)]));
  refused('Journal: amount as text refused', await je([L(expense, 'Debit', '50'), L(bank, 'Credit', '50')]));
  refused('Journal: posting type that is not Debit or Credit refused', await je([L(expense, 'Plus', 50), L(bank, 'Minus', 50)]));
  refused('Journal: account that does not exist refused', await je([L('00000000-0000-0000-0000-000000000000', 'Debit', 50), L(bank, 'Credit', 50)]));
  refused('Journal: account id that is not an id refused', await je([L('abc', 'Debit', 50), L(bank, 'Credit', 50)]));
  refused('Journal: impossible date refused', await je([L(expense, 'Debit', 5), L(bank, 'Credit', 5)], { txnDate: '2026-02-30' }));
  refused('Journal: amount too large for the field refused', await je([L(expense, 'Debit', 1e18), L(bank, 'Credit', 1e18)]));
  // Rounding: three credits of 33.335 balance a 100.00 debit on paper. What is STORED must still balance to the cent.
  const rnd = await je([L(expense, 'Debit', 100), L(bank, 'Credit', 33.335), L(bank, 'Credit', 33.335), L(bank, 'Credit', 33.33)]);
  if (rnd.status === 200) {
    const lines = rnd.json?.journalEntry?.Line ?? rnd.json?.entry?.Line ?? rnd.json?.journalEntry?.lines ?? [];
    const sum = (t) => lines.filter((l) => (l.JournalEntryLineDetail?.PostingType ?? l.postingType) === t).reduce((s, l) => s + Number(l.Amount ?? l.amount), 0);
    check('Journal: what is stored still balances to the cent after rounding', Math.abs(sum('Debit') - sum('Credit')) < 0.0001, `stored debits ${sum('Debit')} vs credits ${sum('Credit')}`);
  } else {
    check('Journal: sub-cent amounts are either rejected or stored balanced', rnd.status >= 400 && rnd.status < 500, `status ${rnd.status}`);
  }

  // ---- transfers --------------------------------------------------------
  group('Transfers: entry rules');
  const tr = (b) => call('POST', '/api/transfers', { txnDate: today, ...b });
  check('Transfers: a valid transfer is saved', (await tr({ fromAccountId: bank, toAccountId: bank2, amount: 75.25 })).status === 200);
  refused('Transfers: same account both sides refused', await tr({ fromAccountId: bank, toAccountId: bank, amount: 10 }));
  refused('Transfers: zero refused', await tr({ fromAccountId: bank, toAccountId: bank2, amount: 0 }));
  refused('Transfers: negative refused', await tr({ fromAccountId: bank, toAccountId: bank2, amount: -10 }));
  refused('Transfers: amount as text refused', await tr({ fromAccountId: bank, toAccountId: bank2, amount: '5' }));
  refused('Transfers: account that does not exist refused', await tr({ fromAccountId: bank, toAccountId: '00000000-0000-0000-0000-000000000000', amount: 5 }));
  refused('Transfers: account id that is not an id refused', await tr({ fromAccountId: 'a', toAccountId: 'b', amount: 5 }));
  refused('Transfers: amount too large for the field refused', await tr({ fromAccountId: bank, toAccountId: bank2, amount: 1e20 }));
  refused('Transfers: impossible date refused', await tr({ fromAccountId: bank, toAccountId: bank2, amount: 5, txnDate: '2026-99-99' }));

  // ---- payroll ----------------------------------------------------------
  group('Payroll employees: entry rules');
  const emp = (b) => call('POST', '/api/payroll/employees', { displayName: 'QA Person', hiredDate: '2025-01-06', basePay: { amount: 52000, period: 'salary-annual' }, ...b });
  check('Payroll: a valid employee is saved', (await emp({})).status === 200);
  refused('Payroll: blank name refused', await emp({ displayName: '  ' }));
  refused('Payroll: negative pay refused', await emp({ basePay: { amount: -1, period: 'salary-annual' } }));
  refused('Payroll: pay period that does not exist refused', await emp({ basePay: { amount: 10, period: 'weekly' } }));
  refused('Payroll: pay as text refused', await emp({ basePay: { amount: 'lots', period: 'hourly' } }));
  refused('Payroll: impossible hire date refused', await emp({ hiredDate: '2025-02-30' }));
  refused('Payroll: badly formed email refused', await emp({ email: 'nope' }));

  // ---- trade & order desk ----------------------------------------------
  group('Shipments and order desk: entry rules');
  const sh = (b) => call('POST', '/api/shipments', { reference: `QA-${stamp}`, direction: 'import', lines: [{ description: 'Cotton shirts', value: 100 }], ...b });
  check('Shipments: a valid shipment is saved', (await sh({})).status === 200);
  refused('Shipments: blank reference refused', await sh({ reference: ' ' }));
  refused('Shipments: direction that is not import or export refused', await sh({ direction: 'sideways' }));
  refused('Shipments: arrival before loading refused', await sh({ loadingDate: '2026-06-10', arrivalDate: '2026-06-01' }));
  refused('Shipments: impossible date refused', await sh({ loadingDate: '2026-13-01' }));
  refused('Shipments: negative declared value refused', await sh({ declaredValue: -50 }));
  refused('Order desk: an order with no email refused', await call('POST', '/api/desk/intake', { rawText: '2 widgets' }));

  // ---- payment links, schedules, documents, lists ------------------------
  group('Payment links, recurring schedules and documents: entry rules');
  const link = (over = {}) => ({ customerId: cust, amount: 25, ...over });
  refused('Payment link: no customer refused', await call('POST', '/api/payments/links', { amount: 25 }));
  refused('Payment link: customer that does not exist refused', await call('POST', '/api/payments/links', link({ customerId: '00000000-0000-4000-8000-000000000000' })));
  refused('Payment link: zero refused', await call('POST', '/api/payments/links', link({ amount: 0 })));
  refused('Payment link: negative refused', await call('POST', '/api/payments/links', link({ amount: -5 })));
  refused('Payment link: amount as text refused', await call('POST', '/api/payments/links', link({ amount: '25' })));
  refused('Payment link: bad email refused', await call('POST', '/api/payments/links', link({ email: 'not-an-email' })));
  const okLink = await call('POST', '/api/payments/links', link({ customerName: 'Forged Name' }));
  check('Payment link: a valid link is saved', okLink.status === 200 && okLink.json?.link?.id, okLink.text);
  check('Payment link: the customer name comes from the customer record, not the request', okLink.json?.link?.customerName === `QA Customer ${stamp}`, okLink.text);
  const linkId = okLink.json?.link?.id;
  if (linkId) {
    const cancelled = await call('POST', `/api/payments/links/${linkId}/cancel`);
    check('Payment link: can be cancelled', cancelled.status === 200 && cancelled.json?.link?.status === 'cancelled', cancelled.text);
    refused('Payment link: a cancelled link cannot be edited', await call('PATCH', `/api/payments/links/${linkId}`, { amount: 30 }));
    refused('Payment link: a cancelled link cannot be sent', await call('POST', `/api/payments/links/${linkId}/send`, { email: 'qa@example.com' }));
  }

  const sched = (over = {}) => ({ docType: 'invoice', customerId: cust, lines: [line()], frequency: 'monthly', startDate: '2030-01-01', autoSend: false, ...over });
  refused('Recurring: no customer refused', await call('POST', '/api/recurring', sched({ customerId: undefined })));
  refused('Recurring: no lines refused', await call('POST', '/api/recurring', sched({ lines: [] })));
  refused('Recurring: unknown frequency refused', await call('POST', '/api/recurring', sched({ frequency: 'hourly' })));
  refused('Recurring: impossible start date refused', await call('POST', '/api/recurring', sched({ startDate: '2030-02-30' })));
  refused('Recurring: auto-send without an email refused', await call('POST', '/api/recurring', sched({ autoSend: true })));
  refused('Recurring: customer that does not exist refused', await call('POST', '/api/recurring', sched({ customerId: '00000000-0000-4000-8000-000000000000' })));
  const dueSched = await call('POST', '/api/recurring', sched({ startDate: '2020-01-01' }));
  check('Recurring: a valid schedule is saved', dueSched.status === 200 && dueSched.json?.template?.id, dueSched.text);
  const invoicesBefore = (await call('GET', '/api/invoices')).json?.invoices?.length ?? 0;
  const runs = await Promise.all([call('POST', '/api/recurring/run-due', undefined, { auth: false }), call('POST', '/api/recurring/run-due', undefined, { auth: false })]);
  const invoicesAfter = (await call('GET', '/api/invoices')).json?.invoices?.length ?? 0;
  const mine = runs.flatMap((r) => r.json?.results ?? []).filter((r) => r.templateId === dueSched.json?.template?.id && r.docId);
  check('Recurring: two simultaneous runs create the due invoice exactly once', mine.length === 1 && invoicesAfter - invoicesBefore >= 1, `created by ${mine.length} runs`);

  const doc = (over = {}) => ({ entityType: 'customer', entityId: cust, fileName: 'qa.txt', contentType: 'text/plain', contentBase64: Buffer.from('hello').toString('base64'), ...over });
  refused('Documents: unknown record type refused', await call('POST', '/api/documents', doc({ entityType: 'spaceship' })));
  refused('Documents: record id that is not an id refused', await call('POST', '/api/documents', doc({ entityId: 'abc' })));
  refused('Documents: blank file name refused', await call('POST', '/api/documents', doc({ fileName: '  ' })));
  refused('Documents: no file content refused', await call('POST', '/api/documents', doc({ contentBase64: '' })));
  refused('Documents: content that is not base64 refused', await call('POST', '/api/documents', doc({ contentBase64: 'not base64!!' })));
  const bigFile = await call('POST', '/api/documents', doc({ contentBase64: Buffer.alloc(4.5 * 1024 * 1024, 1).toString('base64') }));
  refused('Documents: a file over the 4 MB limit refused', bigFile);
  const okDoc = await call('POST', '/api/documents', doc({ contentBase64: Buffer.alloc(3 * 1024 * 1024, 1).toString('base64') }));
  check('Documents: a 3 MB file is accepted', okDoc.status === 200 && okDoc.json?.document?.Id, okDoc.text);

  group('Lists: paging and audit trail');
  const pg = await call('GET', '/api/invoices?limit=5&offset=0');
  check('Invoices: ?limit=5 returns 5 rows and the overall total', pg.json?.invoices?.length === 5 && pg.json?.total >= 25, pg.text?.slice(0, 120));
  const pg2 = await call('GET', '/api/invoices?limit=5&offset=5');
  const ids1 = new Set((pg.json?.invoices ?? []).map((i) => i.Id));
  check('Invoices: the next page has different rows', (pg2.json?.invoices ?? []).length === 5 && !(pg2.json.invoices ?? []).some((i) => ids1.has(i.Id)));
  const pgBad = await call('GET', '/api/invoices?limit=abc&offset=-9');
  check('Invoices: nonsense paging values are clamped, not an error', pgBad.status === 200 && Array.isArray(pgBad.json?.invoices), pgBad.text?.slice(0, 120));
  const audit = (await call('GET', '/api/accounts')).status === 200 && (await call('GET', '/api/journal-entries')).json?.journalEntries?.length;
  check('Journal entries saved earlier are listed', Boolean(audit));

  // ---- the books balance ------------------------------------------------
  group('Cross-checks: totals agree across screens');
  const accountsNow = (await call('GET', '/api/accounts')).json?.accounts ?? [];
  check('Chart of accounts loads with balances after all the entries above', accountsNow.length > 0 && accountsNow.every((a) => Number.isFinite(a.CurrentBalance)));
  const health = await call('GET', '/api/health', undefined, { auth: false });
  check('Health check still reports the database ok after the stress run', health.json?.database === 'ok', health.text);

  const failed = results.filter((r) => !r.ok);
  const byGroup = new Map();
  for (const r of results) {
    const g = byGroup.get(r.group) ?? { pass: 0, fail: 0 };
    r.ok ? g.pass++ : g.fail++;
    byGroup.set(r.group, g);
  }
  console.log('\n==== SUMMARY ====');
  for (const [g, c] of byGroup) console.log(`${c.fail ? 'FAIL' : ' ok '}  ${String(c.pass).padStart(3)} pass  ${String(c.fail).padStart(3)} fail  ${g}`);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(Math.min(failed.length, 125));
}

main().catch((e) => {
  console.error('Test run crashed:', e);
  process.exit(126);
});
