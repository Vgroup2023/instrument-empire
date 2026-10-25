import { and, asc, desc, eq, gte, inArray, lte, ne, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  accounts, journalEntries, journalLines, payRunItems, payRuns, payrollEmployees, payrollProfiles, payrollSettings, timeEntries,
} from '@/db/schema';
import { recordAuditLog } from '@/lib/accounting/auditLog';
import { createAccount } from '@/lib/accounting/chartOfAccounts';
import type { Executor, Tx } from '@/lib/accounting/entryRules';
import { ConflictError, NotFoundError, ValidationError, asRecord, isoDate, money, oneOf, optText, uuid } from '@/lib/validation';
import { US_STATE_CODES } from '@/lib/workforce/pbj';
import { addDays, daysBetween, paidHours, weekStart } from '@/lib/workforce/time';
import {
  computeItem, periodPay, round2, splitOvertime, type FilingStatus, type ItemResult, type PayFrequency, type W4, type Ytd,
} from './taxes';

const FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly'] as const;
const FILING = ['single', 'married', 'head'] as const;

// ---------------------------------------------------------------------------
// Settings: where payroll posts, and the employer's state unemployment rate
// ---------------------------------------------------------------------------

export interface PaySettings {
  frequency: PayFrequency;
  wagesAccountId: string | null;
  employerTaxAccountId: string | null;
  taxPayableAccountId: string | null;
  deductionsPayableAccountId: string | null;
  payFromAccountId: string | null;
  sutaRate: number;
  sutaWageBase: number;
}

export async function getPaySettings(ex: Executor = getDb()): Promise<PaySettings> {
  const [r] = await ex.select().from(payrollSettings).where(eq(payrollSettings.id, 1));
  return {
    frequency: (r?.frequency as PayFrequency) ?? 'biweekly',
    wagesAccountId: r?.wagesAccountId ?? null,
    employerTaxAccountId: r?.employerTaxAccountId ?? null,
    taxPayableAccountId: r?.taxPayableAccountId ?? null,
    deductionsPayableAccountId: r?.deductionsPayableAccountId ?? null,
    payFromAccountId: r?.payFromAccountId ?? null,
    sutaRate: r ? Number(r.sutaRate) : 0,
    sutaWageBase: r ? Number(r.sutaWageBase) : 0,
  };
}

const EXPENSE_TYPES = ['Expense', 'Other Expense', 'Cost of Goods Sold'];
const LIABILITY_TYPES = ['Other Current Liability', 'Long Term Liability', 'Accounts Payable', 'Credit Card'];

async function checkAccount(id: unknown, label: string, types: string[]): Promise<string | null> {
  if (id === null || id === undefined || id === '') return null;
  const accountId = uuid(id, label);
  const [row] = await getDb().select().from(accounts).where(eq(accounts.id, accountId));
  if (!row || !row.active) throw new ValidationError(`${label}: that account was not found.`);
  if (!types.includes(row.accountType)) throw new ValidationError(`${label} must be a ${types[0].toLowerCase()} account.`);
  return accountId;
}

export async function savePaySettings(input: unknown): Promise<PaySettings> {
  const raw = asRecord(input, 'The settings');
  const frequency = oneOf(raw.frequency ?? 'biweekly', 'Pay frequency', FREQUENCIES);
  const sutaRate = Number(raw.sutaRate ?? 0);
  const sutaWageBase = Number(raw.sutaWageBase ?? 0);
  if (!(sutaRate >= 0 && sutaRate <= 15)) throw new ValidationError('The state unemployment rate is a percent from 0 to 15.');
  if (!(sutaWageBase >= 0 && sutaWageBase <= 1_000_000)) throw new ValidationError('The state unemployment wage base looks wrong.');
  const values = {
    frequency,
    wagesAccountId: await checkAccount(raw.wagesAccountId, 'Wages account', EXPENSE_TYPES),
    employerTaxAccountId: await checkAccount(raw.employerTaxAccountId, 'Employer tax account', EXPENSE_TYPES),
    taxPayableAccountId: await checkAccount(raw.taxPayableAccountId, 'Payroll taxes payable account', LIABILITY_TYPES),
    deductionsPayableAccountId: await checkAccount(raw.deductionsPayableAccountId, 'Deductions payable account', LIABILITY_TYPES),
    payFromAccountId: await checkAccount(raw.payFromAccountId, 'Pay-from bank account', ['Bank']),
    sutaRate: String(sutaRate),
    sutaWageBase: String(sutaWageBase),
    updatedAt: new Date(),
  };
  await getDb().insert(payrollSettings).values({ id: 1, ...values }).onConflictDoUpdate({ target: payrollSettings.id, set: values });
  return getPaySettings();
}

