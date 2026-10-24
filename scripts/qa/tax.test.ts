// Hand-checked cases for the tax engine. Run: npx tsx scripts/qa/tax.test.ts
import assert from 'node:assert/strict';
import { computeReturn, bracketTax, num } from '../../src/lib/tax';
import { readSlipUpload, validateSlip } from '../../src/lib/tax/slips';
import { stateTaxEstimate } from '../../src/lib/tax/states';
import { STATE_TAX_2025 } from '../../src/lib/tax/stateData';
import { PROVINCE_TABLES_2025, ontarioHealthPremium } from '../../src/lib/tax/provinces';

const near = (actual: number, expected: number, msg: string, tol = 0.02) => assert.ok(Math.abs(actual - expected) <= tol, `${msg}: got ${actual}, expected ${expected}`);

// helpers
assert.equal(num({ a: '$1,234.50' }, 'a'), 1234.5);
assert.equal(num({}, 'a'), 0);
near(bracketTax(44250, [11925, 48475, Infinity], [0.1, 0.12, 0.22]), 5071.5, 'bracketTax');

// --- U.S. ---
// Single, $60,000 wages, $6,000 withheld: taxable 44,250, tax 5,071.50, refund 928.50.
let r = computeReturn('US', { filingStatus: 'single', wages: 60000, wageWithholding: 6000 });
near(r.taxableIncome, 44250, 'US single taxable');
near(r.totalTax, 5071.5, 'US single tax');
near(r.balance, -928.5, 'US single refund');

// Married filing jointly, $100,000 wages, 2 children under 17: tax 7,743 less $4,400 credit = 3,343.
r = computeReturn('US', { filingStatus: 'mfj', wages: 100000, childrenUnder17: 2 });
near(r.taxableIncome, 68500, 'US mfj taxable');
near(r.totalTax, 3343, 'US mfj tax after child credit');

// Itemizing wins when larger: single, $100,000 wages, 20,000 mortgage interest + 10,000 state tax = 30,000 > 15,750.
r = computeReturn('US', { filingStatus: 'single', wages: 100000, mortgageInterest: 20000, saltPaid: 10000 });
near(r.taxableIncome, 70000, 'US itemized taxable');
// ... and the SALT cap bites: 60,000 of state tax is limited to 40,000.
r = computeReturn('US', { filingStatus: 'single', wages: 150000, saltPaid: 60000 });
near(r.taxableIncome, 110000, 'US SALT cap');
assert.ok(r.findings.some((f) => /capped/.test(f.title)));

// Self-employment: single, $50,000 profit. SE tax 7,064.78; AGI 46,467.61; QBI 6,143.52; taxable 24,574.09.
r = computeReturn('US', { filingStatus: 'single', businessIncome: 50000 });
near(r.totalTax, 9775.17, 'US self-employed total tax', 0.05);
near(r.taxableIncome, 24574.09, 'US self-employed taxable', 0.05);
near(r.adjustedIncome, 46467.61, 'US self-employed AGI', 0.05);

// Long-term gains in the 0% band: single, taxable income 40,000 of which 10,000 is a long-term gain => ordinary 30,000.
r = computeReturn('US', { filingStatus: 'single', wages: 45750, longTermGains: 10000 });
near(r.taxableIncome, 40000, 'US gains taxable');
near(r.totalTax, 1192.5 + (30000 - 11925) * 0.12, 'US gains taxed at 0%');
// 15% band: single, wages 100,000 + 10,000 long-term gain, taxable 94,250 (ordinary 84,250 + 10,000 gain). Gain is above 48,350 => 15%.
r = computeReturn('US', { filingStatus: 'single', wages: 100000, longTermGains: 10000 });
near(r.totalTax, 1192.5 + (48475 - 11925) * 0.12 + (84250 - 48475) * 0.22 + 10000 * 0.15, 'US gains at 15%');

// Capital loss limited to 3,000 with the rest carried over.
r = computeReturn('US', { filingStatus: 'single', wages: 50000, longTermGains: -10000 });
near(r.totalIncome, 47000, 'US capital loss limit');
assert.ok(r.findings.some((f) => /carries forward/.test(f.title)));

