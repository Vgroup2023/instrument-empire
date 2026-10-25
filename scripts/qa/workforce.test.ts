// Tests for time and attendance, scheduling and the Payroll Based Journal file. Run: npx tsx scripts/qa/workforce.test.ts
// The XML is checked against CMS's own schema (scripts/qa/fixtures/nhpbj_4_10_0.xsd) when xmllint is installed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addDays, dateInZone, daysBetween, overtimeHours, paidHours, shiftMinutes, shiftsOverlap, timeInZone, weekDays, weekStart, zonedToUtc,
} from '../../src/lib/workforce/time';
import {
  JOB_TITLES, PBJ_MAX_DAILY_HOURS, buildPbjXml, combineHourRows, overDailyLimit, pbjDayHours, pbjShiftHours, quarterOf, quarterRange, submissionDeadline,
  type PbjHourRow,
} from '../../src/lib/workforce/pbj';

// dates and weeks
assert.equal(addDays('2026-02-28', 1), '2026-03-01');
assert.equal(addDays('2024-02-28', 1), '2024-02-29');
assert.equal(daysBetween('2026-01-01', '2026-03-01'), 59);
assert.equal(weekStart('2026-10-25'), '2026-10-19', 'a Sunday belongs to the week that started the Monday before');
assert.equal(weekStart('2026-10-19'), '2026-10-19');
assert.deepEqual(weekDays('2026-10-19').slice(0, 2), ['2026-10-19', '2026-10-20']);

// time zones, including a daylight saving change (US clocks went back on 2026-11-01)
const nyIn = zonedToUtc('2026-07-01', '07:00', 'America/New_York');
assert.equal(nyIn.toISOString(), '2026-07-01T11:00:00.000Z', 'summer: UTC-4');
assert.equal(zonedToUtc('2026-12-01', '07:00', 'America/New_York').toISOString(), '2026-12-01T12:00:00.000Z', 'winter: UTC-5');
assert.equal(zonedToUtc('2026-07-01', '07:00', 'America/Los_Angeles').toISOString(), '2026-07-01T14:00:00.000Z');
assert.equal(dateInZone(new Date('2026-07-02T02:30:00Z'), 'America/New_York'), '2026-07-01', 'late evening in New York is still the 1st');
assert.equal(timeInZone(new Date('2026-07-02T02:30:00Z'), 'America/New_York'), '22:30');
const dstOut = zonedToUtc('2026-11-01', '23:00', 'America/New_York');
const dstIn = zonedToUtc('2026-11-01', '07:00', 'America/New_York');
assert.equal(dstOut.toISOString(), '2026-11-02T04:00:00.000Z');
assert.equal(dstIn.toISOString(), '2026-11-01T12:00:00.000Z');

// shifts
assert.equal(shiftMinutes('07:00', '15:30'), 510);
assert.equal(shiftMinutes('23:00', '07:00'), 480, 'overnight');
assert.equal(shiftsOverlap({ date: '2026-10-19', start: '07:00', end: '15:00' }, { date: '2026-10-19', start: '14:00', end: '22:00' }), true);
assert.equal(shiftsOverlap({ date: '2026-10-19', start: '07:00', end: '15:00' }, { date: '2026-10-19', start: '15:00', end: '23:00' }), false, 'back to back is fine');
assert.equal(shiftsOverlap({ date: '2026-10-19', start: '23:00', end: '07:00' }, { date: '2026-10-20', start: '06:00', end: '10:00' }), true, 'overnight into next morning');
assert.equal(shiftsOverlap({ date: '2026-10-19', start: '23:00', end: '07:00' }, { date: '2026-10-20', start: '07:00', end: '10:00' }), false);

// paid hours and overtime
const t = (h: number, m = 0) => new Date(Date.UTC(2026, 6, 1, h, m));
assert.equal(paidHours(t(7), t(15, 30), 30), 8);
assert.equal(paidHours(t(7), null, 0), 0, 'still clocked in');
assert.equal(paidHours(t(7), t(7, 10), 0), 0.17);
assert.equal(overtimeHours(44.5, 2), 4.5);
assert.equal(overtimeHours(44.5, 1), 0, 'salaried staff have no overtime');
assert.equal(overtimeHours(44.5, 3), 0, 'contract staff are paid by their agency');
assert.equal(overtimeHours(39, 2), 0);

