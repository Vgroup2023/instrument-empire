import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { payrollEmployees, shifts, timeEntries, timeOffRequests, workforceSettings } from '@/db/schema';
import {
  ConflictError, NotFoundError, ValidationError, asRecord, isoDate, oneOf, optIsoDate, optText, optUuid, text, uuid,
} from '@/lib/validation';
import {
  addDays, dateInZone, grossMinutes, isTime, overtimeHours, paidHours, shiftMinutes, shiftsOverlap, timeInZone, weekDays, weekStart, zonedToUtc,
} from './time';
import {
  DEFAULT_MEAL_RULE, JOB_TITLE_BY_CODE, JOB_TITLES, PBJ_MAX_DAILY_HOURS, US_STATE_CODES, buildPbjXml, combineHourRows, overDailyLimit,
  pbjDayHours, quarterLabel, quarterRange, submissionDeadline, type PbjHourRow, type PbjQuarter,
} from './pbj';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface WorkforceSettings {
  facilityId: string;
  stateCode: string;
  timezone: string;
  mealDeductMinutes: number;
  mealThresholdHours: number;
}

export async function getSettings(): Promise<WorkforceSettings> {
  const [row] = await getDb().select().from(workforceSettings).where(eq(workforceSettings.id, 1));
  return {
    facilityId: row?.facilityId ?? '',
    stateCode: row?.stateCode ?? '',
    timezone: row?.timezone ?? 'America/New_York',
    mealDeductMinutes: row?.mealDeductMinutes ?? DEFAULT_MEAL_RULE.deductMinutes,
    mealThresholdHours: row ? Number(row.mealThresholdHours) : DEFAULT_MEAL_RULE.thresholdHours,
  };
}

function checkZone(zone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch {
    throw new ValidationError('That time zone is not recognised. Use a name like America/Chicago.');
  }
}

export async function saveSettings(input: unknown): Promise<WorkforceSettings> {
  const raw = asRecord(input, 'The settings');
  const facilityId = raw.facilityId === '' || raw.facilityId == null ? '' : text(raw.facilityId, 'Facility ID', { max: 16 }).replace(/\s+/g, '');
  if (facilityId && !/^[A-Za-z0-9]{1,16}$/.test(facilityId)) throw new ValidationError('The CMS certification number uses letters and numbers only.');
  const stateRaw = raw.stateCode === '' || raw.stateCode == null ? '' : text(raw.stateCode, 'State', { max: 2 }).toUpperCase();
  if (stateRaw && !(US_STATE_CODES as readonly string[]).includes(stateRaw)) throw new ValidationError('Pick a US state or territory code, like OH.');
  const timezone = text(raw.timezone ?? 'America/New_York', 'Time zone', { max: 60 });
  checkZone(timezone);
  const mealDeductMinutes = Math.trunc(Number(raw.mealDeductMinutes ?? 30));
  if (!(mealDeductMinutes >= 0 && mealDeductMinutes <= 120)) throw new ValidationError('The meal deduction must be 0 to 120 minutes.');
  const mealThresholdHours = Number(raw.mealThresholdHours ?? 6);
  if (!(mealThresholdHours >= 0 && mealThresholdHours <= 24)) throw new ValidationError('The shift length for a meal deduction must be 0 to 24 hours.');
  await getDb()
    .insert(workforceSettings)
    .values({ id: 1, facilityId: facilityId || null, stateCode: stateRaw || null, timezone, mealDeductMinutes, mealThresholdHours: String(mealThresholdHours) })
    .onConflictDoUpdate({
      target: workforceSettings.id,
      set: { facilityId: facilityId || null, stateCode: stateRaw || null, timezone, mealDeductMinutes, mealThresholdHours: String(mealThresholdHours), updatedAt: new Date() },
    });
  return getSettings();
}

// ---------------------------------------------------------------------------
// Staff: the fields the time clock and the PBJ report need on each employee
// ---------------------------------------------------------------------------

export interface StaffMember {
  id: string;
  name: string;
  jobTitle: string | null;
  status: 'active' | 'terminated' | 'pending';
  hiredDate: string;
  terminationDate: string | null;
  staffCode: string | null;
  pbjJobTitleCode: number | null;
  pbjPayTypeCode: number | null;
  hasPin: boolean;
}

function toStaff(r: typeof payrollEmployees.$inferSelect): StaffMember {
  return {
    id: r.id,
    name: r.displayName,
    jobTitle: r.jobTitle,
    status: r.status,
    hiredDate: r.hiredDate,
    terminationDate: r.terminationDate,
    staffCode: r.staffCode,
    pbjJobTitleCode: r.pbjJobTitleCode,
    pbjPayTypeCode: r.pbjPayTypeCode,
    hasPin: !!r.clockPinHash,
  };
}

export async function listStaff(): Promise<StaffMember[]> {
  const rows = await getDb().select().from(payrollEmployees).orderBy(asc(payrollEmployees.displayName)).limit(1000);
  return rows.map(toStaff);
}

