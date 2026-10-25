// Tests for US payroll tax rules and pay calculation. Run: npx tsx scripts/qa/payroll.test.ts
// Expected values were worked by hand from the 2026 IRS Publication 15-T (Worksheet 1A and the Annual Percentage
// Method tables) and Publication 15. Each comment shows the arithmetic.
import assert from 'node:assert/strict';
import {
  PERIODS_PER_YEAR, computeItem, federalWithholding, periodPay, splitOvertime, type ItemInput, type W4,
} from '../../src/lib/payroll/taxes';

const w4 = (over: Partial<W4> = {}): W4 => ({ filingStatus: 'single', step2Checked: false, credits: 0, otherIncome: 0, deductions: 0, extraWithholding: 0, exempt: false, ...over });
const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 0.005, `${msg ?? ''} got ${a}, expected ${b}`);

assert.deepEqual(PERIODS_PER_YEAR, { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 });

// Worksheet 1A, single, biweekly, $2,000: 52,000 - 8,600 = 43,400; row $19,900: 1,240 + 12% x 23,500 = 4,060; / 26
near(federalWithholding(2000, 'biweekly', w4()), 156.15, 'single');
// married filing jointly: 52,000 - 12,900 = 39,100; row $19,300: 0 + 10% x 19,800 = 1,980; / 26
near(federalWithholding(2000, 'biweekly', w4({ filingStatus: 'married' })), 76.15, 'married');
// head of household: 43,400; row $33,250: 1,770 + 12% x 10,150 = 2,988; / 26
near(federalWithholding(2000, 'biweekly', w4({ filingStatus: 'head' })), 114.92, 'head of household');
// Step 2 box checked, single: 52,000 (no standard deduction); row $33,250: 2,900 + 22% x 18,750 = 7,025; / 26
near(federalWithholding(2000, 'biweekly', w4({ step2Checked: true })), 270.19, 'step 2 checked');
// Step 3 credits of 2,000 a year: 156.1538 - 2,000/26 = 79.23
near(federalWithholding(2000, 'biweekly', w4({ credits: 2000 })), 79.23, 'credits');
// Step 4(c) extra 10 each period
near(federalWithholding(2000, 'biweekly', w4({ extraWithholding: 10 })), 166.15, 'extra');
// Step 4(a) other income 5,200: 57,200 - 8,600 = 48,600; 1,240 + 12% x 28,700 = 4,684; / 26
near(federalWithholding(2000, 'biweekly', w4({ otherIncome: 5200 })), 180.15, 'other income');
// Step 4(b) deductions 4,000: 52,000 - (4,000 + 8,600) = 39,400; 1,240 + 12% x 19,500 = 3,580; / 26
near(federalWithholding(2000, 'biweekly', w4({ deductions: 4000 })), 137.69, 'deductions');
// low pay: weekly 300 -> 15,600 - 8,600 = 7,000, under the first bracket
assert.equal(federalWithholding(300, 'weekly', w4()), 0);
// credits never push withholding below zero; exempt withholds nothing
assert.equal(federalWithholding(2000, 'biweekly', w4({ credits: 50_000 })), 0);
assert.equal(federalWithholding(2000, 'biweekly', w4({ exempt: true })), 0);
// top bracket, monthly 50,000: 600,000 - 8,600 = 591,400; row $263,725: 58,448 + 35% x 327,675 = 173,134.25; / 12 = 14,427.854
near(federalWithholding(50_000, 'monthly', w4()), 14_427.85, 'high pay');
// weekly and monthly use their own number of pay periods: 2,000/month = 24,000 - 8,600 = 15,400; 10% x 7,900 = 790; / 12
near(federalWithholding(2000, 'monthly', w4()), 65.83, 'monthly');
// bracket edges: exactly $7,500 adjusted pays nothing, one dollar more pays 10 cents
near(federalWithholding((7_500 + 8_600) / 26, 'biweekly', w4()), 0);
near(federalWithholding((7_501 + 8_600) / 26, 'biweekly', w4()), 0.1 / 26);

