// Pure helpers for time and attendance and scheduling: no database, so they can be tested alone.
// Dates are 'YYYY-MM-DD' strings and times are 'HH:MM', both in the facility's own time zone.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIso(date: string): { y: number; m: number; d: number } {
  const m = ISO.exec(date);
  if (!m) throw new Error(`Not a date: ${date}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parseIso(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = parseIso(from);
  const b = parseIso(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** The Monday on or before this date. Weeks run Monday to Sunday here. */
export function weekStart(date: string): string {
  const { y, m, d } = parseIso(date);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** How far the zone is ahead of UTC at this instant, in minutes. */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The instant when the wall clock in `timeZone` reads this date and time. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const { y, m, d } = parseIso(date);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes settle the offset even across a daylight saving change.
  let t = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  t = guess - offsetMinutes(new Date(t), timeZone) * 60_000;
  return new Date(t);
}

/** The calendar date at this instant in `timeZone`. */
export function dateInZone(at: Date, timeZone: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  return p; // en-CA formats as YYYY-MM-DD
}

/** 'HH:MM' on the wall clock in `timeZone`. */
export function timeInZone(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
}

export function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Length of a planned shift in minutes. An end at or before the start means it runs past midnight. */
export function shiftMinutes(start: string, end: string): number {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  return e > s ? e - s : e + 1440 - s;
}

/** Two planned shifts for the same person overlap in time (each is placed on the clock from its own date). */
export function shiftsOverlap(a: { date: string; start: string; end: string }, b: { date: string; start: string; end: string }): boolean {
  const range = (x: { date: string; start: string; end: string }) => {
    const base = daysBetween('2000-01-01', x.date) * 1440 + timeToMinutes(x.start);
    return [base, base + shiftMinutes(x.start, x.end)] as const;
  };
  const [as, ae] = range(a);
  const [bs, be] = range(b);
  return as < be && bs < ae;
}

/** Minutes between clock in and clock out, before any meal break. Zero while still clocked in. */
export function grossMinutes(clockIn: Date, clockOut: Date | null): number {
  if (!clockOut) return 0;
  return Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / 60_000));
}

/** Hours to pay for a time entry: the time between clock in and out, less the meal break actually taken. */
export function paidHours(clockIn: Date, clockOut: Date | null, mealMinutes: number): number {
  return Math.round((Math.max(0, grossMinutes(clockIn, clockOut) - mealMinutes) / 60) * 100) / 100;
}

export const OVERTIME_AFTER_HOURS = 40;

/** Hours over 40 in a week for a non-exempt employee (US federal rule). Exempt and contract staff have none. */
export function overtimeHours(weekHours: number, payTypeCode: number | null | undefined): number {
  if (payTypeCode !== 2) return 0;
  return Math.max(0, Math.round((weekHours - OVERTIME_AFTER_HOURS) * 100) / 100);
}

export function formatHours(h: number): string {
  return h.toFixed(2).replace(/\.?0+$/, '') || '0';
}