/** Finds or creates the four accounts payroll posts to (the bank account is the owner's choice). Only fills in blanks. */
export async function setupPayrollAccounts(): Promise<PaySettings> {
  const current = await getPaySettings();
  const want: { key: keyof PaySettings; name: string; type: string; sub: string }[] = [
    { key: 'wagesAccountId', name: 'Wages and Salaries', type: 'Expense', sub: 'PayrollExpenses' },
    { key: 'employerTaxAccountId', name: 'Payroll Tax Expense', type: 'Expense', sub: 'PayrollExpenses' },
    { key: 'taxPayableAccountId', name: 'Payroll Taxes Payable', type: 'Other Current Liability', sub: 'PayrollTaxPayable' },
    { key: 'deductionsPayableAccountId', name: 'Payroll Deductions Payable', type: 'Other Current Liability', sub: 'OtherCurrentLiabilities' },
  ];
  const next = { ...current } as Record<string, unknown>;
  for (const w of want) {
    if (current[w.key]) continue;
    const [hit] = await getDb().select().from(accounts).where(and(sql`lower(${accounts.name}) = lower(${w.name})`, eq(accounts.active, true)));
    next[w.key] = hit ? hit.id : (await createAccount({ name: w.name, accountType: w.type, accountSubType: w.sub })).Id;
  }
  return savePaySettings(next);
}

// ---------------------------------------------------------------------------
// Employee pay setup (the Form W-4 and the other things taken from pay)
// ---------------------------------------------------------------------------

export interface PayProfile {
  employeeId: string;
  name: string;
  status: string;
  jobTitle: string | null;
  pbjPayTypeCode: number | null;
  payKind: 'hourly' | 'salary';
  rate: number;
  hasProfile: boolean;
  filingStatus: FilingStatus;
  step2Checked: boolean;
  credits: number;
  otherIncome: number;
  deductions: number;
  extraWithholding: number;
  exempt: boolean;
  stateCode: string;
  statePercent: number;
  stateFixed: number;
  pretaxBenefits: number;
  pretaxRetirement: number;
  afterTax: number;
}

function toProfile(e: typeof payrollEmployees.$inferSelect, p: typeof payrollProfiles.$inferSelect | null): PayProfile {
  return {
    employeeId: e.id,
    name: e.displayName,
    status: e.status,
    jobTitle: e.jobTitle,
    pbjPayTypeCode: e.pbjPayTypeCode,
    payKind: e.basePayPeriod === 'hourly' ? 'hourly' : 'salary',
    rate: Number(e.basePayAmount),
    hasProfile: !!p,
    filingStatus: (p?.filingStatus as FilingStatus) ?? 'single',
    step2Checked: p?.step2Checked ?? false,
    credits: Number(p?.credits ?? 0),
    otherIncome: Number(p?.otherIncome ?? 0),
    deductions: Number(p?.deductions ?? 0),
    extraWithholding: Number(p?.extraWithholding ?? 0),
    exempt: p?.exempt ?? false,
    stateCode: p?.stateCode ?? '',
    statePercent: Number(p?.statePercent ?? 0),
    stateFixed: Number(p?.stateFixed ?? 0),
    pretaxBenefits: Number(p?.pretaxBenefits ?? 0),
    pretaxRetirement: Number(p?.pretaxRetirement ?? 0),
    afterTax: Number(p?.afterTax ?? 0),
  };
}

export async function listPayProfiles(): Promise<PayProfile[]> {
  const rows = await getDb()
    .select({ e: payrollEmployees, p: payrollProfiles })
    .from(payrollEmployees)
    .leftJoin(payrollProfiles, eq(payrollProfiles.employeeId, payrollEmployees.id))
    .orderBy(asc(payrollEmployees.displayName))
    .limit(1000);
  return rows.map((r) => toProfile(r.e, r.p));
}

function amount(v: unknown, field: string, max = 10_000_000): number {
  if (v === undefined || v === null || v === '') return 0;
  const n = money(v, field, { allowZero: true });
  if (n > max) throw new ValidationError(`${field} looks too large.`);
  return n;
}

export async function savePayProfile(employeeId: string, input: unknown): Promise<PayProfile> {
  uuid(employeeId, 'Employee');
  const raw = asRecord(input, 'The pay setup');
  const state = raw.stateCode === undefined || raw.stateCode === null ? '' : String(raw.stateCode).toUpperCase();
  if (state && !(US_STATE_CODES as readonly string[]).includes(state)) throw new ValidationError('Pick a US state or territory code.');
  const statePercent = Number(raw.statePercent ?? 0);
  if (!(statePercent >= 0 && statePercent <= 15)) throw new ValidationError('The state percent is from 0 to 15.');
  const values = {
    filingStatus: oneOf(raw.filingStatus ?? 'single', 'Filing status', FILING),
    step2Checked: raw.step2Checked === true,
    credits: String(amount(raw.credits, 'Credits (W-4 step 3)')),
    otherIncome: String(amount(raw.otherIncome, 'Other income (W-4 step 4a)')),
    deductions: String(amount(raw.deductions, 'Deductions (W-4 step 4b)')),
    extraWithholding: String(amount(raw.extraWithholding, 'Extra withholding (W-4 step 4c)')),
    exempt: raw.exempt === true,
    stateCode: state || null,
    statePercent: String(statePercent),
    stateFixed: String(amount(raw.stateFixed, 'Fixed state amount')),
    pretaxBenefits: String(amount(raw.pretaxBenefits, 'Pre-tax benefits')),
    pretaxRetirement: String(amount(raw.pretaxRetirement, 'Retirement deferral')),
    afterTax: String(amount(raw.afterTax, 'After-tax deductions')),
    updatedAt: new Date(),
  };
  const db = getDb();
  const [emp] = await db.select().from(payrollEmployees).where(eq(payrollEmployees.id, employeeId));
  if (!emp) throw new NotFoundError('Employee not found.');
  await db.insert(payrollProfiles).values({ employeeId, ...values }).onConflictDoUpdate({ target: payrollProfiles.employeeId, set: values });
  const [p] = await db.select().from(payrollProfiles).where(eq(payrollProfiles.employeeId, employeeId));
  return toProfile(emp, p ?? null);
}