// PBJ quarters follow the federal fiscal year (October to September)
assert.deepEqual(quarterOf('2026-10-01'), { fiscalYear: 2027, quarter: 1 });
assert.deepEqual(quarterOf('2026-12-31'), { fiscalYear: 2027, quarter: 1 });
assert.deepEqual(quarterOf('2027-01-01'), { fiscalYear: 2027, quarter: 2 });
assert.deepEqual(quarterOf('2027-03-31'), { fiscalYear: 2027, quarter: 2 });
assert.deepEqual(quarterOf('2027-06-30'), { fiscalYear: 2027, quarter: 3 });
assert.deepEqual(quarterOf('2027-07-01'), { fiscalYear: 2027, quarter: 4 });
assert.deepEqual(quarterOf('2027-09-30'), { fiscalYear: 2027, quarter: 4 });
assert.deepEqual(quarterRange({ fiscalYear: 2027, quarter: 1 }), { start: '2026-10-01', end: '2026-12-31' });
assert.deepEqual(quarterRange({ fiscalYear: 2026, quarter: 2 }), { start: '2026-01-01', end: '2026-03-31' });
// CMS: quarter 2 of 2026 (Jan to Mar) is due by the end of the 45th day, May 15
assert.equal(submissionDeadline({ fiscalYear: 2026, quarter: 2 }), '2026-05-15');
assert.equal(submissionDeadline({ fiscalYear: 2026, quarter: 4 }), '2026-11-14');

// CMS meal break examples (Policy Manual v2.8, section on meal breaks)
assert.equal(pbjShiftHours(8 * 60, 30), 7.5, '8 hour shift, 30 minute unpaid meal: 7.5');
assert.equal(pbjShiftHours(8 * 60, 0), 7.5, 'no break recorded: 30 minutes still come off');
assert.equal(pbjShiftHours(8.5 * 60, 30), 8);
assert.equal(pbjShiftHours(12 * 60, 30), 11.5);
assert.equal(pbjShiftHours(8 * 60, 45), 7.25, 'a 45 minute meal break comes off in full');
assert.equal(pbjShiftHours(4 * 60, 0), 4, 'a short shift keeps its hours');
assert.equal(pbjShiftHours(0, 0), 0);

// CMS: a shift from 11 PM to 7 AM gives 1 hour to the first day and 7 to the next (midnight is the cutoff)
const NY = 'America/New_York';
const night = pbjDayHours(zonedToUtc('2016-04-05', '23:00', NY), zonedToUtc('2016-04-06', '07:00', NY), 0, NY, { deductMinutes: 30, thresholdHours: 99 });
assert.deepEqual(night, [{ date: '2016-04-05', hours: 1 }, { date: '2016-04-06', hours: 7 }]);
const nightMeal = pbjDayHours(zonedToUtc('2016-04-05', '23:00', NY), zonedToUtc('2016-04-06', '07:00', NY), 30, NY);
assert.deepEqual(nightMeal, [{ date: '2016-04-05', hours: 1 }, { date: '2016-04-06', hours: 6.5 }], 'the meal comes off the day with most of the shift');
const day = pbjDayHours(zonedToUtc('2026-07-01', '07:00', NY), zonedToUtc('2026-07-01', '15:30', NY), 30, NY);
assert.deepEqual(day, [{ date: '2026-07-01', hours: 8 }], '8.5 hours on the clock less 30 minutes of meal');
// across the autumn clock change the shift is one hour longer than the clock suggests
const fall = pbjDayHours(zonedToUtc('2026-10-31', '23:00', NY), zonedToUtc('2026-11-01', '07:00', NY), 0, NY, { deductMinutes: 30, thresholdHours: 99 });
assert.deepEqual(fall, [{ date: '2026-10-31', hours: 1 }, { date: '2026-11-01', hours: 8 }]);
// 7 hours 33 minutes is 7.55, never 7.33
assert.equal(pbjDayHours(t(7), t(14, 33), 0, 'UTC', { deductMinutes: 30, thresholdHours: 99 })[0].hours, 7.55);

