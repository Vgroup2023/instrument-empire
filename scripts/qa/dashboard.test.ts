// Tests for the master dashboard's calculations. Run: npx tsx scripts/qa/dashboard.test.ts
import assert from 'node:assert/strict';
import { pctChange, timeAgo } from '../../src/lib/dashboard/overview';
import { compact, niceMax } from '../../src/components/dashboard/overview/Charts';

// percent change against last month: nothing to compare with gives no percent, never a divide by zero
assert.equal(pctChange(150, 100), 50);
assert.equal(pctChange(50, 100), -50);
assert.equal(pctChange(10, 0), null);
assert.equal(pctChange(0, 0), null);
assert.equal(pctChange(105, 100), 5);
assert.equal(pctChange(2_098_029.66, 3_208_336.2), -34.6);

// round axis limits and short money labels
assert.equal(niceMax(0), 1);
assert.equal(niceMax(3_729_942), 5_000_000);
assert.equal(niceMax(950), 1000);
assert.equal(niceMax(1200), 2000);
assert.equal(niceMax(2300), 2500);
assert.equal(compact(0), '$0');
assert.equal(compact(950), '$950');
assert.equal(compact(1_500), '$1.5K');
assert.equal(compact(12_000), '$12K');
assert.equal(compact(2_500_000), '$2.5M');

// how long ago, from the database's own timestamp text
const now = Date.parse('2026-10-26T12:00:00Z');
assert.equal(timeAgo('2026-10-26 11:59:40+00', now), 'just now');
assert.equal(timeAgo('2026-10-26 11:55:00+00', now), '5m ago');
assert.equal(timeAgo('2026-10-26 09:00:00+00', now), '3h ago');
assert.equal(timeAgo('2026-10-24 12:00:00.123456+00', now), '2d ago');
assert.match(timeAgo('2026-09-01 12:00:00+00', now), /^Sep 1$/);
assert.equal(timeAgo('not a date', now), '');

console.log('dashboard: ok');