// Refundable child credit: single parent (HoH), 1 child, $15,000 wages, tax is tiny; credit refunds 15% of (15,000-2,500)=1,875 capped at 1,700.
r = computeReturn('US', { filingStatus: 'hoh', wages: 15000, wageWithholding: 0, childrenUnder17: 1 });
assert.equal(r.totalTax, 0);
near(r.balance, -1700, 'US refundable child credit');

// Senior deduction and extra standard deduction: single, 66 years old, $50,000 wages.
r = computeReturn('US', { filingStatus: 'single', wages: 50000, age65Count: 1 });
near(r.taxableIncome, 50000 - (15750 + 2000) - 6000, 'US senior deductions');

// Additional Medicare tax: single, 250,000 wages => 0.9% of 50,000 = 450 on top.
r = computeReturn('US', { filingStatus: 'single', wages: 250000 });
assert.ok(r.lines.some((l) => l.label === 'Additional Medicare tax' && Math.abs(l.amount - 450) < 0.01));

// Blank return is all zeros and does not throw.
r = computeReturn('US', {});
assert.equal(r.totalTax, 0);
assert.equal(r.balance, 0);

// Earned income credit: single parent, 1 child, $20,000 wages => the maximum $4,328, fully refundable (tax is small).
r = computeReturn('US', { filingStatus: 'hoh', wages: 20000, wageWithholding: 0, eitcChildren: 1 });
assert.ok(r.lines.some((l) => l.label === 'Earned income credit' && Math.abs(l.amount - 4328) < 0.01));
// ... phases out: 1 child, single, $40,000 => 4,328 - 15.98% x (40,000 - 23,350) = 1,667.
r = computeReturn('US', { filingStatus: 'single', wages: 40000, eitcChildren: 1 });
assert.ok(r.lines.some((l) => l.label === 'Earned income credit' && Math.abs(l.amount - 1667.3) < 0.5));
// ... ends above the IRS limit (50,434 for one child, single): none at $52,000.
r = computeReturn('US', { filingStatus: 'single', wages: 52000, eitcChildren: 1 });
assert.ok(!r.lines.some((l) => l.label === 'Earned income credit'));
// ... married filing jointly uses the higher phase-out start: 2 children, $60,000 => 7,152 - 21.06% x (60,000 - 30,470) = 933.
r = computeReturn('US', { filingStatus: 'mfj', wages: 60000, eitcChildren: 2 });
assert.ok(r.lines.some((l) => l.label === 'Earned income credit' && Math.abs(l.amount - 932.9) < 0.5));
// ... childless: 25-64, $8,490 of wages => $649; investment income over $11,950 disqualifies.
r = computeReturn('US', { filingStatus: 'single', wages: 8490, eitcChildlessEligible: true });
assert.ok(r.lines.some((l) => l.label === 'Earned income credit' && Math.abs(l.amount - 649) < 0.01));
r = computeReturn('US', { filingStatus: 'single', wages: 12000, eitcChildren: 1, interest: 13000 });
assert.ok(!r.lines.some((l) => l.label === 'Earned income credit'));
// American opportunity credit: one student with $4,000 of expenses = $2,500; 60% ($1,500) offsets tax, 40% ($1,000) is refundable.
r = computeReturn('US', { filingStatus: 'single', wages: 50000, aotcExpenses1: 4000 });
assert.ok(r.lines.some((l) => l.label.startsWith('American opportunity') && Math.abs(l.amount - 1000) < 0.01));
assert.ok(r.lines.some((l) => l.label === 'Education credits' && Math.abs(l.amount + 1500) < 0.01));
// ... reduced halfway through the phase-out ($85,000 single => half) and gone at $90,000.
r = computeReturn('US', { filingStatus: 'single', wages: 85000, aotcExpenses1: 4000 });
assert.ok(r.lines.some((l) => l.label.startsWith('American opportunity') && Math.abs(l.amount - 500) < 0.01));
r = computeReturn('US', { filingStatus: 'single', wages: 95000, aotcExpenses1: 4000 });
assert.ok(!r.lines.some((l) => /education|American opportunity/i.test(l.label)));
// Lifetime learning credit: 20% of $5,000 = $1,000.
r = computeReturn('US', { filingStatus: 'single', wages: 50000, llcExpenses: 5000 });
assert.ok(r.lines.some((l) => l.label === 'Education credits' && Math.abs(l.amount + 1000) < 0.01));
// Married filing separately gets no education credit.
r = computeReturn('US', { filingStatus: 'mfs', wages: 50000, aotcExpenses1: 4000 });
assert.ok(!r.lines.some((l) => /education|American opportunity/i.test(l.label)));
// Student loan interest: $3,000 paid => $2,500 deducted; phased out between $85,000 and $100,000 (halfway => $1,250).
r = computeReturn('US', { filingStatus: 'single', wages: 60000, studentLoanInterest: 3000 });
near(r.adjustedIncome, 57500, 'student loan deduction');
r = computeReturn('US', { filingStatus: 'single', wages: 92500, studentLoanInterest: 3000 });
near(r.adjustedIncome, 92500 - 1250, 'student loan phase-out');
r = computeReturn('US', { filingStatus: 'single', wages: 110000, studentLoanInterest: 3000 });
near(r.adjustedIncome, 110000, 'student loan gone');

