// Rule tests for the RFQ-to-quote engine. Run: npx tsx scripts/qa/quoting.test.ts
import assert from 'node:assert/strict';
import { extractRfqText, findDueDate } from '../../src/lib/quoting/extract';
import { costRfq, missingCertifications, pickPrice, matchPriorJobs } from '../../src/lib/quoting/costing';
import { canonicalMaterial } from '../../src/lib/quoting/materials';
import type { QuoteContext } from '../../src/lib/quoting/types';

const ctx: QuoteContext = {
  today: '2024-06-20',
  settings: { targetMarginPct: 28, overheadPct: 10, scrapPct: 5, priceStaleDays: 30, minLeadDays: 10, quoteValidDays: 30, certifications: ['ISO 9001:2015'] },
  prices: [{ id: 'p1', material: '6061-T6 Aluminum', vendor: 'Reliable Metals Co.', price: 4.28, unit: 'LB', priceDate: '2024-05-17' }],
  routing: [
    { id: 'r1', operation: 'Milling', keywords: ['mill'], setupHours: 2, runMinutes: 12, ratePerHour: 100 },
    { id: 'r2', operation: 'Drilling', keywords: ['drill'], setupHours: 0.5, runMinutes: 3, ratePerHour: 80 },
  ],
  priorJobs: [
    { id: 'j1', partNumber: '1023-001', description: 'Flange bracket housing', customerName: 'Acme', material: '6061-T6 aluminum', operations: ['Milling'], qty: 10, laborHoursPerPart: 0.4, materialCostPerPart: 6, unitPrice: 120, completedOn: '2024-01-10' },
  ],
};

// materials
assert.equal(canonicalMaterial('6061-T6 AL'), '6061-T6 ALUMINUM');
assert.equal(canonicalMaterial('aluminum 6061'), '6061-T6 ALUMINUM');
assert.equal(canonicalMaterial('304 stainless steel'), '304 STAINLESS');
assert.equal(canonicalMaterial(''), null);

// dates
assert.equal(findDueDate('Please quote. Due date: 06/21/2024'), '2024-06-21');
assert.equal(findDueDate('needed by Jun 21, 2024'), '2024-06-21');
assert.equal(findDueDate('due: 2024-02-30'), null, 'an impossible date is not accepted');

// extraction
const text = `Subject: RFQ 1023
Material: 6061-T6 aluminum
Operations: milling, drilling, tapping, finishing
Due date: 06/21/2024
Certifications: ISO 9001:2015, AS9100D
1023-001 Flange bracket qty 12, 1.5 lb
1023-002 Cover plate x 40
Ship to our dock.`;
const ex = extractRfqText(text, ctx.routing);
assert.equal(ex.parts.length, 2);
assert.equal(ex.parts[0].partNumber, '1023-001');
assert.equal(ex.parts[0].qty, 12);
assert.equal(ex.parts[0].weightLb, 1.5);
assert.equal(ex.parts[1].qty, 40);
assert.equal(ex.parts[0].material, '6061-T6 ALUMINUM', 'request-wide material applies');
assert.deepEqual(ex.parts[0].operations, ['Milling', 'Drilling']); // tapping has no routing rule so it is not recognised here
assert.equal(ex.dueDate, '2024-06-21');
assert.ok(ex.certifications.some((c) => /ISO 9001/i.test(c)));
assert.ok(ex.certifications.some((c) => /AS9100/i.test(c)));
assert.equal(extractRfqText('Hello, can you quote some parts?', []).parts.length, 0);

// certifications compare by family
assert.deepEqual(missingCertifications(['AS9100D', 'ISO 9001:2015'], ['ISO 9001:2008']), ['AS9100D']);

// price choice: stale one is still used, and flagged
assert.equal(pickPrice('6061-T6 ALUMINUM', ctx.prices, ctx.today, 30)?.vendor, 'Reliable Metals Co.');