// rows for the same person, day and job are added up; zero rows dropped
const rows: PbjHourRow[] = [
  { staffCode: 'E2', date: '2026-07-01', jobTitleCode: 10, payTypeCode: 2, hours: 5.5 },
  { staffCode: 'E1', date: '2026-07-01', jobTitleCode: 7, payTypeCode: 1, hours: 7.5 },
  { staffCode: 'E1', date: '2026-07-01', jobTitleCode: 7, payTypeCode: 1, hours: 0.25 },
  { staffCode: 'E1', date: '2026-07-01', jobTitleCode: 5, payTypeCode: 1, hours: 1 },
  { staffCode: 'E3', date: '2026-07-01', jobTitleCode: 10, payTypeCode: 2, hours: 0 },
];
const combined = combineHourRows(rows);
assert.equal(combined.length, 3);
assert.equal(combined.find((r) => r.staffCode === 'E1' && r.jobTitleCode === 7)?.hours, 7.75);
assert.deepEqual(overDailyLimit(combined), []);
assert.equal(overDailyLimit([...combined, { staffCode: 'E2', date: '2026-07-01', jobTitleCode: 10, payTypeCode: 2, hours: 17.5 }]).length, 1, '23 hours in a day is over 22.5');
assert.equal(PBJ_MAX_DAILY_HOURS, 22.5);
assert.equal(JOB_TITLES.length, 40);
assert.equal(new Set(JOB_TITLES.map((j) => j.code)).size, 40);

// the XML
const xml = buildPbjXml({
  facilityId: '345678',
  stateCode: 'OH',
  quarter: { fiscalYear: 2026, quarter: 4 },
  employees: [
    { staffCode: 'E1', hireDate: '2019-03-04', terminationDate: null },
    { staffCode: 'E2', hireDate: null },
  ],
  rows: combined,
  software: { vendor: 'GloblexAI', product: 'Office ERP', version: '1.0' },
});
assert.ok(xml.includes('fileSpecVersion="4.10.0"'));
assert.ok(xml.includes('<hireDate>2019-03-04</hireDate>'));
assert.ok(!xml.includes('<terminationDate>'), 'an unknown optional date is left out, not blank');
assert.ok(!xml.includes('<employeeId>E3</employeeId>'), 'someone with no hours is not listed');
assert.ok(/<hours>7\.75<\/hours>/.test(xml));
assert.ok(xml.indexOf('<employees>') < xml.indexOf('<staffingHours'), 'sections are in CMS order');
assert.ok(xml.includes('processType="replace"'));
assert.ok(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(xml), 'plain ASCII only');
const odd = buildPbjXml({ facilityId: 'CCNé<1>', stateCode: 'OH', quarter: { fiscalYear: 2026, quarter: 4 }, employees: [], rows: [] });
assert.ok(odd.includes('<facilityId>CCNe&lt;1&gt;</facilityId>'), 'accents become plain letters and < is escaped');

// check the file against CMS's own schema
let validated = false;
try {
  const dir = mkdtempSync(join(tmpdir(), 'pbj-'));
  const file = join(dir, 'pbj.xml');
  writeFileSync(file, xml);
  execFileSync('xmllint', ['--noout', '--schema', 'scripts/qa/fixtures/nhpbj_4_10_0.xsd', file], { stdio: 'pipe' });
  validated = true;
  // and prove the schema really rejects a bad file (23 hours in one entry)
  const bad = join(dir, 'bad.xml');
  writeFileSync(bad, xml.replace('<hours>7.75</hours>', '<hours>23.00</hours>'));
  assert.throws(() => execFileSync('xmllint', ['--noout', '--schema', 'scripts/qa/fixtures/nhpbj_4_10_0.xsd', bad], { stdio: 'pipe' }), 'schema should reject more than 22.5 hours');
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === 'ENOENT') console.log('xmllint not installed: skipped checking against the CMS schema');
  else throw err;
}