// --- State tax estimates (hand-worked from the published tables) ---
assert.equal(Object.keys(STATE_TAX_2025).length, 51, 'fifty states and DC');
near(stateTaxEstimate('PA', 60000, false, 0).tax, 1842, 'PA flat 3.07%');
near(stateTaxEstimate('IL', 60000, false, 0).tax, 2828.93, 'IL flat with exemption');
near(stateTaxEstimate('IL', 100000, true, 2).tax, 4385.7, 'IL joint with two dependents');
near(stateTaxEstimate('CA', 60000, false, 0).tax, 1696.16, 'CA brackets less exemption credit');
near(stateTaxEstimate('GA', 60000, false, 0).tax, 2491.2, 'GA at the 2025 rate of 5.19%');
for (const code of ['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WY']) assert.equal(stateTaxEstimate(code, 90000, false, 0).tax, 0, `${code} has no income tax`);
assert.equal(stateTaxEstimate('WA', 90000, false, 0).computed, false);
assert.equal(stateTaxEstimate('ZZ', 90000, false, 0).computed, false);
// Every taxing state gives a positive estimate on 80,000 of income and never a negative one on 0.
for (const [code, t] of Object.entries(STATE_TAX_2025)) {
  if (t.none || t.capitalGainsOnly) continue;
  assert.ok(stateTaxEstimate(code, 80000, false, 0).tax > 0, `${code} taxes 80,000`);
  assert.equal(stateTaxEstimate(code, 0, false, 0).tax, 0, `${code} taxes nothing on 0`);
}
// Inside a return: state tax adds to the total, state withholding counts as a payment, federal lines stay separate.
r = computeReturn('US', { filingStatus: 'single', wages: 60000, wageWithholding: 6000, state: 'PA', stateWithholding: 1800 });
near(r.totalTax, 5071.5 + 1842, 'US+PA total tax');
near(r.balance, -928.5 + (1842 - 1800), 'US+PA combined balance');
assert.ok(r.lines.some((l) => l.label === 'Total refund, federal and state' || l.label === 'Total you owe, federal and state'));
assert.ok(r.findings.some((f) => /State tax is an estimate/.test(f.title)));
// No state chosen: say so. A no-tax state adds nothing.
r = computeReturn('US', { filingStatus: 'single', wages: 60000 });
assert.ok(r.notComputed.some((n) => /until you choose your state/.test(n)));
r = computeReturn('US', { filingStatus: 'single', wages: 60000, state: 'TX' });
near(r.totalTax, 5071.5, 'TX adds no tax');