// costing
const r = costRfq({ parts: ex.parts, dueDate: ex.dueDate, certifications: ex.certifications, hasDrawing: false }, ctx);
const codes = r.flags.map((f) => f.code);
assert.ok(codes.includes('STALE_PRICE'), 'stale price flagged');
assert.ok(codes.includes('CERT_GAP'), 'AS9100 not held');
assert.ok(codes.includes('NO_DRAWING'));
assert.ok(codes.includes('NO_WEIGHT'), 'part 2 has no weight and no prior material cost');
assert.ok(codes.includes('TIGHT_DUE'), 'due tomorrow vs 10-day lead');
assert.ok(r.flags[0].severity === 'high', 'flags are sorted high first');
const p1 = r.parts[0].costing;
// material: 1.5 lb * 1.05 * 4.28
assert.equal(p1.materialCostPerPart, 6.7410);
// milling: 2/12 + 12/60 = 0.36667 h * 100 ; drilling: 0.5/12 + 3/60 = 0.091667 h * 80
const labor = (2 / 12 + 12 / 60) * 100 + (0.5 / 12 + 3 / 60) * 80;
assert.ok(Math.abs(p1.laborCostPerPart - labor) < 0.001);
const direct = 6.741 + labor;
assert.ok(Math.abs(p1.unitCost - direct * 1.1) < 0.001);
assert.ok(Math.abs(p1.unitPrice - Math.round((direct * 1.1) / 0.72 * 100) / 100) < 0.011);
assert.equal(p1.priorJobs[0].matchedBy, 'part-number');
assert.ok(Math.abs(r.priceTotal - r.parts.reduce((s, p) => s + p.costing.unitPrice * p.qty, 0)) < 0.01);

// a part with nothing known is never silently priced at zero without a high flag
const empty = costRfq({ parts: [{ description: 'Mystery part', qty: 5, operations: [] }], dueDate: null, certifications: [], hasDrawing: true }, ctx);
assert.ok(empty.flags.filter((f) => f.severity === 'high').length >= 2);
assert.equal(empty.parts[0].costing.confidence, 'low');

// prior job matching by description needs overlap and the same material
assert.equal(matchPriorJobs({ description: 'Flange bracket housing', qty: 1, operations: [], material: 'steel 1018' }, ctx.priorJobs.map((j) => ({ ...j, partNumber: null }))).length, 0);
assert.equal(matchPriorJobs({ description: 'Flange bracket housing', qty: 1, operations: [], material: '6061 aluminum' }, ctx.priorJobs.map((j) => ({ ...j, partNumber: null }))).length, 1);

// margin override below target is flagged
assert.ok(costRfq({ parts: ex.parts, dueDate: null, certifications: [], hasDrawing: true, marginPct: 15 }, ctx).flags.some((f) => f.code === 'LOW_MARGIN'));

// Claude reading: output is validated, never trusted
import { readRfqWithLlm, validateReading, readableFiles } from '../../src/lib/quoting/read';
const v = validateReading({
  parts: [
    { partNumber: 'a-1', description: 'Bracket', material: '6061 al', qty: 5, operations: ['Milling', 7, ''], weightLb: -3, notes: 'tol +/-0.001' },
    { description: 'No quantity', qty: null },
    { description: 'Fractional qty', qty: 2.5 },
    'garbage',
  ],
  dueDate: '2024-02-30',
  certifications: ['ITAR', 42],
});
assert.ok(v);
assert.equal(v!.parts.length, 1, 'only the part with a whole quantity is kept');
assert.equal(v!.parts[0].partNumber, 'A-1');
assert.equal(v!.parts[0].material, '6061-T6 ALUMINUM');
assert.deepEqual(v!.parts[0].operations, ['Milling']);
assert.equal(v!.parts[0].weightLb, null, 'a negative weight is dropped');
assert.equal(v!.dueDate, null, 'an impossible date is dropped');
assert.deepEqual(v!.certifications, ['ITAR']);
assert.equal(validateReading('nope'), null);
assert.equal(readableFiles([{ fileName: 'a.step', contentType: 'application/octet-stream', contentBase64: 'AAAA', fileSize: 3 }, { fileName: 'a.pdf', contentType: 'application/pdf', contentBase64: 'AAAA', fileSize: 3 }, { fileName: 'big.pdf', contentType: 'application/pdf', contentBase64: 'AAAA', fileSize: 9_000_000 }]).length, 1);
let seen: unknown = null;
const fake = { messages: { create: async (args: unknown) => { seen = args; return { content: [{ type: 'text', text: '{"parts":[{"partNumber":"X-9","description":"Pin","qty":3}],"dueDate":"2026-12-01","certifications":[]}' }] }; } } } as never;
(async () => {
const viaFake = await readRfqWithLlm('Quote please', [{ fileName: 'd.pdf', contentType: 'application/pdf', contentBase64: 'AAAA', fileSize: 3 }], fake);
assert.equal(viaFake?.parts[0].partNumber, 'X-9');
assert.equal(viaFake?.dueDate, '2026-12-01');
assert.ok(JSON.stringify(seen).includes('"type":"document"'), 'the PDF is shown to the model');
const broken = { messages: { create: async () => { throw new Error('boom'); } } } as never;
assert.equal(await readRfqWithLlm('x', [], broken), null, 'a model failure falls back, it does not throw');

console.log('all quoting rule checks passed');
})();