const base = (over: Partial<ItemInput> = {}): ItemInput => ({
  gross: 2000, pretaxBenefits: 0, pretaxRetirement: 0, afterTax: 0, frequency: 'biweekly', w4: w4(), statePercent: 0, stateFixed: 0,
  ytd: { fica: 0, futa: 0, suta: 0 }, sutaRate: 0, sutaWageBase: 0, ...over,
});

// a plain paycheck: 2,000 - 156.15 federal - 124.00 Social Security (6.2%) - 29.00 Medicare (1.45%) = 1,690.85
let r = computeItem(base());
near(r.federal, 156.15); near(r.socialSecurity, 124); near(r.medicare, 29); near(r.net, 1690.85);
near(r.employerSocialSecurity, 124); near(r.employerMedicare, 29);
near(r.futa, 12, 'FUTA 0.6% of 2,000'); assert.equal(r.suta, 0);
// money in = money out: pay plus everything withheld equals gross
near(r.net + r.federal + r.socialSecurity + r.medicare + r.additionalMedicare + r.state + r.afterTax + r.pretaxBenefits + r.pretaxRetirement, r.gross);

// pre-tax benefits (125) and 401(k): 1,900 FICA wages, 1,700 income tax wages
r = computeItem(base({ pretaxBenefits: 100, pretaxRetirement: 200 }));
near(r.ficaWages, 1900); near(r.incomeTaxWages, 1700);
// 1,700 x 26 = 44,200 - 8,600 = 35,600; 1,240 + 12% x 15,700 = 3,124; / 26 = 120.15
near(r.federal, 120.15); near(r.socialSecurity, 117.8); near(r.medicare, 27.55);
near(r.net, 1434.5);
// a 401(k) deferral lowers income tax but not Social Security or Medicare
const k = computeItem(base({ pretaxRetirement: 200 }));
near(k.socialSecurity, 124); near(k.medicare, 29);

// Social Security stops at the $184,500 wage base
r = computeItem(base({ ytd: { fica: 183_000, futa: 7000, suta: 0 } })); // 1,500 of room: 93.00
near(r.socialSecurity, 93); near(r.employerSocialSecurity, 93); near(r.medicare, 29);
r = computeItem(base({ ytd: { fica: 184_500, futa: 7000, suta: 0 } }));
assert.equal(r.socialSecurity, 0); near(r.medicare, 29, 'Medicare has no limit');

// Additional Medicare Tax: 0.9% only on wages over $200,000, employee only
r = computeItem(base({ ytd: { fica: 199_000, futa: 7000, suta: 0 } })); // 1,000 over: 9.00
near(r.additionalMedicare, 9);
r = computeItem(base({ ytd: { fica: 250_000, futa: 7000, suta: 0 } })); // all 2,000 over: 18.00
near(r.additionalMedicare, 18);
r = computeItem(base({ ytd: { fica: 150_000, futa: 7000, suta: 0 } }));
assert.equal(r.additionalMedicare, 0);

// FUTA 0.6% on the first $7,000 a year only
r = computeItem(base({ ytd: { fica: 6_800, futa: 6_800, suta: 0 } })); // 200 of room: 1.20
near(r.futa, 1.2);
r = computeItem(base({ ytd: { fica: 7_000, futa: 7_000, suta: 0 } }));
assert.equal(r.futa, 0);