// --- Canada ---
// Employment $60,000: CPP 3,361.75, EI 984, tax deducted 8,000.
let c = computeReturn('CA', { province: 'ON', employmentIncome: 60000, cppPaid: 3361.75, eiPaid: 984, taxDeducted: 8000 });
near(c.taxableIncome, 59435, 'CA taxable income', 0.01);
// Federal 8,741.68 - 3,100.21 = 5,641.47. Ontario: 3,269.98 tax - 834.65 credits = 2,435.33, no surtax, health premium 600 => 3,035.33.
near(c.totalTax, 5641.47 + 3035.33, 'CA total tax with Ontario', 0.03);
near(c.balance, 5641.47 + 3035.33 - 8000, 'CA balance with Ontario', 0.03);
assert.ok(c.lines.some((l) => l.label === 'Ontario Health Premium' && l.amount === 600));

// Provincial tax: Alberta on the same income = 8% of 59,435 less (22,323 + 2,796.75 + 984) x 8% = 2,666.50.
c = computeReturn('CA', { province: 'AB', employmentIncome: 60000, cppPaid: 3361.75, eiPaid: 984, taxDeducted: 8000 });
near(c.totalTax, 5641.47 + 2666.5, 'CA total tax with Alberta', 0.03);
// Quebec is not computed and says so; no province says so too.
c = computeReturn('CA', { province: 'QC', employmentIncome: 60000, cppPaid: 3361.75, eiPaid: 984 });
near(c.totalTax, 5641.47, 'CA Quebec is federal only', 0.03);
assert.ok(c.notComputed.some((n) => /Quebec/.test(n)));
// Ontario surtax kicks in on high income: taxable 200,000 => both surtaxes apply and premium is 750.
c = computeReturn('CA', { province: 'ON', employmentIncome: 200000 });
assert.ok(c.lines.some((l) => l.label === 'Ontario surtax' && l.amount > 0));
assert.ok(c.lines.some((l) => l.label === 'Ontario Health Premium' && l.amount === 750));
// Every jurisdiction except Quebec produces tax on 60,000 of income.
for (const code of ['AB', 'BC', 'MB', 'NB', 'NL', 'NT', 'NS', 'NU', 'ON', 'PE', 'SK', 'YT']) {
  const r = computeReturn('CA', { province: code, selfEmployedGross: 60000 });
  assert.ok(r.lines.some((l) => /tax$/.test(l.label) && l.label !== 'Federal tax' && l.amount > 0), `provincial tax for ${code}`);
}
// Ontario Health Premium schedule edges.
assert.equal(ontarioHealthPremium(20000), 0);
near(ontarioHealthPremium(22500), 150, 'OHP 22,500');
assert.equal(ontarioHealthPremium(30000), 300);
assert.equal(ontarioHealthPremium(40000), 450);
assert.equal(ontarioHealthPremium(60000), 600);
assert.equal(ontarioHealthPremium(100000), 750);
assert.equal(ontarioHealthPremium(250000), 900);
// Manitoba basic amount is reduced for high income.
const mb = PROVINCE_TABLES_2025.MB.basicPersonal;
assert.equal(mb(100000, 0), 15780);
near(mb(300000, 0), 7890, 'MB BPA halfway', 0.01);
assert.equal(mb(400000, 0), 0);

// Basic personal amount is reduced between 177,882 and 253,414 and is the minimum above.
c = computeReturn('CA', { province: 'ON', selfEmployedGross: 300000 });
assert.ok(c.totalTax > 0);
// Dividend credits: eligible 10,000 => grossed up 13,800, credit 15.0198% = 2,072.73.
c = computeReturn('CA', { province: 'AB', eligibleDividends: 10000 });
near(c.totalIncome, 13800, 'CA eligible dividend gross-up');
assert.equal(c.totalTax, 0, 'CA dividends under the basic amount owe nothing');
// Capital gains are 50% included.
c = computeReturn('CA', { province: 'BC', capitalGains: 20000 });
near(c.totalIncome, 10000, 'CA capital gains inclusion');
// Capital loss does not reduce other income.
c = computeReturn('CA', { province: 'BC', employmentIncome: 40000, capitalGains: -5000 });
near(c.totalIncome, 40000, 'CA capital loss ignored this year');
// A province is required to be chosen: warn when missing, and say provincial tax is not included.
c = computeReturn('CA', { employmentIncome: 50000 });
assert.ok(c.findings.some((f) => /province/i.test(f.title)));
assert.ok(c.notComputed.some((n) => /Provincial/.test(n)));
// Overpaid EI or CPP is refunded.
c = computeReturn('CA', { province: 'ON', employmentIncome: 80000, cppPaid: 4500, eiPaid: 1200 });
near(c.totalPayments, 4500 - 4034.1 + (1200 - 1077.48), 'CA CPP/EI overpayment refund');
// Blank return does not throw.
c = computeReturn('CA', {});
assert.equal(c.totalTax, 0);

