// Payroll Based Journal (PBJ): the staffing report US nursing homes send to CMS every quarter.
// Built from CMS PBJ Data Submission Specifications v4.10.0 (the XSD nhpbj_4_10_0.xsd) and the PBJ Policy
// Manual v2.8. Everything here is pure, so the file can be built and checked without a database.

import { addDays, dateInZone, zonedToUtc } from './time';

export const PBJ_FILE_SPEC_VERSION = '4.10.0';
/** Most hours CMS accepts for one employee on one day (CMS Policy Manual, meal break policy). */
export const PBJ_MAX_DAILY_HOURS = 22.5;

export interface JobTitle {
  code: number;
  title: string;
  category: string;
  /** CMS marks these job titles optional: reporting them is allowed but not required. */
  optional?: boolean;
}

// CMS PBJ Policy Manual v2.8, Appendix B (labor categories and job title codes).
export const JOB_TITLES: JobTitle[] = [
  { code: 1, title: 'Administrator', category: 'Administration' },
  { code: 2, title: 'Medical Director', category: 'Physician services' },
  { code: 3, title: 'Other Physician', category: 'Physician services' },
  { code: 4, title: 'Physician Assistant', category: 'Physician services' },
  { code: 5, title: 'Registered Nurse Director of Nursing', category: 'Nursing services' },
  { code: 6, title: 'Registered Nurse with Administrative Duties', category: 'Nursing services' },
  { code: 7, title: 'Registered Nurse', category: 'Nursing services' },
  { code: 8, title: 'Licensed Practical/Vocational Nurse with Administrative Duties', category: 'Nursing services' },
  { code: 9, title: 'Licensed Practical/Vocational Nurse', category: 'Nursing services' },
  { code: 10, title: 'Certified Nurse Aide', category: 'Nursing services' },
  { code: 11, title: 'Nurse Aide in Training', category: 'Nursing services' },
  { code: 12, title: 'Medication Aide/Technician', category: 'Nursing services' },
  { code: 13, title: 'Nurse Practitioner', category: 'Physician services' },
  { code: 14, title: 'Clinical Nurse Specialist', category: 'Nursing services' },
  { code: 15, title: 'Pharmacist', category: 'Pharmacy services' },
  { code: 16, title: 'Dietitian', category: 'Dietary services' },
  { code: 17, title: 'Feeding Assistant', category: 'Dietary services' },
  { code: 18, title: 'Occupational Therapist', category: 'Therapeutic services' },
  { code: 19, title: 'Occupational Therapy Assistant', category: 'Therapeutic services' },
  { code: 20, title: 'Occupational Therapy Aide', category: 'Therapeutic services' },
  { code: 21, title: 'Physical Therapist', category: 'Therapeutic services' },
  { code: 22, title: 'Physical Therapy Assistant', category: 'Therapeutic services' },
  { code: 23, title: 'Physical Therapy Aide', category: 'Therapeutic services' },
  { code: 24, title: 'Respiratory Therapist', category: 'Therapeutic services' },
  { code: 25, title: 'Respiratory Therapy Technician', category: 'Therapeutic services' },
  { code: 26, title: 'Speech/Language Pathologist', category: 'Therapeutic services' },
  { code: 27, title: 'Therapeutic Recreation Specialist', category: 'Therapeutic services' },
  { code: 28, title: 'Qualified Activities Professional', category: 'Therapeutic services' },
  { code: 29, title: 'Other Activities Staff', category: 'Therapeutic services' },
  { code: 30, title: 'Qualified Social Worker', category: 'Therapeutic services' },
  { code: 31, title: 'Other Social Worker', category: 'Therapeutic services' },
  { code: 32, title: 'Dentist', category: 'Dental services', optional: true },
  { code: 33, title: 'Podiatrist', category: 'Podiatry services', optional: true },
  { code: 34, title: 'Mental Health Service Worker', category: 'Mental health services' },
  { code: 35, title: 'Vocational Service Worker', category: 'Vocational services', optional: true },
  { code: 36, title: 'Clinical Laboratory Service Worker', category: 'Clinical laboratory services' },
  { code: 37, title: 'Diagnostic X-ray Service Worker', category: 'Diagnostic X-ray services' },
  { code: 38, title: 'Blood Service Worker', category: 'Blood services', optional: true },
  { code: 39, title: 'Housekeeping Service Worker', category: 'Housekeeping services', optional: true },
  { code: 40, title: 'Other Service Worker', category: 'Other services', optional: true },
];

export const JOB_TITLE_BY_CODE = new Map(JOB_TITLES.map((j) => [j.code, j]));

export const PAY_TYPES = [
  { code: 1, label: 'Exempt (salaried employee)' },
  { code: 2, label: 'Non-exempt (hourly employee)' },
  { code: 3, label: 'Contract or agency' },
] as const;

export const US_STATE_CODES = [
  'AK', 'AL', 'AR', 'AZ', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'PR', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VI', 'VT', 'WA', 'WI', 'WV', 'WY',
] as const;

// ---------------------------------------------------------------------------
// Quarters. PBJ uses the federal fiscal year: it starts October 1.
// ---------------------------------------------------------------------------