function w4Of(p: PayProfile): W4 {
  return { filingStatus: p.filingStatus, step2Checked: p.step2Checked, credits: p.credits, otherIncome: p.otherIncome, deductions: p.deductions, extraWithholding: p.extraWithholding, exempt: p.exempt };
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export interface ItemView {
  id: string;
  employeeId: string;
  name: string;
  jobTitle: string | null;
  kind: 'hourly' | 'salary';
  rate: number;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  extraPay: number;
  gross: number;
  pretaxBenefits: number;
  pretaxRetirement: number;
  afterTax: number;
  federal: number;
  socialSecurity: number;
  medicare: number;
  additionalMedicare: number;
  state: number;
  net: number;
  employerSocialSecurity: number;
  employerMedicare: number;
  futa: number;
  suta: number;
  note: string | null;
  /** Year to date through this pay, for the stub. */
  ytd: { gross: number; federal: number; socialSecurity: number; medicare: number; state: number; net: number };
}

export interface RunView {
  id: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  frequency: PayFrequency;
  status: 'draft' | 'final' | 'void';
  note: string | null;
  journalEntryId: string | null;
  items: ItemView[];
  totals: RunTotals;
}

export interface RunTotals {
  employees: number;
  gross: number;
  withheld: number;
  deductions: number;
  net: number;
  employerTaxes: number;
  /** Gross pay plus the employer's taxes. */
  cost: number;
}

type ItemRow = typeof payRunItems.$inferSelect;

function totalsOf(items: { gross: number; federal: number; socialSecurity: number; medicare: number; additionalMedicare: number; state: number; pretaxBenefits: number; pretaxRetirement: number; afterTax: number; net: number; employerSocialSecurity: number; employerMedicare: number; futa: number; suta: number }[]): RunTotals {
  const sum = (f: (i: (typeof items)[number]) => number) => round2(items.reduce((a, i) => a + f(i), 0));
  const employerTaxes = sum((i) => i.employerSocialSecurity + i.employerMedicare + i.futa + i.suta);
  const gross = sum((i) => i.gross);
  return {
    employees: items.length,
    gross,
    withheld: sum((i) => i.federal + i.socialSecurity + i.medicare + i.additionalMedicare + i.state),
    deductions: sum((i) => i.pretaxBenefits + i.pretaxRetirement + i.afterTax),
    net: sum((i) => i.net),
    employerTaxes,
    cost: round2(gross + employerTaxes),
  };
}

const n = (v: string | null | undefined) => Number(v ?? 0);

function itemValues(r: ItemResult, pay: { regularPay: number; overtimePay: number; extra: number }) {
  return {
    regularPay: pay.regularPay.toFixed(2), overtimePay: pay.overtimePay.toFixed(2), extraPay: pay.extra.toFixed(2),
    gross: r.gross.toFixed(2), pretaxBenefits: r.pretaxBenefits.toFixed(2), pretaxRetirement: r.pretaxRetirement.toFixed(2), afterTax: r.afterTax.toFixed(2),
    federal: r.federal.toFixed(2), socialSecurity: r.socialSecurity.toFixed(2), medicare: r.medicare.toFixed(2), additionalMedicare: r.additionalMedicare.toFixed(2),
    state: r.state.toFixed(2), net: r.net.toFixed(2),
    employerSocialSecurity: r.employerSocialSecurity.toFixed(2), employerMedicare: r.employerMedicare.toFixed(2), futa: r.futa.toFixed(2), suta: r.suta.toFixed(2),
    ficaWages: r.ficaWages.toFixed(2),
  };
}

/** Wages already paid this calendar year by finalized runs, by employee, before this run. */
async function ytdBefore(ex: Executor, year: number, payDate: string, exceptRunId: string | null): Promise<Map<string, Ytd>> {
  const rows = await ex
    .select({ employeeId: payRunItems.employeeId, fica: sql<string>`coalesce(sum(${payRunItems.ficaWages}), 0)` })
    .from(payRunItems)
    .innerJoin(payRuns, eq(payRuns.id, payRunItems.runId))
    .where(and(eq(payRuns.status, 'final'), sql`extract(year from ${payRuns.payDate}) = ${year}`, lte(payRuns.payDate, payDate), exceptRunId ? ne(payRuns.id, exceptRunId) : sql`true`))
    .groupBy(payRunItems.employeeId);
  return new Map(rows.map((r) => [r.employeeId, { fica: Number(r.fica), futa: Number(r.fica), suta: Number(r.fica) }]));
}

function priceItem(a: {
  profile: PayProfile; frequency: PayFrequency; regularHours: number; overtimeHours: number; extra: number; ytd: Ytd; settings: PaySettings;
}) {
  const pay = periodPay({ kind: a.profile.payKind, rate: a.profile.rate, regularHours: a.regularHours, overtimeHours: a.overtimeHours, frequency: a.frequency, extra: a.extra });
  const result = computeItem({
    gross: pay.gross, pretaxBenefits: a.profile.pretaxBenefits, pretaxRetirement: a.profile.pretaxRetirement, afterTax: a.profile.afterTax,
    frequency: a.frequency, w4: w4Of(a.profile), statePercent: a.profile.statePercent, stateFixed: a.profile.stateFixed,
    ytd: a.ytd, sutaRate: a.settings.sutaRate, sutaWageBase: a.settings.sutaWageBase,
  });
  return { pay, result };
}

function checkPeriod(start: string, end: string, frequency: PayFrequency) {
  if (end < start) throw new ValidationError('The period ends before it starts.');
  const days = daysBetween(start, end) + 1;
  const ok = { weekly: [7, 7], biweekly: [14, 14], semimonthly: [13, 16], monthly: [28, 31] }[frequency];
  if (days < ok[0] || days > ok[1]) {
    throw new ValidationError(`A ${frequency} pay period covers ${ok[0] === ok[1] ? `${ok[0]} days` : `${ok[0]} to ${ok[1]} days`}, and this one covers ${days}. Salaries are paid by the number of periods in a year, so the dates must match.`);
  }
}

/** Approved hours for each hourly employee, by date, for every week that touches the period. */
async function loadDailyHours(ex: Executor, employeeIds: string[], start: string, end: string) {
  const from = weekStart(start);
  const to = addDays(weekStart(end), 6);
  const rows = employeeIds.length
    ? await ex
        .select()
        .from(timeEntries)
        .where(and(inArray(timeEntries.employeeId, employeeIds), gte(timeEntries.workDate, from), lte(timeEntries.workDate, to)))
        .limit(200_000)
    : [];
  const daily = new Map<string, Map<string, number>>();
  const unapproved = new Map<string, number>();
  for (const e of rows) {
    const inPeriod = e.workDate >= start && e.workDate <= end;
    if (!e.clockOut || !e.approved) {
      if (inPeriod) unapproved.set(e.employeeId, (unapproved.get(e.employeeId) ?? 0) + 1);
      continue;
    }
    const m = daily.get(e.employeeId) ?? new Map<string, number>();
    m.set(e.workDate, round2((m.get(e.workDate) ?? 0) + paidHours(e.clockIn, e.clockOut, e.mealMinutes)));
    daily.set(e.employeeId, m);
  }
  return { daily, unapproved };
}

export async function createRun(input: unknown): Promise<{ id: string; skipped: string[] }> {
  const raw = asRecord(input, 'The pay run');
  const settings = await getPaySettings();
  const frequency = oneOf(raw.frequency ?? settings.frequency, 'Pay frequency', FREQUENCIES);
  const periodStart = isoDate(raw.periodStart, 'Period start');
  const periodEnd = isoDate(raw.periodEnd, 'Period end');
  const payDate = isoDate(raw.payDate, 'Pay date');
  checkPeriod(periodStart, periodEnd, frequency);
  if (payDate < periodStart) throw new ValidationError('The pay date is before the period starts.');
  const note = optText(raw.note, 'Note', 300) ?? null;

  const db = getDb();
  return db.transaction(async (tx) => {
    const profiles = (await listPayProfiles()).filter(
      (p) => p.status === 'active' && p.pbjPayTypeCode !== 3, // contract and agency staff are paid by their agency, not through payroll
    );
    const [run] = await tx.insert(payRuns).values({ periodStart, periodEnd, payDate, frequency, note }).returning();
    // Someone already in a pay run (not voided) that overlaps these dates is not paid twice.
    const overlapping = await tx
      .select({ employeeId: payRunItems.employeeId })
      .from(payRunItems)
      .innerJoin(payRuns, eq(payRuns.id, payRunItems.runId))
      .where(and(ne(payRuns.status, 'void'), ne(payRuns.id, run.id), lte(payRuns.periodStart, periodEnd), gte(payRuns.periodEnd, periodStart)));
    const already = new Set(overlapping.map((o) => o.employeeId));
    const hourly = profiles.filter((p) => p.payKind === 'hourly').map((p) => p.employeeId);
    const { daily, unapproved } = await loadDailyHours(tx, hourly, periodStart, periodEnd);
    const ytd = await ytdBefore(tx, Number(payDate.slice(0, 4)), payDate, run.id);
    const skipped: string[] = [];
    const employees = new Map((await tx.select().from(payrollEmployees)).map((e) => [e.id, e]));
    const rows: (typeof payRunItems.$inferInsert)[] = [];
    for (const p of profiles) {
      if (already.has(p.employeeId)) {
        skipped.push(`${p.name} (already in another run for these dates)`);
        continue;
      }
      const emp = employees.get(p.employeeId);
      if (!emp || emp.hiredDate > periodEnd) continue;
      if (emp.terminationDate && emp.terminationDate < periodStart) continue;
      let regularHours = 0;
      let overtimeHours = 0;
      const notes: string[] = [];
      if (p.payKind === 'hourly') {
        const split = splitOvertime(daily.get(p.employeeId) ?? new Map(), periodStart, periodEnd);
        // Contract-free exempt staff on an hourly rate have no overtime; everyone else does.
        regularHours = p.pbjPayTypeCode === 1 ? round2(split.regular + split.overtime) : split.regular;
        overtimeHours = p.pbjPayTypeCode === 1 ? 0 : split.overtime;
        const open = unapproved.get(p.employeeId) ?? 0;
        if (open > 0) notes.push(`${open} time ${open === 1 ? 'entry is' : 'entries are'} not approved or still open and not counted.`);
      }
      if (!p.hasProfile) notes.push('No W-4 on file: withheld as Single with no adjustments.');
      const { pay, result } = priceItem({ profile: p, frequency, regularHours, overtimeHours, extra: 0, ytd: ytd.get(p.employeeId) ?? { fica: 0, futa: 0, suta: 0 }, settings });
      rows.push({
        runId: run.id, employeeId: p.employeeId, kind: p.payKind, rate: p.rate.toFixed(2),
        regularHours: regularHours.toFixed(2), overtimeHours: overtimeHours.toFixed(2),
        ...itemValues(result, pay), note: notes.join(' ') || null,
      });
    }
    if (rows.length > 0) await tx.insert(payRunItems).values(rows);
    return { id: run.id, skipped };
  });
}

async function loadRunRows(ex: Executor, runId: string) {
  const [run] = await ex.select().from(payRuns).where(eq(payRuns.id, runId));
  if (!run) throw new NotFoundError('Pay run not found.');
  const items = await ex
    .select({ i: payRunItems, name: payrollEmployees.displayName, jobTitle: payrollEmployees.jobTitle })
    .from(payRunItems)
    .innerJoin(payrollEmployees, eq(payrollEmployees.id, payRunItems.employeeId))
    .where(eq(payRunItems.runId, runId))
    .orderBy(asc(payrollEmployees.displayName));
  return { run, items };
}

function toItemView(r: ItemRow, name: string, jobTitle: string | null, ytd: ItemView['ytd']): ItemView {
  return {
    id: r.id, employeeId: r.employeeId, name, jobTitle, kind: r.kind as 'hourly' | 'salary', rate: n(r.rate),
    regularHours: n(r.regularHours), overtimeHours: n(r.overtimeHours), regularPay: n(r.regularPay), overtimePay: n(r.overtimePay), extraPay: n(r.extraPay),
    gross: n(r.gross), pretaxBenefits: n(r.pretaxBenefits), pretaxRetirement: n(r.pretaxRetirement), afterTax: n(r.afterTax),
    federal: n(r.federal), socialSecurity: n(r.socialSecurity), medicare: n(r.medicare), additionalMedicare: n(r.additionalMedicare), state: n(r.state), net: n(r.net),
    employerSocialSecurity: n(r.employerSocialSecurity), employerMedicare: n(r.employerMedicare), futa: n(r.futa), suta: n(r.suta),
    note: r.note, ytd,
  };
}

export async function getRun(runId: string): Promise<RunView> {
  uuid(runId, 'Pay run');
  const db = getDb();
  const { run, items } = await loadRunRows(db, runId);
  // Year to date through this pay: finalized earlier pay plus this run's own figures.
  const year = Number(run.payDate.slice(0, 4));
  const prior = await db
    .select({
      employeeId: payRunItems.employeeId,
      gross: sql<string>`coalesce(sum(${payRunItems.gross}), 0)`,
      federal: sql<string>`coalesce(sum(${payRunItems.federal}), 0)`,
      ss: sql<string>`coalesce(sum(${payRunItems.socialSecurity}), 0)`,
      med: sql<string>`coalesce(sum(${payRunItems.medicare} + ${payRunItems.additionalMedicare}), 0)`,
      state: sql<string>`coalesce(sum(${payRunItems.state}), 0)`,
      net: sql<string>`coalesce(sum(${payRunItems.net}), 0)`,
    })
    .from(payRunItems)
    .innerJoin(payRuns, eq(payRuns.id, payRunItems.runId))
    .where(and(eq(payRuns.status, 'final'), sql`extract(year from ${payRuns.payDate}) = ${year}`, lte(payRuns.payDate, run.payDate), ne(payRuns.id, runId)))
    .groupBy(payRunItems.employeeId);
  const before = new Map(prior.map((p) => [p.employeeId, p]));
  const views = items.map(({ i, name, jobTitle }) => {
    const b = before.get(i.employeeId);
    return toItemView(i, name, jobTitle, {
      gross: round2(Number(b?.gross ?? 0) + n(i.gross)),
      federal: round2(Number(b?.federal ?? 0) + n(i.federal)),
      socialSecurity: round2(Number(b?.ss ?? 0) + n(i.socialSecurity)),
      medicare: round2(Number(b?.med ?? 0) + n(i.medicare) + n(i.additionalMedicare)),
      state: round2(Number(b?.state ?? 0) + n(i.state)),
      net: round2(Number(b?.net ?? 0) + n(i.net)),
    });
  });
  return {
    id: run.id, periodStart: run.periodStart, periodEnd: run.periodEnd, payDate: run.payDate, frequency: run.frequency as PayFrequency,
    status: run.status as RunView['status'], note: run.note, journalEntryId: run.journalEntryId, items: views, totals: totalsOf(views),
  };
}

export interface RunListRow {
  id: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  frequency: string;
  status: string;
  employees: number;
  gross: number;
  net: number;
}

export async function listRuns(): Promise<RunListRow[]> {
  const rows = await getDb()
    .select({
      r: payRuns,
      employees: sql<number>`count(${payRunItems.id})::int`,
      gross: sql<string>`coalesce(sum(${payRunItems.gross}), 0)`,
      net: sql<string>`coalesce(sum(${payRunItems.net}), 0)`,
    })
    .from(payRuns)
    .leftJoin(payRunItems, eq(payRunItems.runId, payRuns.id))
    .groupBy(payRuns.id)
    .orderBy(desc(payRuns.payDate), desc(payRuns.createdAt))
    .limit(200);
  return rows.map((x) => ({ id: x.r.id, periodStart: x.r.periodStart, periodEnd: x.r.periodEnd, payDate: x.r.payDate, frequency: x.r.frequency, status: x.r.status, employees: x.employees, gross: Number(x.gross), net: Number(x.net) }));
}

async function lockDraft(tx: Tx, runId: string) {
  const [run] = await tx.select().from(payRuns).where(eq(payRuns.id, runId)).for('update');
  if (!run) throw new NotFoundError('Pay run not found.');
  if (run.status !== 'draft') throw new ConflictError('Only a draft pay run can be changed.');
  return run;
}

/** Change an item's hours or add extra pay (a bonus, a reimbursement paid as wages). The taxes are worked out again. */
export async function updateItem(runId: string, itemId: string, input: unknown): Promise<void> {
  uuid(runId, 'Pay run');
  uuid(itemId, 'Pay item');
  const raw = asRecord(input, 'The pay item');
  const settings = await getPaySettings();
  await getDb().transaction(async (tx) => {
    const run = await lockDraft(tx, runId);
    const [item] = await tx.select().from(payRunItems).where(and(eq(payRunItems.id, itemId), eq(payRunItems.runId, runId)));
    if (!item) throw new NotFoundError('Pay item not found.');
    const profile = (await listPayProfiles()).find((p) => p.employeeId === item.employeeId);
    if (!profile) throw new NotFoundError('Employee not found.');
    const hours = (v: unknown, f: string, cur: string) => (v === undefined ? n(cur) : amount(v, f, 744));
    const regularHours = hours(raw.regularHours, 'Regular hours', item.regularHours);
    const overtimeHours = hours(raw.overtimeHours, 'Overtime hours', item.overtimeHours);
    const extra = raw.extraPay === undefined ? n(item.extraPay) : amount(raw.extraPay, 'Extra pay');
    const ytd = (await ytdBefore(tx, Number(run.payDate.slice(0, 4)), run.payDate, runId)).get(item.employeeId) ?? { fica: 0, futa: 0, suta: 0 };
    const { pay, result } = priceItem({ profile, frequency: run.frequency as PayFrequency, regularHours, overtimeHours, extra, ytd, settings });
    await tx
      .update(payRunItems)
      .set({
        regularHours: regularHours.toFixed(2), overtimeHours: overtimeHours.toFixed(2), ...itemValues(result, pay),
        note: raw.note !== undefined ? optText(raw.note, 'Note', 300) ?? null : item.note,
      })
      .where(eq(payRunItems.id, itemId));
  });
}

export async function removeItem(runId: string, itemId: string): Promise<void> {
  uuid(runId, 'Pay run');
  uuid(itemId, 'Pay item');
  await getDb().transaction(async (tx) => {
    await lockDraft(tx, runId);
    await tx.delete(payRunItems).where(and(eq(payRunItems.id, itemId), eq(payRunItems.runId, runId)));
  });
}

export async function deleteDraftRun(runId: string): Promise<void> {
  uuid(runId, 'Pay run');
  await getDb().transaction(async (tx) => {
    await lockDraft(tx, runId);
    await tx.delete(payRuns).where(eq(payRuns.id, runId)); // items go with it
  });
}

type Line = { accountId: string; postingType: 'Debit' | 'Credit'; amount: number; description: string };

/** The one journal entry a finished run posts. Everything is in whole cents so it always balances. */
export function journalLinesFor(t: RunTotals, settings: PaySettings, payrollTaxesIn: { employee: number; employer: number }): Line[] {
  const lines: Line[] = [
    { accountId: settings.wagesAccountId!, postingType: 'Debit', amount: t.gross, description: 'Gross wages' },
    { accountId: settings.employerTaxAccountId!, postingType: 'Debit', amount: t.employerTaxes, description: 'Employer payroll taxes' },
    { accountId: settings.payFromAccountId!, postingType: 'Credit', amount: t.net, description: 'Net pay' },
    { accountId: settings.taxPayableAccountId!, postingType: 'Credit', amount: round2(payrollTaxesIn.employee + payrollTaxesIn.employer), description: 'Payroll taxes withheld and owed' },
    { accountId: settings.deductionsPayableAccountId!, postingType: 'Credit', amount: t.deductions, description: 'Employee deductions held' },
  ];
  return lines.filter((l) => l.amount > 0);
}

export async function finalizeRun(runId: string): Promise<RunView> {
  uuid(runId, 'Pay run');
  const settings = await getPaySettings();
  const missing = (['wagesAccountId', 'employerTaxAccountId', 'taxPayableAccountId', 'deductionsPayableAccountId', 'payFromAccountId'] as const).filter((k) => !settings[k]);
  if (missing.length > 0) throw new ConflictError('Choose the payroll accounts in Settings first (the pay-from bank account is yours to pick; "Set up accounts" makes the rest).');
  await getDb().transaction(async (tx) => {
    const run = await lockDraft(tx, runId);
    const rows = await tx.select().from(payRunItems).where(eq(payRunItems.runId, runId));
    if (rows.length === 0) throw new ConflictError('This pay run has no one in it.');
    // Work every figure out again from today's setup and what has been paid so far this year.
    const profiles = new Map((await listPayProfiles()).map((p) => [p.employeeId, p]));
    const ytd = await ytdBefore(tx, Number(run.payDate.slice(0, 4)), run.payDate, runId);
    const priced: { id: string; result: ItemResult }[] = [];
    for (const row of rows) {
      const profile = profiles.get(row.employeeId);
      if (!profile) throw new NotFoundError('An employee in this run no longer exists.');
      const { pay, result } = priceItem({
        profile, frequency: run.frequency as PayFrequency, regularHours: n(row.regularHours), overtimeHours: n(row.overtimeHours),
        extra: n(row.extraPay), ytd: ytd.get(row.employeeId) ?? { fica: 0, futa: 0, suta: 0 }, settings,
      });
      if (result.net < 0) throw new ConflictError(`${profile.name}'s deductions and taxes are more than their pay (net ${result.net.toFixed(2)}). Fix that before finishing.`);
      await tx.update(payRunItems).set({ rate: profile.rate.toFixed(2), ...itemValues(result, pay) }).where(eq(payRunItems.id, row.id));
      priced.push({ id: row.id, result });
    }
    // Zero-pay lines (someone with no approved hours) would only make blank stubs.
    const empty = priced.filter((p) => p.result.gross <= 0).map((p) => p.id);
    if (empty.length > 0) await tx.delete(payRunItems).where(inArray(payRunItems.id, empty));
    const kept = priced.filter((p) => p.result.gross > 0).map((p) => p.result);
    if (kept.length === 0) throw new ConflictError('Nobody in this run has any pay.');
    const totals = totalsOf(kept.map((r) => ({ ...r, employerSocialSecurity: r.employerSocialSecurity, employerMedicare: r.employerMedicare })));
    const employee = round2(kept.reduce((a, r) => a + r.federal + r.socialSecurity + r.medicare + r.additionalMedicare + r.state, 0));
    const lines = journalLinesFor(totals, settings, { employee, employer: totals.employerTaxes });
    const debit = Math.round(lines.filter((l) => l.postingType === 'Debit').reduce((a, l) => a + l.amount * 100, 0));
    const credit = Math.round(lines.filter((l) => l.postingType === 'Credit').reduce((a, l) => a + l.amount * 100, 0));
    if (debit !== credit) throw new ConflictError(`The pay run does not balance (${debit / 100} in, ${credit / 100} out). Nothing was posted.`);
    const [entry] = await tx
      .insert(journalEntries)
      .values({ txnDate: run.payDate, privateNote: `Payroll for ${run.periodStart} to ${run.periodEnd}, paid ${run.payDate} (pay run ${run.id}). Created by the Pay runs tab.` })
      .returning();
    await tx.insert(journalLines).values(lines.map((l, i) => ({ journalEntryId: entry.id, accountId: l.accountId, postingType: l.postingType, amount: l.amount.toFixed(2), description: l.description, lineNumber: i })));
    await recordAuditLog({ entityType: 'journal_entry', entityId: entry.id, action: 'create', after: { payRunId: run.id, lines } }, tx);
    await tx.update(payRuns).set({ status: 'final', journalEntryId: entry.id, finalizedAt: new Date(), updatedAt: new Date() }).where(eq(payRuns.id, runId));
  });
  return getRun(runId);
}

/** Cancel a finished run: post the opposite journal entry and take it out of the year-to-date totals. */
export async function voidRun(runId: string): Promise<RunView> {
  uuid(runId, 'Pay run');
  await getDb().transaction(async (tx) => {
    const [run] = await tx.select().from(payRuns).where(eq(payRuns.id, runId)).for('update');
    if (!run) throw new NotFoundError('Pay run not found.');
    if (run.status !== 'final' || !run.journalEntryId) throw new ConflictError('Only a finished pay run can be voided.');
    const lines = await tx.select().from(journalLines).where(eq(journalLines.journalEntryId, run.journalEntryId));
    const [entry] = await tx
      .insert(journalEntries)
      .values({ txnDate: run.payDate, privateNote: `Reversal of payroll for ${run.periodStart} to ${run.periodEnd} (pay run ${run.id}). The run was voided.` })
      .returning();
    await tx.insert(journalLines).values(
      lines.map((l, i) => ({ journalEntryId: entry.id, accountId: l.accountId, postingType: (l.postingType === 'Debit' ? 'Credit' : 'Debit') as 'Debit' | 'Credit', amount: l.amount, description: `Reversal: ${l.description ?? ''}`.trim(), lineNumber: i })),
    );
    await recordAuditLog({ entityType: 'journal_entry', entityId: entry.id, action: 'create', after: { reversalOf: run.journalEntryId, payRunId: run.id } }, tx);
    await tx.update(payRuns).set({ status: 'void', reversalEntryId: entry.id, updatedAt: new Date() }).where(eq(payRuns.id, runId));
  });
  return getRun(runId);
}

/** True when a journal entry was posted by a pay run, so it must be changed by voiding the run and not by editing the entry. */
export async function isPayrollEntry(ex: Executor, entryId: string): Promise<boolean> {
  const rows = await ex.select({ id: payRuns.id }).from(payRuns).where(or(eq(payRuns.journalEntryId, entryId), eq(payRuns.reversalEntryId, entryId))).limit(1);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// What is owed: totals from finished runs by calendar quarter (for Form 941 and 940 preparation)
// ---------------------------------------------------------------------------

export interface TaxSummary {
  year: number;
  quarter: number;
  runs: number;
  wages: number;
  federalWithheld: number;
  socialSecurityWages: number;
  socialSecurity: number;
  medicareWages: number;
  medicare: number;
  additionalMedicare: number;
  stateWithheld: number;
  futa: number;
  suta: number;
  /** Federal income tax withheld plus both shares of Social Security and Medicare (the Form 941 amount before adjustments). */
  form941Total: number;
}

export async function taxSummary(year: number, quarter: number): Promise<TaxSummary> {
  if (!(year >= 2020 && year <= 2100) || ![1, 2, 3, 4].includes(quarter)) throw new ValidationError('Pick a year and quarter 1 to 4.');
  const startMonth = (quarter - 1) * 3 + 1;
  const pad = (m: number) => String(m).padStart(2, '0');
  const start = `${year}-${pad(startMonth)}-01`;
  const end = quarter === 4 ? `${year + 1}-01-01` : `${year}-${pad(startMonth + 3)}-01`; // first day of the next quarter
  const [r] = await getDb()
    .select({
      runs: sql<number>`count(distinct ${payRuns.id})::int`,
      wages: sql<string>`coalesce(sum(${payRunItems.gross}), 0)`,
      ficaWages: sql<string>`coalesce(sum(${payRunItems.ficaWages}), 0)`,
      federal: sql<string>`coalesce(sum(${payRunItems.federal}), 0)`,
      ss: sql<string>`coalesce(sum(${payRunItems.socialSecurity}), 0)`,
      ssEr: sql<string>`coalesce(sum(${payRunItems.employerSocialSecurity}), 0)`,
      med: sql<string>`coalesce(sum(${payRunItems.medicare}), 0)`,
      medEr: sql<string>`coalesce(sum(${payRunItems.employerMedicare}), 0)`,
      addl: sql<string>`coalesce(sum(${payRunItems.additionalMedicare}), 0)`,
      state: sql<string>`coalesce(sum(${payRunItems.state}), 0)`,
      futa: sql<string>`coalesce(sum(${payRunItems.futa}), 0)`,
      suta: sql<string>`coalesce(sum(${payRunItems.suta}), 0)`,
    })
    .from(payRunItems)
    .innerJoin(payRuns, eq(payRuns.id, payRunItems.runId))
    .where(and(eq(payRuns.status, 'final'), gte(payRuns.payDate, start), sql`${payRuns.payDate} < ${end}`));
  const num = (v: string) => round2(Number(v));
  return {
    year, quarter, runs: r.runs, wages: num(r.wages), federalWithheld: num(r.federal),
    socialSecurityWages: num(r.ficaWages), socialSecurity: round2(Number(r.ss) + Number(r.ssEr)),
    medicareWages: num(r.ficaWages), medicare: round2(Number(r.med) + Number(r.medEr)), additionalMedicare: num(r.addl),
    stateWithheld: num(r.state), futa: num(r.futa), suta: num(r.suta),
    form941Total: round2(Number(r.federal) + Number(r.ss) + Number(r.ssEr) + Number(r.med) + Number(r.medEr) + Number(r.addl)),
  };
}