// state unemployment: rate times wages up to the state's wage base; state income tax from a percent and a fixed amount
r = computeItem(base({ sutaRate: 2.7, sutaWageBase: 9000 }));
near(r.suta, 54); // 2.7% of 2,000
r = computeItem(base({ sutaRate: 2.7, sutaWageBase: 9000, ytd: { fica: 8_000, futa: 7000, suta: 8_000 } }));
near(r.suta, 27); // only 1,000 of room
r = computeItem(base({ statePercent: 4.5, stateFixed: 5 }));
near(r.state, 95); // 4.5% of 2,000 + 5
near(r.net, 2000 - 156.15 - 124 - 29 - 95);
// after-tax deductions only touch net pay
r = computeItem(base({ afterTax: 75 }));
near(r.federal, 156.15); near(r.net, 1690.85 - 75);
// no pay, no tax
r = computeItem(base({ gross: 0 }));
assert.equal(r.net, 0); assert.equal(r.federal, 0);

// overtime: hours over 40 in a Monday to Sunday week, counted day by day
const week1 = new Map<string, number>([['2026-10-19', 9], ['2026-10-20', 9], ['2026-10-21', 9], ['2026-10-22', 9], ['2026-10-23', 9]]);
assert.deepEqual(splitOvertime(week1, '2026-10-19', '2026-10-25'), { regular: 40, overtime: 5 });
// a pay period that starts mid week: Mon 10 Tue 10 (before), Wed 10 Thu 10 Fri 8 (in period), next Monday 8
const split = new Map<string, number>([['2026-10-19', 10], ['2026-10-20', 10], ['2026-10-21', 10], ['2026-10-22', 10], ['2026-10-23', 8], ['2026-10-26', 8]]);
assert.deepEqual(splitOvertime(split, '2026-10-21', '2026-10-27'), { regular: 28, overtime: 8 }, 'Wed 10 + Thu 10 + next Monday 8 regular; Friday 8 overtime');
assert.deepEqual(splitOvertime(split, '2026-10-14', '2026-10-20'), { regular: 20, overtime: 0 }, 'the days before the overtime started');
assert.deepEqual(splitOvertime(new Map(), '2026-10-19', '2026-10-25'), { regular: 0, overtime: 0 });

// pay: hourly 20 x 40 + 5 overtime hours at 30 = 950; salary 52,000 biweekly = 2,000
assert.deepEqual(periodPay({ kind: 'hourly', rate: 20, regularHours: 40, overtimeHours: 5, frequency: 'biweekly', extra: 0 }), { regularPay: 800, overtimePay: 150, extra: 0, gross: 950 });
assert.deepEqual(periodPay({ kind: 'salary', rate: 52_000, regularHours: 0, overtimeHours: 0, frequency: 'biweekly', extra: 100 }), { regularPay: 2000, overtimePay: 0, extra: 100, gross: 2100 });
assert.equal(periodPay({ kind: 'salary', rate: 60_000, regularHours: 0, overtimeHours: 0, frequency: 'monthly', extra: 0 }).gross, 5000);
assert.equal(periodPay({ kind: 'salary', rate: 50_000, regularHours: 0, overtimeHours: 0, frequency: 'semimonthly', extra: 0 }).gross, 2083.33);

console.log('payroll tax rules: ok');