export interface PbjQuarter {
  fiscalYear: number;
  quarter: 1 | 2 | 3 | 4;
}

export function quarterOf(date: string): PbjQuarter {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  if (m >= 10) return { fiscalYear: y + 1, quarter: 1 };
  if (m >= 7) return { fiscalYear: y, quarter: 4 };
  if (m >= 4) return { fiscalYear: y, quarter: 3 };
  return { fiscalYear: y, quarter: 2 };
}

export function quarterRange({ fiscalYear, quarter }: PbjQuarter): { start: string; end: string } {
  const py = fiscalYear - 1;
  switch (quarter) {
    case 1:
      return { start: `${py}-10-01`, end: `${py}-12-31` };
    case 2:
      return { start: `${fiscalYear}-01-01`, end: `${fiscalYear}-03-31` };
    case 3:
      return { start: `${fiscalYear}-04-01`, end: `${fiscalYear}-06-30` };
    default:
      return { start: `${fiscalYear}-07-01`, end: `${fiscalYear}-09-30` };
  }
}

/** CMS accepts a quarter's data until the end of the 45th calendar day after the quarter ends. */
export function submissionDeadline(q: PbjQuarter): string {
  return addDays(quarterRange(q).end, 45);
}

export function quarterLabel(q: PbjQuarter): string {
  const r = quarterRange(q);
  return `FY${q.fiscalYear} Q${q.quarter} (${r.start} to ${r.end})`;
}

// ---------------------------------------------------------------------------
// Hours. CMS wants paid hours spent delivering services, with meal breaks taken out.
// ---------------------------------------------------------------------------

export interface MealRule {
  /** Minutes always taken off a shift that is long enough (CMS minimum is 30). */
  deductMinutes: number;
  /** A shift at least this many hours long gets the deduction. */
  thresholdHours: number;
}

export const DEFAULT_MEAL_RULE: MealRule = { deductMinutes: 30, thresholdHours: 6 };

/** Minutes CMS takes off a shift for meals. Mealtimes, paid or not, are never counted: a long enough shift loses at least the standard 30 minutes whether or not a break was taken, and more if the recorded break was longer. */
export function mealDeduction(grossMinutes: number, mealMinutes: number, rule: MealRule = DEFAULT_MEAL_RULE): number {
  return grossMinutes >= rule.thresholdHours * 60 ? Math.max(mealMinutes, rule.deductMinutes) : mealMinutes;
}

/** Hours CMS counts for one shift that stays within a day. */
export function pbjShiftHours(grossMinutes: number, mealMinutes: number, rule: MealRule = DEFAULT_MEAL_RULE): number {
  if (grossMinutes <= 0) return 0;
  return Math.round((Math.max(0, grossMinutes - mealDeduction(grossMinutes, mealMinutes, rule)) / 60) * 100) / 100;
}

/**
 * Hours per calendar day for one time entry. CMS counts hours by calendar day with midnight as the cutoff, so a
 * shift from 11:00 PM to 7:00 AM gives 1 hour to the first day and 7 to the next. The meal deduction comes off
 * the day that holds most of the shift. Days are in the facility's own time zone.
 */
export function pbjDayHours(clockIn: Date, clockOut: Date, mealMinutes: number, timeZone: string, rule: MealRule = DEFAULT_MEAL_RULE): { date: string; hours: number }[] {
  const gross = Math.round((clockOut.getTime() - clockIn.getTime()) / 60_000);
  if (gross <= 0) return [];
  const deduct = mealDeduction(gross, mealMinutes, rule);
  const parts: { date: string; minutes: number }[] = [];
  let cursor = clockIn;
  while (cursor < clockOut) {
    const date = dateInZone(cursor, timeZone);
    const midnight = zonedToUtc(addDays(date, 1), '00:00', timeZone);
    const end = midnight < clockOut ? midnight : clockOut;
    parts.push({ date, minutes: Math.round((end.getTime() - cursor.getTime()) / 60_000) });
    cursor = end;
  }
  let longest = 0;
  parts.forEach((p, i) => {
    if (p.minutes > parts[longest].minutes) longest = i;
  });
  parts[longest].minutes = Math.max(0, parts[longest].minutes - deduct);
  return parts.map((p) => ({ date: p.date, hours: Math.round((p.minutes / 60) * 100) / 100 }));
}

export interface PbjHourRow {
  staffCode: string;
  date: string;
  jobTitleCode: number;
  payTypeCode: number;
  hours: number;
}

/** Adds up rows for the same person, day and job title (a person can work two shifts in a day). */
export function combineHourRows(rows: PbjHourRow[]): PbjHourRow[] {
  const map = new Map<string, PbjHourRow>();
  for (const r of rows) {
    const key = `${r.staffCode}|${r.date}|${r.jobTitleCode}|${r.payTypeCode}`;
    const prev = map.get(key);
    if (prev) prev.hours = Math.round((prev.hours + r.hours) * 100) / 100;
    else map.set(key, { ...r });
  }
  return [...map.values()]
    .filter((r) => r.hours > 0)
    .sort((a, b) => a.staffCode.localeCompare(b.staffCode) || a.date.localeCompare(b.date) || a.jobTitleCode - b.jobTitleCode);
}