async function database() {
  const { createEmployee } = await import('../../src/lib/accounting/payroll');
  const wf = await import('../../src/lib/workforce/service');
  const { getDb } = await import('../../src/db/client');
  const { ConflictError, ValidationError } = await import('../../src/lib/validation');
  const db = getDb();
  const mk = (displayName: string) => createEmployee({ displayName, hiredDate: '2020-02-03', basePay: { amount: 20, period: 'hourly' } });
  const rn = await mk('Rita Nurse');
  const cna = await mk('Carl Aide');
  const dir = await mk('Dana Director');

  // settings
  await assert.rejects(() => wf.saveSettings({ facilityId: 'AB-12', timezone: 'America/New_York' }), ValidationError, 'a CCN has letters and numbers only');
  await assert.rejects(() => wf.saveSettings({ facilityId: '345678', stateCode: 'ZZ' }), ValidationError, 'unknown state');
  await assert.rejects(() => wf.saveSettings({ facilityId: '345678', stateCode: 'OH', timezone: 'Mars/Base' }), ValidationError, 'unknown zone');
  const settings = await wf.saveSettings({ facilityId: '345678', stateCode: 'OH', timezone: 'America/New_York', mealDeductMinutes: 30, mealThresholdHours: 6 });
  assert.equal(settings.facilityId, '345678');

  // staff setup: staff ID made, PIN checked, codes checked
  await assert.rejects(() => wf.updateStaffSetup(rn.id, { pin: '12' }), ValidationError, 'short PIN');
  await assert.rejects(() => wf.updateStaffSetup(rn.id, { pbjJobTitleCode: 99 }), ValidationError, 'unknown job title');
  await assert.rejects(() => wf.updateStaffSetup(rn.id, { pbjPayTypeCode: 7 }), ValidationError, 'unknown pay type');
  const rnS = await wf.updateStaffSetup(rn.id, { pbjJobTitleCode: 7, pbjPayTypeCode: 2, pin: '4821' });
  const cnaS = await wf.updateStaffSetup(cna.id, { pbjJobTitleCode: 10, pbjPayTypeCode: 2, pin: '7351' });
  const dirS = await wf.updateStaffSetup(dir.id, { pbjJobTitleCode: 5, pbjPayTypeCode: 1, pin: '9034' });
  assert.match(rnS.staffCode ?? '', /^S\d{6}$/);
  assert.notEqual(rnS.staffCode, cnaS.staffCode);
  assert.ok(rnS.hasPin);
  assert.ok(!JSON.stringify(rnS).includes('scrypt') && !('clockPinHash' in rnS), 'the PIN hash never leaves the server');

  // manual entries: a day shift, an overnight shift, an overlap refused
  const day = await wf.createEntry({ employeeId: rn.id, workDate: '2026-01-05', startTime: '07:00', endTime: '15:30', mealMinutes: 30 });
  assert.equal(day.paidHours, 8);
  await assert.rejects(() => wf.createEntry({ employeeId: rn.id, workDate: '2026-01-05', startTime: '15:00', endTime: '19:00' }), ConflictError, 'overlap');
  await assert.rejects(() => wf.createEntry({ employeeId: rn.id, workDate: '2026-01-06', startTime: '07:00', endTime: '07:00' }), ValidationError, 'same start and end');
  const night = await wf.createEntry({ employeeId: cna.id, workDate: '2026-01-05', startTime: '23:00', endTime: '07:00', mealMinutes: 30 });
  assert.equal(night.paidHours, 7.5);
  assert.equal(night.workDate, '2026-01-05');
  await wf.createEntry({ employeeId: dir.id, workDate: '2026-01-06', startTime: '08:00', endTime: '16:30', mealMinutes: 30, jobTitleCode: 6 });
  await assert.rejects(() => wf.createEntry({ employeeId: rn.id, workDate: '2026-01-07', startTime: '07:00', endTime: '15:00', mealMinutes: 600 }), ValidationError, 'meal longer than shift');

  // timesheet: week of 2026-01-05, 40 hour rule applies to non-exempt only
  for (let d = 6; d <= 9; d++) await wf.createEntry({ employeeId: rn.id, workDate: `2026-01-0${d}`, startTime: '07:00', endTime: '15:30', mealMinutes: 30 });
  await wf.createEntry({ employeeId: rn.id, workDate: '2026-01-10', startTime: '07:00', endTime: '15:30', mealMinutes: 30 });
  const sheet = await wf.weekTimesheet('2026-01-08');
  assert.equal(sheet.weekStart, '2026-01-05');
  const rnRow = sheet.rows.find((r) => r.employeeId === rn.id)!;
  assert.equal(rnRow.total, 48, 'six 8 hour shifts');
  assert.equal(rnRow.overtime, 8);
  assert.equal(sheet.rows.find((r) => r.employeeId === dir.id)!.overtime, 0);

  // the report refuses until everything is approved
  const q = { fiscalYear: 2026, quarter: 2 as const };
  let pv = await wf.pbjPreview(q);
  assert.equal(pv.ready, false);
  assert.ok(pv.issues.some((i) => /not approved/.test(i.message)));
  const all = await wf.listEntries('2026-01-01', '2026-03-31');
  assert.equal(await wf.setApproved(all.map((e) => e.id), true), all.length);
  pv = await wf.pbjPreview(q);
  assert.equal(pv.ready, true, pv.issues.map((i) => i.message).join(' | '));
  // RN: 6 x 8 = 48. CNA: 23:00-07:00 with 30 minutes off the longer (7 hour) part = 1 + 6.5. Director: 8.5 - 0.5 = 8 under code 6.
  const hours = (code: number) => pv.byJobTitle.find((j) => j.code === code)?.hours;
  assert.equal(hours(7), 48);
  assert.equal(hours(10), 7.5);
  assert.equal(hours(6), 8, 'a shift worked under a different job title counts under that title');
  assert.equal(hours(5), undefined);
  assert.equal(pv.totalHours, 63.5);

  // the file validates against CMS's schema, midnight split included
  const file = await wf.pbjFile(q, 'replace');
  assert.ok(file.ready);
  assert.equal(file.filename, 'PBJ_345678_FY2026_Q2.xml');
  assert.ok(file.xml.includes('<date>2026-01-06</date>'), 'the overnight shift reaches the next day');
  const hasCna = new RegExp(`<employeeId>${cnaS.staffCode}</employeeId>[\\s\\S]*?<date>2026-01-05</date>[\\s\\S]*?<hours>1.00</hours>`).test(file.xml);
  assert.ok(hasCna, 'one hour on the first day for the overnight shift');
  try {
    const d = mkdtempSync(join(tmpdir(), 'pbj-db-'));
    writeFileSync(join(d, 'f.xml'), file.xml);
    execFileSync('xmllint', ['--noout', '--schema', 'scripts/qa/fixtures/nhpbj_4_10_0.xsd', join(d, 'f.xml')], { stdio: 'pipe' });
    console.log('database file validated against the CMS schema');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  // editing an approved entry takes the approval off, and the report notices
  const edited = await wf.updateEntry(day.id, { endTime: '16:00' });
  assert.equal(edited.approved, false);
  assert.equal((await wf.pbjPreview(q)).ready, false);
  await wf.setApproved([day.id], true);

  // an entry with no clock out blocks the report; an unset job title is named
  const open = await wf.createEntry({ employeeId: cna.id, workDate: '2026-02-02', startTime: '07:00', endTime: '' });
  assert.equal(open.endTime, null);
  assert.equal(await wf.setApproved([open.id], true), 0, 'cannot approve a shift still clocked in');
  assert.ok((await wf.pbjPreview(q)).issues.some((i) => /no clock out/.test(i.message)));
  await wf.deleteEntry(open.id);
  const noSetup = await mk('New Hire');
  const e2 = await wf.createEntry({ employeeId: noSetup.id, workDate: '2026-02-03', startTime: '07:00', endTime: '15:00', mealMinutes: 30 });
  await wf.setApproved([e2.id], true);
  assert.ok((await wf.pbjPreview(q)).issues.some((i) => /New Hire/.test(i.message)), 'names who needs a job title');

  // over 22.5 hours in a day is caught before CMS rejects the file
  // four back to back shifts under 6 hours each (no meal deduction) add up to 23.3 hours in one day
  const crammed = [];
  for (const [a, b] of [['00:00', '05:50'], ['05:50', '11:40'], ['11:40', '17:30'], ['17:30', '23:20']]) {
    crammed.push(await wf.createEntry({ employeeId: dir.id, workDate: '2026-02-10', startTime: a, endTime: b, mealMinutes: 0 }));
  }
  await wf.setApproved(crammed.map((c) => c.id), true);
  assert.ok((await wf.pbjPreview(q)).issues.some((i) => /22\.5/.test(i.message)));
  for (const c of crammed) await wf.deleteEntry(c.id);

  // the time clock
  await assert.rejects(() => wf.clock(rnS.staffCode, '0000'), /not recognised/);
  await assert.rejects(() => wf.clock('S000000', '4821'), /not recognised/, 'an unknown ID gives the same message as a wrong PIN');
  const inR = await wf.clock(rnS.staffCode, '4821');
  assert.equal(inR.action, 'in');
  const outR = await wf.clock(rnS.staffCode, '4821', 0);
  assert.equal(outR.action, 'out');
  assert.equal(outR.shiftHours, 0);
  await wf.clock(rnS.staffCode, '4821');
  const lastIn = await wf.listEntries(inR.at.slice(0, 10), inR.at.slice(0, 10));
  assert.ok(lastIn.some((e) => e.source === 'clock'));
  // five wrong PINs lock the person; a right PIN is refused while locked; a manager PIN reset unlocks
  for (let i = 0; i < 5; i++) await assert.rejects(() => wf.clock(cnaS.staffCode, '1111'), /not recognised/);
  await assert.rejects(() => wf.clock(cnaS.staffCode, '7351'), /Too many wrong PINs/);
  await wf.updateStaffSetup(cna.id, { pin: '7351' });
  assert.equal((await wf.clock(cnaS.staffCode, '7351')).action, 'in');
  // two taps at the same moment never leave two open shifts for one person
  const nhS = await wf.updateStaffSetup(noSetup.id, { pbjJobTitleCode: 9, pbjPayTypeCode: 2, pin: '5566' });
  await Promise.allSettled([wf.clock(nhS.staffCode, '5566'), wf.clock(nhS.staffCode, '5566')]);
  const nhOpen = (await wf.listEntries(inR.at.slice(0, 10), inR.at.slice(0, 10), noSetup.id)).filter((e) => !e.endTime);
  assert.ok(nhOpen.length <= 1, 'at most one open shift');

  // someone no longer employed cannot clock in
  const { payrollEmployees } = await import('../../src/db/schema');
  const { eq } = await import('drizzle-orm');
  await db.update(payrollEmployees).set({ status: 'terminated' }).where(eq(payrollEmployees.id, dir.id));
  await assert.rejects(() => wf.clock(dirS.staffCode, '9034'), /not active/);

  // scheduling: overlap refused, open shift, time off warning, copy week
  await wf.createShift({ employeeId: rn.id, shiftDate: '2026-03-02', startTime: '07:00', endTime: '15:30', jobTitleCode: 7, location: 'East wing' });
  await assert.rejects(() => wf.createShift({ employeeId: rn.id, shiftDate: '2026-03-02', startTime: '15:00', endTime: '23:00' }), ConflictError, 'overlap');
  await wf.createShift({ employeeId: rn.id, shiftDate: '2026-03-02', startTime: '15:30', endTime: '23:30' });
  await wf.createShift({ employeeId: rn.id, shiftDate: '2026-03-03', startTime: '23:00', endTime: '07:00' });
  await assert.rejects(() => wf.createShift({ employeeId: rn.id, shiftDate: '2026-03-04', startTime: '06:00', endTime: '07:30' }), ConflictError, 'overlaps the night shift that ends at 07:00');
  await wf.createShift({ employeeId: rn.id, shiftDate: '2026-03-04', startTime: '07:00', endTime: '09:00' });
  await wf.createShift({ employeeId: null, shiftDate: '2026-03-05', startTime: '07:00', endTime: '15:00' });
  await assert.rejects(() => wf.createShift({ employeeId: rn.id, shiftDate: '2026-03-06', startTime: '07:00', endTime: '07:00' }), ValidationError);
  await assert.rejects(() => wf.createShift({ employeeId: rn.id, shiftDate: '2026-03-06', startTime: '06:00', endTime: '23:30' }), ValidationError, 'over 16 hours');
  await wf.createTimeOff({ employeeId: rn.id, startDate: '2026-03-03', endDate: '2026-03-03', kind: 'sick', status: 'approved' });
  const week = await wf.listShifts('2026-03-02', '2026-03-08');
  assert.equal(week.length, 5, 'two on the 2nd, the night shift, the morning after, and the open shift');
  assert.ok(week.find((s) => s.shiftDate === '2026-03-03')!.warnings.includes('Approved time off this day'));
  assert.equal(week.find((s) => s.employeeId === null)?.employeeName, null, 'an open shift has nobody');
  const copy = await wf.copyWeek('2026-03-02', '2026-03-09');
  assert.equal(copy.copied, 5);
  const copy2 = await wf.copyWeek('2026-03-02', '2026-03-09');
  assert.ok(copy2.skipped >= 3, 'copying twice skips what would clash');
  await assert.rejects(() => wf.listShifts('2020-01-01', '2026-01-01'), ValidationError, 'a range over 100 days');

  console.log('workforce database checks: ok');
  process.exit(0);
}

console.log(`workforce: ok${validated ? ' (PBJ file valid against CMS nhpbj_4_10_0.xsd)' : ''}`);

if (process.env.DATABASE_URL) database().catch((e) => { console.error(e); process.exit(1); });