// With DATABASE_URL set (a migrated, disposable database) the whole flow runs against it.
async function database() {
  const { createEmployee } = await import('../../src/lib/accounting/payroll');
  const { createAccount } = await import('../../src/lib/accounting/chartOfAccounts');
  const { updateJournalEntry, deleteJournalEntry } = await import('../../src/lib/accounting/journalEntries');
  const wf = await import('../../src/lib/workforce/service');
  const pay = await import('../../src/lib/payroll/service');
  const { getDb } = await import('../../src/db/client');
  const schema = await import('../../src/db/schema');
  const { eq } = await import('drizzle-orm');
  const { ConflictError, ValidationError } = await import('../../src/lib/validation');
  const db = getDb();
  const mk = (displayName: string, amount: number, period: 'hourly' | 'salary-annual') =>
    createEmployee({ displayName, hiredDate: '2020-01-06', basePay: { amount, period } });

  const hourly = await mk('Hank Hourly', 20, 'hourly');
  const salaried = await mk('Sally Salary', 52_000, 'salary-annual');
  const agency = await mk('Aaron Agency', 40, 'hourly');
  const gone = await mk('Gil Gone', 15, 'hourly');
  await wf.updateStaffSetup(hourly.id, { pbjJobTitleCode: 10, pbjPayTypeCode: 2 });
  await wf.updateStaffSetup(salaried.id, { pbjJobTitleCode: 5, pbjPayTypeCode: 1 });
  await wf.updateStaffSetup(agency.id, { pbjJobTitleCode: 7, pbjPayTypeCode: 3 });
  await db.update(schema.payrollEmployees).set({ status: 'terminated' }).where(eq(schema.payrollEmployees.id, gone.id));

  // approved time for the hourly employee: week 1 Monday to Friday 9 hours (45, so 5 overtime), week 2 Monday to Friday 8 hours
  const approveAll = async (employeeId: string, days: string[], start: string, end: string) => {
    for (const d of days) {
      const e = await wf.createEntry({ employeeId, workDate: d, startTime: start, endTime: end, mealMinutes: 30 });
      await wf.setApproved([e.id], true);
    }
  };
  await approveAll(hourly.id, ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'], '07:00', '16:30');
  await approveAll(hourly.id, ['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16'], '07:00', '15:30');
  // one entry nobody approved: it must not be paid
  await wf.createEntry({ employeeId: hourly.id, workDate: '2026-01-17', startTime: '07:00', endTime: '15:30', mealMinutes: 30 });
  await approveAll(agency.id, ['2026-01-05'], '07:00', '15:30');

  // pay setup: Hank is single with no extras; Sally has a 401(k) deferral and a benefit premium
  await pay.savePayProfile(salaried.id, { filingStatus: 'single', pretaxRetirement: 100, pretaxBenefits: 50 });
  await assert.rejects(() => pay.savePayProfile(hourly.id, { stateCode: 'ZZ' }), ValidationError, 'unknown state');
  await assert.rejects(() => pay.savePayProfile(hourly.id, { filingStatus: 'widowed' }), ValidationError, 'unknown filing status');
  await assert.rejects(() => pay.savePayProfile(hourly.id, { statePercent: 40 }), ValidationError, 'state percent too high');

  // a run needs the right number of days for its frequency
  await assert.rejects(() => pay.createRun({ periodStart: '2026-01-05', periodEnd: '2026-01-11', payDate: '2026-01-23', frequency: 'biweekly' }), ValidationError, 'one week is not a biweekly period');
  const first = await pay.createRun({ periodStart: '2026-01-05', periodEnd: '2026-01-18', payDate: '2026-01-23', frequency: 'biweekly' });
  assert.deepEqual(first.skipped, []);
  let run = await pay.getRun(first.id);
  assert.equal(run.status, 'draft');
  assert.deepEqual(run.items.map((i) => i.name).sort(), ['Hank Hourly', 'Sally Salary'], 'contract staff and people who left are not on payroll');
  const hank = run.items.find((i) => i.name === 'Hank Hourly')!;
  // 80 regular hours (40 + 40) and 5 overtime hours (week 1 had 45): 80 x 20 = 1,600; 5 x 20 x 1.5 = 150; gross 1,750
  assert.equal(hank.regularHours, 80);
  assert.equal(hank.overtimeHours, 5);
  assert.equal(hank.regularPay, 1600);
  assert.equal(hank.overtimePay, 150);
  assert.equal(hank.gross, 1750);
  assert.match(hank.note ?? '', /1 time entry is not approved/);
  assert.match(hank.note ?? '', /No W-4 on file/);
  // 1,750 x 26 = 45,500 - 8,600 = 36,900; 1,240 + 12% x 17,000 = 3,280; / 26 = 126.15
  near(hank.federal, 126.15); near(hank.socialSecurity, 108.5); near(hank.medicare, 25.38);
  near(hank.net, 1750 - 126.15 - 108.5 - 25.38, 'net');
  const sally = run.items.find((i) => i.name === 'Sally Salary')!;
  assert.equal(sally.gross, 2000);
  const expect = computeItem({ gross: 2000, pretaxBenefits: 50, pretaxRetirement: 100, afterTax: 0, frequency: 'biweekly', w4: w4(), statePercent: 0, stateFixed: 0, ytd: { fica: 0, futa: 0, suta: 0 }, sutaRate: 0, sutaWageBase: 0 });
  near(sally.federal, expect.federal); near(sally.socialSecurity, expect.socialSecurity); near(sally.net, expect.net);
  near(sally.federal, 138.15, '1,850 taxable: 48,100 - 8,600 = 39,500; 1,240 + 12% x 19,600 = 3,592; / 26');

  // the same dates cannot pay the same people twice
  const dup = await pay.createRun({ periodStart: '2026-01-05', periodEnd: '2026-01-18', payDate: '2026-01-23', frequency: 'biweekly' });
  assert.equal((await pay.getRun(dup.id)).items.length, 0);
  assert.equal(dup.skipped.length, 2);
  await pay.deleteDraftRun(dup.id);

  // a draft can be changed: a 100 bonus is taxed and the bonus only counts once
  await pay.updateItem(first.id, hank.id, { extraPay: 100 });
  let h2 = (await pay.getRun(first.id)).items.find((i) => i.name === 'Hank Hourly')!;
  assert.equal(h2.gross, 1850);
  assert.ok(h2.federal > hank.federal);
  await pay.updateItem(first.id, hank.id, { extraPay: 0 });
  h2 = (await pay.getRun(first.id)).items.find((i) => i.name === 'Hank Hourly')!;
  assert.equal(h2.gross, 1750);
  await assert.rejects(() => pay.updateItem(first.id, hank.id, { regularHours: -3 }), ValidationError);

  // finishing needs the accounts set up first
  await assert.rejects(() => pay.finalizeRun(first.id), ConflictError, 'no accounts yet');
  const bank = await createAccount({ name: 'Operating Bank', accountType: 'Bank', accountSubType: 'Checking' });
  let settings = await pay.setupPayrollAccounts();
  assert.ok(settings.wagesAccountId && settings.employerTaxAccountId && settings.taxPayableAccountId && settings.deductionsPayableAccountId);
  settings = await pay.savePaySettings({ ...settings, payFromAccountId: bank.Id, sutaRate: 2.7, sutaWageBase: 9000 });
  assert.equal((await pay.setupPayrollAccounts()).wagesAccountId, settings.wagesAccountId, 'set up twice makes no duplicates');
  await assert.rejects(() => pay.savePaySettings({ ...settings, wagesAccountId: bank.Id }), ValidationError, 'wages must be an expense account');

  run = await pay.finalizeRun(first.id);
  assert.equal(run.status, 'final');
  const hankF = run.items.find((i) => i.name === 'Hank Hourly')!;
  near(hankF.suta, 47.25, 'state unemployment 2.7% of 1,750');
  near(hankF.futa, 10.5, 'FUTA 0.6% of 1,750');
  // the journal entry balances and matches the run
  const je = await db.select().from(schema.journalLines).where(eq(schema.journalLines.journalEntryId, run.journalEntryId!));
  const sum = (t: string) => je.filter((l) => l.postingType === t).reduce((a, l) => a + Number(l.amount), 0);
  near(sum('Debit'), sum('Credit'), 'debits equal credits');
  near(sum('Debit'), run.totals.gross + run.totals.employerTaxes);
  const credit = (id: string | null) => je.filter((l) => l.accountId === id && l.postingType === 'Credit').reduce((a, l) => a + Number(l.amount), 0);
  near(credit(bank.Id), run.totals.net, 'net pay out of the bank');
  near(credit(settings.deductionsPayableAccountId), 150, 'the 401(k) and benefits held');
  assert.equal(je.filter((l) => l.accountId === settings.wagesAccountId && l.postingType === 'Debit').length, 1);
  // a finished run cannot be edited and its journal entry cannot be edited or deleted by hand
  await assert.rejects(() => pay.updateItem(first.id, hank.id, { extraPay: 5 }), ConflictError);
  await assert.rejects(() => pay.deleteDraftRun(first.id), ConflictError);
  await assert.rejects(() => updateJournalEntry({ id: run.journalEntryId!, memo: 'x' }), ConflictError);
  await assert.rejects(() => deleteJournalEntry(run.journalEntryId!), ConflictError);

  // the next run: year to date adds up, and Social Security stops at the wage base
  await approveAll(hourly.id, ['2026-01-19', '2026-01-20'], '07:00', '15:30');
  const second = await pay.createRun({ periodStart: '2026-01-19', periodEnd: '2026-02-01', payDate: '2026-02-06', frequency: 'biweekly' });
  run = await pay.getRun(second.id);
  const hank2 = run.items.find((i) => i.name === 'Hank Hourly')!;
  assert.equal(hank2.gross, 320, '2 days of 8 hours at 20');
  near(hank2.ytd.gross, 1750 + 320, 'year to date on the stub');
  await db.insert(schema.payRuns).values({ id: '00000000-0000-4000-8000-000000000001', periodStart: '2025-12-20', periodEnd: '2026-01-02', payDate: '2026-01-02', frequency: 'biweekly', status: 'final' });
  await db.insert(schema.payRunItems).values({ runId: '00000000-0000-4000-8000-000000000001', employeeId: sally.employeeId, kind: 'salary', rate: '52000', ficaWages: '182350', gross: '182350' });
  await pay.updateItem(second.id, run.items.find((i) => i.name === 'Sally Salary')!.id, { extraPay: 0 });
  const sally2 = (await pay.getRun(second.id)).items.find((i) => i.name === 'Sally Salary')!;
  // 182,350 plus the 1,950 from the first run is 184,300 already paid this year, which leaves 200 of room under the 184,500 base: 6.2% of 200 = 12.40; Medicare has no limit
  near(sally2.socialSecurity, 12.4, 'Social Security stops at the wage base');
  near(sally2.medicare, round(1950 * 0.0145), 'Medicare keeps going');
  function round(x: number) { return Math.round(x * 100) / 100; }

  // voiding a finished run reverses its journal entry and takes it out of year to date
  const voided = await pay.voidRun(first.id);
  assert.equal(voided.status, 'void');
  const rev = await db.select().from(schema.payRuns).where(eq(schema.payRuns.id, first.id));
  const revLines = await db.select().from(schema.journalLines).where(eq(schema.journalLines.journalEntryId, rev[0].reversalEntryId!));
  const net = (lines: typeof je) => lines.reduce((a, l) => a + (l.postingType === 'Debit' ? 1 : -1) * Number(l.amount), 0);
  near(net(je) + net(revLines), 0, 'the reversal cancels the original');
  await assert.rejects(() => pay.voidRun(first.id), ConflictError, 'already void');
  const again = await pay.createRun({ periodStart: '2026-01-05', periodEnd: '2026-01-18', payDate: '2026-01-23', frequency: 'biweekly' });
  assert.equal((await pay.getRun(again.id)).items.length, 2, 'a voided run frees the people to be paid again');

  // what is owed, from finished runs
  await pay.deleteDraftRun(again.id);
  await pay.deleteDraftRun(second.id);
  const q = await pay.taxSummary(2026, 1);
  assert.equal(q.runs, 1, 'only the made up earlier run is final and not void');
  await assert.rejects(() => pay.taxSummary(2026, 5), ValidationError);

  console.log('payroll database checks: ok');
  process.exit(0);
}

if (process.env.DATABASE_URL) database().catch((e) => { console.error(e); process.exit(1); });