async function slips() {
// --- W-2 / T4 slip reading ---
const w2 = validateSlip({ slip_type: 'W-2', employer: 'Acme Inc', boxes: { '1': 58250.5, '2': 5100, '3': 62000 } }, 'US');
assert.deepEqual(w2?.values, { wages: 58250.5, wageWithholding: 5100 });
assert.equal(w2?.employer, 'Acme Inc');
assert.equal(w2?.warnings.length, 0);
const t4 = validateSlip({ slip_type: 'T4', boxes: { '14': 60000, '22': 8000, '16': 3361.75, '18': 984, '44': null } }, 'CA');
assert.deepEqual(t4?.values, { employmentIncome: 60000, taxDeducted: 8000, cppPaid: 3361.75, eiPaid: 984 });
// wrong kind of slip, junk numbers, impossible amounts
assert.ok(validateSlip({ slip_type: 'T4', boxes: { '1': 100 } }, 'US')?.warnings.some((w) => /T4/.test(w)));
assert.deepEqual(validateSlip({ slip_type: 'W-2', boxes: { '1': -5, '2': 'abc' } }, 'US')?.values, {});
assert.ok(validateSlip({ slip_type: 'W-2', boxes: { '1': 1000, '2': 5000 } }, 'US')?.warnings.some((w) => /larger than wages/.test(w)));
assert.ok(validateSlip({ slip_type: 'T4', boxes: { '14': 90000, '16': 9000, '18': 3000 } }, 'CA')?.warnings.filter((w) => /maximum/.test(w)).length === 2);
assert.equal(validateSlip('nope', 'US'), null);
assert.equal(validateSlip({ slip_type: 'W-2' }, 'US'), null);
// no identity numbers survive: only the asked-for boxes are kept
assert.deepEqual(Object.keys(validateSlip({ slip_type: 'W-2', boxes: { '1': 1, a: 'SSN 123-45-6789' }, ssn: '123-45-6789' }, 'US')?.values ?? {}), ['wages']);
// the upload path
const fakeClaude = (text: string) => ({ messages: { create: async () => ({ content: [{ type: 'text', text }] }) } }) as never;
const png = Buffer.from('fake image bytes').toString('base64');
const good = await readSlipUpload({ country: 'US', fileName: 'w2.png', mimeType: 'image/png', data: png }, true, fakeClaude('{"slip_type":"W-2","employer":"Acme","boxes":{"1":50000,"2":4000}}'));
assert.equal(good.values.wages, 50000);
await assert.rejects(readSlipUpload({ country: 'US', fileName: 'w2.png', mimeType: 'image/png', data: png }, false), /needs Claude/);
await assert.rejects(readSlipUpload({ country: 'US', fileName: 'w2.docx', mimeType: '', data: png }, true), /PDF, PNG or JPG/);
await assert.rejects(readSlipUpload({ country: 'FR', fileName: 'a.png', mimeType: 'image/png', data: png }, true), /country/);
await assert.rejects(readSlipUpload({ country: 'US', fileName: 'w2.png', mimeType: 'image/png', data: '' }, true), /empty/);
await assert.rejects(readSlipUpload({ country: 'US', fileName: 'w2.png', mimeType: 'image/png', data: png }, true, fakeClaude('not json')), /Couldn't read/);
}
slips().then(() => console.log('tax engine: ok'), (e) => { console.error(e); process.exit(1); });