const hashPin = (pin: string): string => {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pin, salt, 32).toString('hex')}`;
};

// Used when no one matches a staff ID, so a wrong ID takes as long to reject as a wrong PIN.
const DUMMY_HASH = hashPin('000000');

function checkPin(pin: string, stored: string | null): boolean {
  const [saltHex, hashHex] = (stored ?? DUMMY_HASH).split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(pin, Buffer.from(saltHex, 'hex'), 32);
  return timingSafeEqual(expected, actual) && stored !== null;
}

async function newStaffCode(): Promise<string> {
  const db = getDb();
  for (let i = 0; i < 20; i++) {
    const code = `S${String(100000 + (randomBytes(4).readUInt32BE() % 900000))}`;
    const [hit] = await db.select({ id: payrollEmployees.id }).from(payrollEmployees).where(eq(payrollEmployees.staffCode, code));
    if (!hit) return code;
  }
  throw new ConflictError('Could not make a unique staff ID. Please try again.');
}

export async function updateStaffSetup(id: string, input: unknown): Promise<StaffMember> {
  uuid(id, 'Employee');
  const raw = asRecord(input, 'The staff details');
  const patch: Partial<typeof payrollEmployees.$inferInsert> = { updatedAt: new Date() };
  if (raw.pbjJobTitleCode !== undefined) {
    if (raw.pbjJobTitleCode === null || raw.pbjJobTitleCode === '') patch.pbjJobTitleCode = null;
    else {
      const code = Number(raw.pbjJobTitleCode);
      if (!JOB_TITLE_BY_CODE.has(code)) throw new ValidationError('Pick a job title from the list.');
      patch.pbjJobTitleCode = code;
    }
  }
  if (raw.pbjPayTypeCode !== undefined) {
    if (raw.pbjPayTypeCode === null || raw.pbjPayTypeCode === '') patch.pbjPayTypeCode = null;
    else {
      const code = Number(raw.pbjPayTypeCode);
      if (![1, 2, 3].includes(code)) throw new ValidationError('Pick exempt, non-exempt or contract.');
      patch.pbjPayTypeCode = code;
    }
  }
  if (raw.terminationDate !== undefined) patch.terminationDate = raw.terminationDate ? isoDate(raw.terminationDate, 'Last day') : null;
  if (raw.pin !== undefined && raw.pin !== '') {
    const pin = String(raw.pin);
    if (!/^\d{4,8}$/.test(pin)) throw new ValidationError('A PIN is 4 to 8 digits.');
    patch.clockPinHash = hashPin(pin);
    patch.pinFailures = 0;
    patch.pinLockedUntil = null;
  }
  const db = getDb();
  const [current] = await db.select().from(payrollEmployees).where(eq(payrollEmployees.id, id));
  if (!current) throw new NotFoundError('Employee not found.');
  if (!current.staffCode) patch.staffCode = await newStaffCode();
  const [row] = await db.update(payrollEmployees).set(patch).where(eq(payrollEmployees.id, id)).returning();
  return toStaff(row);
}

// ---------------------------------------------------------------------------
// Time entries and timesheets
// ---------------------------------------------------------------------------

export interface TimeEntryView {
  id: string;
  employeeId: string;
  employeeName: string;
  workDate: string;
  clockIn: string;
  clockOut: string | null;
  /** Wall-clock times in the facility's time zone, for showing and editing. */
  startTime: string;
  endTime: string | null;
  mealMinutes: number;
  paidHours: number;
  jobTitleCode: number | null;
  source: string;
  approved: boolean;
  note: string | null;
}

function toEntryView(r: typeof timeEntries.$inferSelect, name: string, zone: string): TimeEntryView {
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName: name,
    workDate: r.workDate,
    clockIn: r.clockIn.toISOString(),
    clockOut: r.clockOut ? r.clockOut.toISOString() : null,
    startTime: timeInZone(r.clockIn, zone),
    endTime: r.clockOut ? timeInZone(r.clockOut, zone) : null,
    mealMinutes: r.mealMinutes,
    paidHours: paidHours(r.clockIn, r.clockOut, r.mealMinutes),
    jobTitleCode: r.jobTitleCode,
    source: r.source,
    approved: r.approved,
    note: r.note,
  };
}

const MAX_RANGE_DAYS = 100;

function rangeOf(from: string, to: string) {
  isoDate(from, 'From');
  isoDate(to, 'To');
  if (to < from) throw new ValidationError('The end date is before the start date.');
  if (Date.parse(to) - Date.parse(from) > MAX_RANGE_DAYS * 86_400_000) throw new ValidationError(`Pick a range of ${MAX_RANGE_DAYS} days or fewer.`);
}

export async function listEntries(from: string, to: string, employeeId?: string): Promise<TimeEntryView[]> {
  rangeOf(from, to);
  const zone = (await getSettings()).timezone;
  const where = [gte(timeEntries.workDate, from), lte(timeEntries.workDate, to)];
  if (employeeId) where.push(eq(timeEntries.employeeId, uuid(employeeId, 'Employee')));
  const rows = await getDb()
    .select({ e: timeEntries, name: payrollEmployees.displayName })
    .from(timeEntries)
    .innerJoin(payrollEmployees, eq(payrollEmployees.id, timeEntries.employeeId))
    .where(and(...where))
    .orderBy(asc(timeEntries.workDate), asc(timeEntries.clockIn))
    .limit(5000);
  return rows.map((r) => toEntryView(r.e, r.name, zone));
}

async function assertNoOverlap(employeeId: string, clockIn: Date, clockOut: Date | null, ignoreId?: string) {
  const end = clockOut ?? new Date(clockIn.getTime() + 60_000);
  const rows = await getDb()
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.employeeId, employeeId),
        gte(timeEntries.clockIn, new Date(clockIn.getTime() - 48 * 3_600_000)),
        lte(timeEntries.clockIn, new Date(end.getTime() + 48 * 3_600_000)),
      ),
    );
  for (const r of rows) {
    if (r.id === ignoreId) continue;
    const rEnd = r.clockOut ?? new Date(r.clockIn.getTime() + 60_000);
    if (clockIn < rEnd && r.clockIn < end) throw new ConflictError('This overlaps another time entry for the same person.');
  }
}

function parseMeal(v: unknown): number {
  const n = Math.trunc(Number(v ?? 0));
  if (!(n >= 0 && n <= 240)) throw new ValidationError('Meal break must be 0 to 240 minutes.');
  return n;
}

function parseJobCode(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const code = Number(v);
  if (!JOB_TITLE_BY_CODE.has(code)) throw new ValidationError('Pick a job title from the list.');
  return code;
}

/** A manager adds a shift that was worked: date, start and end as the wall clock shows at the facility. */
export async function createEntry(input: unknown): Promise<TimeEntryView> {
  const raw = asRecord(input, 'The time entry');
  const employeeId = uuid(raw.employeeId, 'Employee');
  const workDate = isoDate(raw.workDate, 'Date');
  const start = text(raw.startTime, 'Start time', { max: 5 });
  const end = raw.endTime ? text(raw.endTime, 'End time', { max: 5 }) : '';
  if (!isTime(start) || (end && !isTime(end))) throw new ValidationError('Times look like 07:00.');
  if (end === start) throw new ValidationError('The end time is the same as the start time.');
  const zone = (await getSettings()).timezone;
  const clockIn = zonedToUtc(workDate, start, zone);
  let clockOut: Date | null = null;
  if (end) {
    clockOut = zonedToUtc(end > start ? workDate : addDays(workDate, 1), end, zone);
    if (clockOut.getTime() - clockIn.getTime() > 24 * 3_600_000) throw new ValidationError('A shift cannot be longer than 24 hours.');
  }
  const mealMinutes = parseMeal(raw.mealMinutes);
  if (clockOut && mealMinutes * 60_000 > clockOut.getTime() - clockIn.getTime()) throw new ValidationError('The meal break is longer than the shift.');
  const db = getDb();
  const [emp] = await db.select().from(payrollEmployees).where(eq(payrollEmployees.id, employeeId));
  if (!emp) throw new NotFoundError('Employee not found.');
  await assertNoOverlap(employeeId, clockIn, clockOut);
  const [row] = await db
    .insert(timeEntries)
    .values({ employeeId, workDate, clockIn, clockOut, mealMinutes, jobTitleCode: parseJobCode(raw.jobTitleCode), source: 'manual', note: optText(raw.note, 'Note', 300) ?? null })
    .returning();
  return toEntryView(row, emp.displayName, zone);
}

/** Correct an entry. Changing it takes the approval off, so a changed shift is looked at again. */
export async function updateEntry(id: string, input: unknown): Promise<TimeEntryView> {
  uuid(id, 'Time entry');
  const raw = asRecord(input, 'The time entry');
  const db = getDb();
  const [cur] = await db.select().from(timeEntries).where(eq(timeEntries.id, id));
  if (!cur) throw new NotFoundError('Time entry not found.');
  const zone = (await getSettings()).timezone;
  const workDate = raw.workDate !== undefined ? isoDate(raw.workDate, 'Date') : cur.workDate;
  const start = raw.startTime !== undefined ? text(raw.startTime, 'Start time', { max: 5 }) : timeInZone(cur.clockIn, zone);
  const endRaw = raw.endTime !== undefined ? (raw.endTime ? text(raw.endTime, 'End time', { max: 5 }) : '') : cur.clockOut ? timeInZone(cur.clockOut, zone) : '';
  if (!isTime(start) || (endRaw && !isTime(endRaw))) throw new ValidationError('Times look like 07:00.');
  if (endRaw === start) throw new ValidationError('The end time is the same as the start time.');
  const clockIn = zonedToUtc(workDate, start, zone);
  const clockOut = endRaw ? zonedToUtc(endRaw > start ? workDate : addDays(workDate, 1), endRaw, zone) : null;
  if (clockOut && clockOut.getTime() - clockIn.getTime() > 24 * 3_600_000) throw new ValidationError('A shift cannot be longer than 24 hours.');
  const mealMinutes = raw.mealMinutes !== undefined ? parseMeal(raw.mealMinutes) : cur.mealMinutes;
  if (clockOut && mealMinutes * 60_000 > clockOut.getTime() - clockIn.getTime()) throw new ValidationError('The meal break is longer than the shift.');
  await assertNoOverlap(cur.employeeId, clockIn, clockOut, id);
  const [row] = await db
    .update(timeEntries)
    .set({
      workDate, clockIn, clockOut, mealMinutes,
      jobTitleCode: raw.jobTitleCode !== undefined ? parseJobCode(raw.jobTitleCode) : cur.jobTitleCode,
      note: raw.note !== undefined ? optText(raw.note, 'Note', 300) ?? null : cur.note,
      approved: false,
      updatedAt: new Date(),
    })
    .where(eq(timeEntries.id, id))
    .returning();
  const [emp] = await db.select({ n: payrollEmployees.displayName }).from(payrollEmployees).where(eq(payrollEmployees.id, row.employeeId));
  return toEntryView(row, emp?.n ?? '', zone);
}

export async function deleteEntry(id: string): Promise<void> {
  uuid(id, 'Time entry');
  const res = await getDb().delete(timeEntries).where(eq(timeEntries.id, id)).returning({ id: timeEntries.id });
  if (res.length === 0) throw new NotFoundError('Time entry not found.');
}

/** Approve (or take approval off) a list of entries. Entries still clocked in cannot be approved. */
export async function setApproved(ids: unknown, approved: boolean): Promise<number> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 1000) throw new ValidationError('Pick between 1 and 1000 entries.');
  const clean = ids.map((i) => uuid(i, 'Time entry'));
  const where = approved ? and(inArray(timeEntries.id, clean), isNotNull(timeEntries.clockOut)) : inArray(timeEntries.id, clean);
  const res = await getDb().update(timeEntries).set({ approved, updatedAt: new Date() }).where(where).returning({ id: timeEntries.id });
  return res.length;
}

export interface TimesheetRow {
  employeeId: string;
  name: string;
  payTypeCode: number | null;
  /** Paid hours for each of the seven days, Monday first. */
  days: number[];
  total: number;
  overtime: number;
  entries: number;
  unapproved: number;
  open: number;
}

export interface WeekSheet {
  weekStart: string;
  days: string[];
  rows: TimesheetRow[];
}

export async function weekTimesheet(date: string): Promise<WeekSheet> {
  const start = weekStart(isoDate(date, 'Date'));
  const days = weekDays(start);
  const [entries, staff] = await Promise.all([listEntries(start, days[6]), listStaff()]);
  const byId = new Map(staff.map((s) => [s.id, s]));
  const rows = new Map<string, TimesheetRow>();
  for (const e of entries) {
    const s = byId.get(e.employeeId);
    const row = rows.get(e.employeeId) ?? { employeeId: e.employeeId, name: e.employeeName, payTypeCode: s?.pbjPayTypeCode ?? null, days: [0, 0, 0, 0, 0, 0, 0], total: 0, overtime: 0, entries: 0, unapproved: 0, open: 0 };
    const i = days.indexOf(e.workDate);
    if (i >= 0) row.days[i] = Math.round((row.days[i] + e.paidHours) * 100) / 100;
    row.entries += 1;
    if (!e.approved) row.unapproved += 1;
    if (!e.clockOut) row.open += 1;
    rows.set(e.employeeId, row);
  }
  for (const r of rows.values()) {
    r.total = Math.round(r.days.reduce((a, b) => a + b, 0) * 100) / 100;
    r.overtime = overtimeHours(r.total, r.payTypeCode);
  }
  return { weekStart: start, days, rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

// ---------------------------------------------------------------------------
// The time clock (staff on their own phone: staff ID and PIN)
// ---------------------------------------------------------------------------

const MAX_PIN_FAILURES = 5;
const LOCK_MINUTES = 15;
/** A shift still open after this long is probably a forgotten clock out: a manager has to fix it. */
const STALE_OPEN_HOURS = 20;

export interface ClockResult {
  action: 'in' | 'out';
  name: string;
  at: string;
  /** Paid hours for the shift just ended, when clocking out. */
  shiftHours?: number;
  weekHours: number;
}

const BAD_LOGIN = 'That staff ID and PIN were not recognised.';

export async function clock(staffCodeRaw: unknown, pinRaw: unknown, mealMinutesRaw?: unknown): Promise<ClockResult> {
  const staffCode = String(staffCodeRaw ?? '').trim().toUpperCase();
  const pin = String(pinRaw ?? '').trim();
  if (!/^[A-Z0-9]{3,20}$/.test(staffCode) || !/^\d{4,8}$/.test(pin)) throw new ValidationError(BAD_LOGIN);
  const db = getDb();
  const [emp] = await db.select().from(payrollEmployees).where(eq(payrollEmployees.staffCode, staffCode));
  if (emp?.pinLockedUntil && emp.pinLockedUntil > new Date()) {
    throw new ConflictError(`Too many wrong PINs. Try again in ${Math.ceil((emp.pinLockedUntil.getTime() - Date.now()) / 60_000)} minutes, or ask a manager to reset it.`);
  }
  const ok = checkPin(pin, emp?.clockPinHash ?? null);
  if (!emp || !ok) {
    if (emp) {
      const failures = emp.pinFailures + 1;
      await db
        .update(payrollEmployees)
        .set({ pinFailures: failures >= MAX_PIN_FAILURES ? 0 : failures, pinLockedUntil: failures >= MAX_PIN_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
        .where(eq(payrollEmployees.id, emp.id));
    }
    throw new ValidationError(BAD_LOGIN);
  }
  if (emp.status !== 'active') throw new ConflictError('This staff record is not active. Please see a manager.');
  if (emp.pinFailures > 0) await db.update(payrollEmployees).set({ pinFailures: 0 }).where(eq(payrollEmployees.id, emp.id));

  const settings = await getSettings();
  const now = new Date();
  const [open] = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.employeeId, emp.id), isNull(timeEntries.clockOut)))
    .orderBy(desc(timeEntries.clockIn))
    .limit(1);

  let action: 'in' | 'out';
  let shiftHours: number | undefined;
  if (open) {
    if (now.getTime() - open.clockIn.getTime() > STALE_OPEN_HOURS * 3_600_000) {
      throw new ConflictError(`Your shift from ${open.workDate} is still open. Please ask a manager to fix it before clocking in.`);
    }
    const meal = mealMinutesRaw === undefined || mealMinutesRaw === '' ? open.mealMinutes : parseMeal(mealMinutesRaw);
    if (meal * 60_000 > now.getTime() - open.clockIn.getTime()) throw new ValidationError('The meal break is longer than your shift.');
    await db.update(timeEntries).set({ clockOut: now, mealMinutes: meal, updatedAt: now }).where(eq(timeEntries.id, open.id));
    action = 'out';
    shiftHours = paidHours(open.clockIn, now, meal);
  } else {
    try {
      await db.insert(timeEntries).values({ employeeId: emp.id, workDate: dateInZone(now, settings.timezone), clockIn: now, source: 'clock' });
    } catch (err) {
      // Two taps at once: the other one already clocked this person in.
      if ((err as { code?: string; cause?: { code?: string } }).code === '23505' || (err as { cause?: { code?: string } }).cause?.code === '23505') {
        throw new ConflictError('You were just clocked in. Check again in a moment.');
      }
      throw err;
    }
    action = 'in';
  }
  const wk = weekStart(dateInZone(now, settings.timezone));
  const week = await listEntries(wk, addDays(wk, 6), emp.id);
  const weekHours = Math.round(week.reduce((a, e) => a + e.paidHours, 0) * 100) / 100;
  return { action, name: emp.displayName, at: now.toISOString(), shiftHours, weekHours };
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export interface ShiftView {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  shiftDate: string;
  startTime: string;
  endTime: string;
  hours: number;
  jobTitleCode: number | null;
  location: string | null;
  note: string | null;
  /** Things worth a look: approved time off that day, or a long week. */
  warnings: string[];
}

const hhmm = (t: string) => t.slice(0, 5);

export async function listShifts(from: string, to: string): Promise<ShiftView[]> {
  rangeOf(from, to);
  const db = getDb();
  const [rows, off] = await Promise.all([
    db
      .select({ s: shifts, name: payrollEmployees.displayName })
      .from(shifts)
      .leftJoin(payrollEmployees, eq(payrollEmployees.id, shifts.employeeId))
      .where(and(gte(shifts.shiftDate, from), lte(shifts.shiftDate, to)))
      .orderBy(asc(shifts.shiftDate), asc(shifts.startTime))
      .limit(5000),
    db
      .select()
      .from(timeOffRequests)
      .where(and(eq(timeOffRequests.status, 'approved'), lte(timeOffRequests.startDate, to), gte(timeOffRequests.endDate, from))),
  ]);
  const out: ShiftView[] = rows.map((r) => {
    const warnings: string[] = [];
    if (r.s.employeeId && off.some((o) => o.employeeId === r.s.employeeId && o.startDate <= r.s.shiftDate && o.endDate >= r.s.shiftDate)) {
      warnings.push('Approved time off this day');
    }
    return {
      id: r.s.id,
      employeeId: r.s.employeeId,
      employeeName: r.name ?? null,
      shiftDate: r.s.shiftDate,
      startTime: hhmm(r.s.startTime),
      endTime: hhmm(r.s.endTime),
      hours: Math.round((shiftMinutes(hhmm(r.s.startTime), hhmm(r.s.endTime)) / 60) * 100) / 100,
      jobTitleCode: r.s.jobTitleCode,
      location: r.s.location,
      note: r.s.note,
      warnings,
    };
  });
  // A long week is worth a flag: planned hours over 40 for the same person in one Monday to Sunday week.
  const perWeek = new Map<string, number>();
  for (const s of out) if (s.employeeId) perWeek.set(`${s.employeeId}|${weekStart(s.shiftDate)}`, (perWeek.get(`${s.employeeId}|${weekStart(s.shiftDate)}`) ?? 0) + s.hours);
  for (const s of out) {
    const total = s.employeeId ? perWeek.get(`${s.employeeId}|${weekStart(s.shiftDate)}`) ?? 0 : 0;
    if (total > 40) s.warnings.push(`Planned ${Math.round(total * 10) / 10} hours this week`);
  }
  return out;
}

async function assertShiftFree(employeeId: string, date: string, start: string, end: string, ignoreId?: string) {
  const near = await getDb()
    .select()
    .from(shifts)
    .where(and(eq(shifts.employeeId, employeeId), gte(shifts.shiftDate, addDays(date, -1)), lte(shifts.shiftDate, addDays(date, 1))));
  for (const o of near) {
    if (o.id === ignoreId) continue;
    if (shiftsOverlap({ date, start, end }, { date: o.shiftDate, start: hhmm(o.startTime), end: hhmm(o.endTime) })) {
      throw new ConflictError(`This overlaps another shift for the same person (${o.shiftDate} ${hhmm(o.startTime)} to ${hhmm(o.endTime)}).`);
    }
  }
}

function parseShift(raw: Record<string, unknown>) {
  const start = text(raw.startTime, 'Start time', { max: 5 });
  const end = text(raw.endTime, 'End time', { max: 5 });
  if (!isTime(start) || !isTime(end)) throw new ValidationError('Times look like 07:00.');
  if (start === end) throw new ValidationError('A shift needs a start and a different end.');
  if (shiftMinutes(start, end) > 16 * 60) throw new ValidationError('A planned shift cannot be longer than 16 hours.');
  return { start, end };
}

export async function createShift(input: unknown): Promise<void> {
  const raw = asRecord(input, 'The shift');
  const employeeId = optUuid(raw.employeeId, 'Employee') ?? null;
  const date = isoDate(raw.shiftDate, 'Date');
  const { start, end } = parseShift(raw);
  const db = getDb();
  if (employeeId) {
    const [emp] = await db.select({ id: payrollEmployees.id, s: payrollEmployees.status }).from(payrollEmployees).where(eq(payrollEmployees.id, employeeId));
    if (!emp) throw new NotFoundError('Employee not found.');
    if (emp.s === 'terminated') throw new ConflictError('This person is no longer employed.');
    await assertShiftFree(employeeId, date, start, end);
  }
  await db.insert(shifts).values({
    employeeId, shiftDate: date, startTime: start, endTime: end,
    jobTitleCode: parseJobCode(raw.jobTitleCode),
    location: optText(raw.location, 'Location', 80) ?? null,
    note: optText(raw.note, 'Note', 300) ?? null,
  });
}

export async function updateShift(id: string, input: unknown): Promise<void> {
  uuid(id, 'Shift');
  const raw = asRecord(input, 'The shift');
  const db = getDb();
  const [cur] = await db.select().from(shifts).where(eq(shifts.id, id));
  if (!cur) throw new NotFoundError('Shift not found.');
  const employeeId = raw.employeeId !== undefined ? optUuid(raw.employeeId, 'Employee') ?? null : cur.employeeId;
  const date = raw.shiftDate !== undefined ? isoDate(raw.shiftDate, 'Date') : cur.shiftDate;
  const { start, end } = parseShift({ startTime: raw.startTime ?? hhmm(cur.startTime), endTime: raw.endTime ?? hhmm(cur.endTime) });
  if (employeeId) await assertShiftFree(employeeId, date, start, end, id);
  await db
    .update(shifts)
    .set({
      employeeId, shiftDate: date, startTime: start, endTime: end,
      jobTitleCode: raw.jobTitleCode !== undefined ? parseJobCode(raw.jobTitleCode) : cur.jobTitleCode,
      location: raw.location !== undefined ? optText(raw.location, 'Location', 80) ?? null : cur.location,
      note: raw.note !== undefined ? optText(raw.note, 'Note', 300) ?? null : cur.note,
      updatedAt: new Date(),
    })
    .where(eq(shifts.id, id));
}

export async function deleteShift(id: string): Promise<void> {
  uuid(id, 'Shift');
  const res = await getDb().delete(shifts).where(eq(shifts.id, id)).returning({ id: shifts.id });
  if (res.length === 0) throw new NotFoundError('Shift not found.');
}

/** Copy one week's shifts onto another week. Shifts that would clash with one already there are skipped. */
export async function copyWeek(fromWeek: unknown, toWeek: unknown): Promise<{ copied: number; skipped: number }> {
  const from = weekStart(isoDate(fromWeek, 'From week'));
  const to = weekStart(isoDate(toWeek, 'To week'));
  if (from === to) throw new ValidationError('Pick a different week to copy to.');
  const source = await getDb().select().from(shifts).where(and(gte(shifts.shiftDate, from), lte(shifts.shiftDate, addDays(from, 6))));
  const offset = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
  let copied = 0;
  let skipped = 0;
  for (const s of source) {
    const date = addDays(s.shiftDate, offset);
    try {
      if (s.employeeId) await assertShiftFree(s.employeeId, date, hhmm(s.startTime), hhmm(s.endTime));
      await getDb().insert(shifts).values({ employeeId: s.employeeId, shiftDate: date, startTime: s.startTime, endTime: s.endTime, jobTitleCode: s.jobTitleCode, location: s.location, note: s.note });
      copied += 1;
    } catch (err) {
      if (err instanceof ConflictError) skipped += 1;
      else throw err;
    }
  }
  return { copied, skipped };
}

// ---------------------------------------------------------------------------
// Time off
// ---------------------------------------------------------------------------

const TIME_OFF_KINDS = ['vacation', 'sick', 'personal', 'other'] as const;
const TIME_OFF_STATUSES = ['pending', 'approved', 'denied'] as const;

export interface TimeOffView {
  id: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  kind: string;
  status: string;
  note: string | null;
}

export async function listTimeOff(from: string, to: string): Promise<TimeOffView[]> {
  rangeOf(from, to);
  const rows = await getDb()
    .select({ r: timeOffRequests, name: payrollEmployees.displayName })
    .from(timeOffRequests)
    .innerJoin(payrollEmployees, eq(payrollEmployees.id, timeOffRequests.employeeId))
    .where(and(lte(timeOffRequests.startDate, to), gte(timeOffRequests.endDate, from)))
    .orderBy(asc(timeOffRequests.startDate))
    .limit(1000);
  return rows.map((x) => ({ id: x.r.id, employeeId: x.r.employeeId, employeeName: x.name, startDate: x.r.startDate, endDate: x.r.endDate, kind: x.r.kind, status: x.r.status, note: x.r.note }));
}

export async function createTimeOff(input: unknown): Promise<void> {
  const raw = asRecord(input, 'The request');
  const employeeId = uuid(raw.employeeId, 'Employee');
  const startDate = isoDate(raw.startDate, 'First day');
  const endDate = optIsoDate(raw.endDate, 'Last day') ?? startDate;
  if (endDate < startDate) throw new ValidationError('The last day is before the first day.');
  if (Date.parse(endDate) - Date.parse(startDate) > 365 * 86_400_000) throw new ValidationError('Time off cannot run longer than a year.');
  const db = getDb();
  const [emp] = await db.select({ id: payrollEmployees.id }).from(payrollEmployees).where(eq(payrollEmployees.id, employeeId));
  if (!emp) throw new NotFoundError('Employee not found.');
  await db.insert(timeOffRequests).values({
    employeeId, startDate, endDate,
    kind: oneOf(raw.kind ?? 'vacation', 'Type', TIME_OFF_KINDS),
    status: raw.status === undefined ? 'pending' : oneOf(raw.status, 'Status', TIME_OFF_STATUSES),
    note: optText(raw.note, 'Note', 300) ?? null,
  });
}

export async function setTimeOffStatus(id: string, status: unknown): Promise<void> {
  uuid(id, 'Request');
  const next = oneOf(status, 'Status', TIME_OFF_STATUSES);
  const res = await getDb().update(timeOffRequests).set({ status: next, updatedAt: new Date() }).where(eq(timeOffRequests.id, id)).returning({ id: timeOffRequests.id });
  if (res.length === 0) throw new NotFoundError('Request not found.');
}

export async function deleteTimeOff(id: string): Promise<void> {
  uuid(id, 'Request');
  await getDb().delete(timeOffRequests).where(eq(timeOffRequests.id, id));
}

// ---------------------------------------------------------------------------
// Payroll Based Journal
// ---------------------------------------------------------------------------

export interface PbjIssue {
  level: 'error' | 'warning';
  message: string;
}

export interface PbjPreview {
  quarter: PbjQuarter;
  label: string;
  start: string;
  end: string;
  deadline: string;
  rows: PbjHourRow[];
  totalHours: number;
  staffCount: number;
  byJobTitle: { code: number; title: string; category: string; hours: number }[];
  issues: PbjIssue[];
  /** No errors: the file can be sent to CMS as it is. */
  ready: boolean;
}

interface PbjData {
  preview: PbjPreview;
  employees: { staffCode: string; hireDate: string | null; terminationDate: string | null }[];
  settings: WorkforceSettings;
}

/** Quarter data comes from approved, finished time entries only: never from the schedule. */
async function loadPbj(quarter: PbjQuarter): Promise<PbjData> {
  const { start, end } = quarterRange(quarter);
  const settings = await getSettings();
  const rule = { deductMinutes: settings.mealDeductMinutes, thresholdHours: settings.mealThresholdHours };
  const db = getDb();
  // A shift that starts the day before the quarter can run into it; include one extra day on each side.
  const rows = await db
    .select({ e: timeEntries, emp: payrollEmployees })
    .from(timeEntries)
    .innerJoin(payrollEmployees, eq(payrollEmployees.id, timeEntries.employeeId))
    .where(and(gte(timeEntries.workDate, addDays(start, -1)), lte(timeEntries.workDate, end)))
    .limit(200_000);

  const issues: PbjIssue[] = [];
  const hourRows: PbjHourRow[] = [];
  const empInfo = new Map<string, { staffCode: string; hireDate: string | null; terminationDate: string | null }>();
  const missingSetup = new Set<string>();
  let unapproved = 0;
  let open = 0;
  for (const { e, emp } of rows) {
    if (!e.clockOut) {
      if (e.workDate >= start) open += 1;
      continue;
    }
    const code = e.jobTitleCode ?? emp.pbjJobTitleCode;
    const pay = emp.pbjPayTypeCode;
    const parts = pbjDayHours(e.clockIn, e.clockOut, e.mealMinutes, settings.timezone, rule).filter((p) => p.date >= start && p.date <= end && p.hours > 0);
    if (parts.length === 0) continue;
    if (!e.approved) {
      unapproved += 1;
      continue;
    }
    if (!emp.staffCode || !code || !pay) {
      missingSetup.add(emp.displayName);
      continue;
    }
    for (const p of parts) hourRows.push({ staffCode: emp.staffCode, date: p.date, jobTitleCode: code, payTypeCode: pay, hours: p.hours });
    empInfo.set(emp.staffCode, { staffCode: emp.staffCode, hireDate: emp.hiredDate, terminationDate: emp.terminationDate });
  }

  if (!settings.facilityId) issues.push({ level: 'error', message: 'Add the facility CMS certification number in Settings below.' });
  if (!settings.stateCode) issues.push({ level: 'error', message: 'Add the facility state in Settings below.' });
  if (missingSetup.size > 0) issues.push({ level: 'error', message: `Set a staff ID, job title and pay type for: ${[...missingSetup].slice(0, 8).join(', ')}${missingSetup.size > 8 ? ` and ${missingSetup.size - 8} more` : ''}. Their hours are left out until you do.` });
  if (unapproved > 0) issues.push({ level: 'error', message: `${unapproved} time ${unapproved === 1 ? 'entry is' : 'entries are'} not approved yet and ${unapproved === 1 ? 'is' : 'are'} left out. Approve them in Time & attendance.` });
  if (open > 0) issues.push({ level: 'error', message: `${open} time ${open === 1 ? 'entry has' : 'entries have'} no clock out. Fix ${open === 1 ? 'it' : 'them'} in Time & attendance.` });

  const combined = combineHourRows(hourRows);
  for (const o of overDailyLimit(combined)) {
    issues.push({ level: 'error', message: `${o.staffCode} has ${o.hours} hours on ${o.date}. CMS rejects more than ${PBJ_MAX_DAILY_HOURS} hours for one person in a day.` });
  }
  const optionalUsed = new Set(combined.filter((r) => JOB_TITLE_BY_CODE.get(r.jobTitleCode)?.optional).map((r) => JOB_TITLE_BY_CODE.get(r.jobTitleCode)!.title));
  if (optionalUsed.size > 0) issues.push({ level: 'warning', message: `CMS treats these job titles as optional: ${[...optionalUsed].join(', ')}. They are included.` });
  if (combined.length === 0) issues.push({ level: 'error', message: 'There are no approved hours in this quarter.' });

  const byCode = new Map<number, number>();
  for (const r of combined) byCode.set(r.jobTitleCode, Math.round(((byCode.get(r.jobTitleCode) ?? 0) + r.hours) * 100) / 100);
  const byJobTitle = JOB_TITLES.filter((j) => byCode.has(j.code)).map((j) => ({ code: j.code, title: j.title, category: j.category, hours: byCode.get(j.code)! }));
  const totalHours = Math.round(combined.reduce((a, r) => a + r.hours, 0) * 100) / 100;
  const preview: PbjPreview = {
    quarter, label: quarterLabel(quarter), start, end, deadline: submissionDeadline(quarter),
    rows: combined, totalHours, staffCount: new Set(combined.map((r) => r.staffCode)).size, byJobTitle, issues,
    ready: !issues.some((i) => i.level === 'error'),
  };
  return { preview, employees: [...empInfo.values()], settings };
}

export async function pbjPreview(quarter: PbjQuarter): Promise<PbjPreview> {
  const { preview } = await loadPbj(quarter);
  return { ...preview, rows: preview.rows.slice(0, 0) }; // the page needs the totals, not every row
}

export async function pbjFile(quarter: PbjQuarter, processType: 'replace' | 'merge'): Promise<{ xml: string; filename: string; ready: boolean; issues: PbjIssue[] }> {
  const { preview, employees, settings } = await loadPbj(quarter);
  const xml = buildPbjXml({
    facilityId: settings.facilityId || 'MISSING',
    stateCode: settings.stateCode || 'OH',
    quarter,
    employees,
    rows: preview.rows,
    processType,
    software: { vendor: 'GloblexAI', product: 'GloblexAI Office ERP' },
  });
  return { xml, filename: `PBJ_${settings.facilityId || 'facility'}_FY${quarter.fiscalYear}_Q${quarter.quarter}.xml`, ready: preview.ready, issues: preview.issues };
}

export function parseQuarter(fy: unknown, q: unknown): PbjQuarter {
  const fiscalYear = Math.trunc(Number(fy));
  const quarter = Math.trunc(Number(q));
  if (!(fiscalYear >= 2016 && fiscalYear <= 2100) || ![1, 2, 3, 4].includes(quarter)) throw new ValidationError('Pick a fiscal year and quarter 1 to 4.');
  return { fiscalYear, quarter: quarter as 1 | 2 | 3 | 4 };
}
