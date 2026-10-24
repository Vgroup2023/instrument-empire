// Hand-checked cases for the tax engine. Run: npx tsx scripts/qa/tax.test.ts
import assert from 'node:assert/strict';
import { computeReturn, bracketTax, num } from '../../src/lib/tax';
import { readSlipUpload, validateSlip } from '../../src/lib/tax/slips';

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

// --- Canada ---
// Employment $60,000: CPP 3,361.75, EI 984, tax deducted 8,000.
let c = computeReturn('CA', { province: 'ON', employmentIncome: 60000, cppPaid: 3361.75, eiPaid: 984, taxDeducted: 8000 });
near(c.taxableIncome, 59435, 'CA taxable income', 0.01);
near(c.totalTax, 8741.68 - 3100.21, 'CA federal tax', 0.03);
near(c.balance, 8741.68 - 3100.21 - 8000, 'CA balance', 0.03);

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