/** People and days where the total goes over what CMS accepts. */
export function overDailyLimit(rows: PbjHourRow[]): { staffCode: string; date: string; hours: number }[] {
  const totals = new Map<string, { staffCode: string; date: string; hours: number }>();
  for (const r of rows) {
    const key = `${r.staffCode}|${r.date}`;
    const t = totals.get(key) ?? { staffCode: r.staffCode, date: r.date, hours: 0 };
    t.hours = Math.round((t.hours + r.hours) * 100) / 100;
    totals.set(key, t);
  }
  return [...totals.values()].filter((t) => t.hours > PBJ_MAX_DAILY_HOURS);
}

// ---------------------------------------------------------------------------
// The XML file.
// ---------------------------------------------------------------------------

export interface PbjEmployee {
  staffCode: string;
  hireDate?: string | null;
  terminationDate?: string | null;
}

export interface PbjFileInput {
  facilityId: string;
  stateCode: string;
  quarter: PbjQuarter;
  employees: PbjEmployee[];
  rows: PbjHourRow[];
  /** 'replace' makes this file the whole quarter (what you want for a full submission); 'merge' only adds or overwrites the days in it. */
  processType?: 'replace' | 'merge';
  software?: { vendor?: string; email?: string; product?: string; version?: string };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** CMS files are plain ASCII: anything else is turned into a plain letter or dropped. */
function ascii(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').trim();
}

function validDate(d: string | null | undefined): d is string {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= '1895-01-01' && d <= '2050-12-31';
}

export function buildPbjXml(input: PbjFileInput): string {
  const rows = combineHourRows(input.rows);
  const byStaff = new Map<string, Map<string, PbjHourRow[]>>();
  for (const r of rows) {
    const days = byStaff.get(r.staffCode) ?? new Map<string, PbjHourRow[]>();
    days.set(r.date, [...(days.get(r.date) ?? []), r]);
    byStaff.set(r.staffCode, days);
  }
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="ASCII"?>');
  out.push('<nursingHomeData xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="nhpbj_4_10_0.xsd">');
  out.push(`  <header fileSpecVersion="${PBJ_FILE_SPEC_VERSION}">`);
  out.push(`    <facilityId>${esc(ascii(input.facilityId))}</facilityId>`);
  out.push(`    <stateCode>${esc(input.stateCode)}</stateCode>`);
  out.push(`    <reportQuarter>${input.quarter.quarter}</reportQuarter>`);
  out.push(`    <federalFiscalYear>${input.quarter.fiscalYear}</federalFiscalYear>`);
  const sw = input.software;
  if (sw?.vendor) out.push(`    <softwareVendorName>${esc(ascii(sw.vendor))}</softwareVendorName>`);
  if (sw?.email) out.push(`    <softwareVendorEmail>${esc(ascii(sw.email))}</softwareVendorEmail>`);
  if (sw?.product) out.push(`    <softwareProductName>${esc(ascii(sw.product))}</softwareProductName>`);
  if (sw?.version) out.push(`    <softwareProductVersion>${esc(ascii(sw.version))}</softwareProductVersion>`);
  out.push('  </header>');

  const staffCodes = [...byStaff.keys()];
  const empByCode = new Map(input.employees.map((e) => [e.staffCode, e]));
  out.push('  <employees>');
  for (const code of staffCodes) {
    const e = empByCode.get(code);
    out.push('    <employee>');
    out.push(`      <employeeId>${esc(code)}</employeeId>`);
    // Optional dates are left out entirely when unknown: CMS rejects an empty tag.
    if (validDate(e?.hireDate)) out.push(`      <hireDate>${e!.hireDate}</hireDate>`);
    if (validDate(e?.terminationDate)) out.push(`      <terminationDate>${e!.terminationDate}</terminationDate>`);
    out.push('    </employee>');
  }
  out.push('  </employees>');

  out.push(`  <staffingHours processType="${input.processType ?? 'replace'}">`);
  for (const code of staffCodes) {
    out.push('    <staffHours>');
    out.push(`      <employeeId>${esc(code)}</employeeId>`);
    out.push('      <workDays>');
    const days = [...byStaff.get(code)!.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [date, entries] of days) {
      out.push('        <workDay>');
      out.push(`          <date>${date}</date>`);
      out.push('          <hourEntries>');
      for (const r of entries) {
        out.push('            <hourEntry>');
        out.push(`              <hours>${r.hours.toFixed(2)}</hours>`);
        out.push(`              <jobTitleCode>${r.jobTitleCode}</jobTitleCode>`);
        out.push(`              <payTypeCode>${r.payTypeCode}</payTypeCode>`);
        out.push('            </hourEntry>');
      }
      out.push('          </hourEntries>');
      out.push('        </workDay>');
    }
    out.push('      </workDays>');
    out.push('    </staffHours>');
  }
  out.push('  </staffingHours>');
  out.push('</nursingHomeData>');
  return out.join('\n') + '\n';
}
