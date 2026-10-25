// US payroll tax rules for 2026, as pure functions (no database), so every number can be tested by hand.
//
// Sources, all from the IRS:
//  - Publication 15-T (2026), section 1: Worksheet 1A and the 2026 Percentage Method Tables for Automated
//    Payroll Systems (federal income tax withholding, Form W-4 from 2020 or later).
//  - Publication 15 (2026), Circular E: Social Security 6.2% each for employee and employer up to a
//    $184,500 wage base; Medicare 1.45% each, no wage limit; Additional Medicare Tax 0.9% (employee only) on
//    wages over $200,000 in a calendar year; FUTA 6.0% on the first $7,000 per employee, 0.6% after the full
//    5.4% state credit.
// These change every January: update TAX_YEAR and the tables below from the new Publication 15-T and 15.

export const TAX_YEAR = 2026;

export type FilingStatus = 'single' | 'married' | 'head';
export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

export const PERIODS_PER_YEAR: Record<PayFrequency, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

export const SS_RATE = 0.062;
export const SS_WAGE_BASE = 184_500;
export const MEDICARE_RATE = 0.0145;
export const ADDITIONAL_MEDICARE_RATE = 0.009;
export const ADDITIONAL_MEDICARE_THRESHOLD = 200_000;
export const FUTA_NET_RATE = 0.006;
export const FUTA_WAGE_BASE = 7_000;

// Form W-4 (2020 or later) Step 4(b)/Worksheet 1A line 1g: what stands in for the standard deduction when the
// Step 2 box is not checked.
const STD_MARRIED = 12_900;
const STD_OTHER = 8_600;

/** [at least (column A), tentative amount (column C), percentage (column D)] rows of the Annual Percentage Method tables. */
type Row = readonly [number, number, number];

const STANDARD: Record<FilingStatus, readonly Row[]> = {
  married: [[0, 0, 0], [19_300, 0, 0.1], [44_100, 2_480, 0.12], [120_100, 11_600, 0.22], [230_700, 35_932, 0.24], [422_850, 82_048, 0.32], [531_750, 116_896, 0.35], [788_000, 206_583.5, 0.37]],
  single: [[0, 0, 0], [7_500, 0, 0.1], [19_900, 1_240, 0.12], [57_900, 5_800, 0.22], [113_200, 17_966, 0.24], [209_275, 41_024, 0.32], [263_725, 58_448, 0.35], [648_100, 192_979.25, 0.37]],
  head: [[0, 0, 0], [15_550, 0, 0.1], [33_250, 1_770, 0.12], [83_000, 7_740, 0.22], [121_250, 16_155, 0.24], [217_300, 39_207, 0.32], [271_750, 56_631, 0.35], [656_150, 191_171, 0.37]],
};

/** Used when the box in Step 2 of Form W-4 is checked (the employee has more than one job). */
const STEP2_CHECKED: Record<FilingStatus, readonly Row[]> = {
  married: [[0, 0, 0], [16_100, 0, 0.1], [28_500, 1_240, 0.12], [66_500, 5_800, 0.22], [121_800, 17_966, 0.24], [217_875, 41_024, 0.32], [272_325, 58_448, 0.35], [400_450, 103_291.75, 0.37]],
  single: [[0, 0, 0], [8_050, 0, 0.1], [14_250, 620, 0.12], [33_250, 2_900, 0.22], [60_900, 8_983, 0.24], [108_938, 20_512, 0.32], [136_163, 29_224, 0.35], [328_350, 96_489.63, 0.37]],
  head: [[0, 0, 0], [12_075, 0, 0.1], [20_925, 885, 0.12], [45_800, 3_870, 0.22], [64_925, 8_077.5, 0.24], [112_950, 19_603.5, 0.32], [140_175, 28_315.5, 0.35], [332_375, 95_585.5, 0.37]],
};

export const WITHHOLDING_TABLES = { standard: STANDARD, step2Checked: STEP2_CHECKED };

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface W4 {
  filingStatus: FilingStatus;
  /** Step 2 box checked (two jobs). */
  step2Checked: boolean;
  /** Step 3: dependents and other credits, a yearly amount. */
  credits: number;
  /** Step 4(a): other income, a yearly amount. */
  otherIncome: number;
  /** Step 4(b): deductions beyond the standard deduction, a yearly amount. */
  deductions: number;
  /** Step 4(c): extra amount to withhold each pay period. */
  extraWithholding: number;
  /** Claimed exempt from withholding on Form W-4. */
  exempt: boolean;
}

/** Pub 15-T Worksheet 1A: federal income tax to withhold for one pay period, from the wages subject to income tax. */
export function federalWithholding(wages: number, frequency: PayFrequency, w4: W4): number {
  if (w4.exempt || wages <= 0) return 0;
  const periods = PERIODS_PER_YEAR[frequency];
  const annual = wages * periods; // 1c
  const withOther = annual + w4.otherIncome; // 1e
  const standard = w4.step2Checked ? 0 : w4.filingStatus === 'married' ? STD_MARRIED : STD_OTHER; // 1g
  const adjusted = Math.max(0, withOther - (w4.deductions + standard)); // 1i
  const rows = (w4.step2Checked ? STEP2_CHECKED : STANDARD)[w4.filingStatus];
  let row = rows[0];
  for (const r of rows) if (adjusted >= r[0]) row = r; // the row where the amount is at least column A
  const tentativeAnnual = row[1] + (adjusted - row[0]) * row[2]; // 2g
  const tentative = tentativeAnnual / periods; // 2h
  const afterCredits = Math.max(0, tentative - w4.credits / periods); // 3c
  return round2(afterCredits + w4.extraWithholding); // 4b
}

/** Year-to-date wages before this pay period, by the tax each one counts toward. */
export interface Ytd {
  /** Social Security and Medicare wages. */
  fica: number;
  /** FUTA wages. */
  futa: number;
  /** State unemployment wages. */
  suta: number;
}

export interface ItemInput {
  /** Total pay for the period: regular, overtime and any extra. */
  gross: number;
  /** Section 125 benefits (such as health premiums): come off federal income tax, Social Security, Medicare and unemployment wages. */
  pretaxBenefits: number;
  /** Traditional 401(k)-type deferrals: come off federal income tax wages only. */
  pretaxRetirement: number;
  /** Taken from net pay after tax (garnishments, union dues, Roth deferrals). */
  afterTax: number;
  frequency: PayFrequency;
  w4: W4;
  /** Flat percent of income tax wages the employee asked the state to hold back, e.g. 4.5. */
  statePercent: number;
  /** A fixed state amount per pay period. */
  stateFixed: number;
  ytd: Ytd;
  /** State unemployment rate (percent, e.g. 2.7) and wage base for the employer. */
  sutaRate: number;
  sutaWageBase: number;
}

export interface ItemResult {
  gross: number;
  incomeTaxWages: number;
  ficaWages: number;
  federal: number;
  socialSecurity: number;
  medicare: number;
  additionalMedicare: number;
  state: number;
  pretaxBenefits: number;
  pretaxRetirement: number;
  afterTax: number;
  net: number;
  employerSocialSecurity: number;
  employerMedicare: number;
  futa: number;
  suta: number;
  /** What the pay period adds to year-to-date wages, for the next run. */
  addsToYtd: Ytd;
}

export function computeItem(input: ItemInput): ItemResult {
  const gross = round2(input.gross);
  const pretaxBenefits = round2(input.pretaxBenefits);
  const pretaxRetirement = round2(input.pretaxRetirement);
  const afterTax = round2(input.afterTax);
  const ficaWages = Math.max(0, round2(gross - pretaxBenefits));
  const incomeTaxWages = Math.max(0, round2(ficaWages - pretaxRetirement));

  const federal = federalWithholding(incomeTaxWages, input.frequency, input.w4);

  const ssRoom = Math.max(0, SS_WAGE_BASE - input.ytd.fica);
  const ssWages = Math.min(ficaWages, ssRoom);
  const socialSecurity = round2(ssWages * SS_RATE);
  const medicare = round2(ficaWages * MEDICARE_RATE);
  // Additional Medicare Tax starts in the pay period when wages pass $200,000 for the year.
  const over = Math.max(0, input.ytd.fica + ficaWages - Math.max(ADDITIONAL_MEDICARE_THRESHOLD, input.ytd.fica));
  const additionalMedicare = round2(over * ADDITIONAL_MEDICARE_RATE);

  const state = incomeTaxWages > 0 ? round2(incomeTaxWages * (input.statePercent / 100) + input.stateFixed) : 0;

  const futaRoom = Math.max(0, FUTA_WAGE_BASE - input.ytd.futa);
  const futa = round2(Math.min(ficaWages, futaRoom) * FUTA_NET_RATE);
  const sutaRoom = Math.max(0, input.sutaWageBase - input.ytd.suta);
  const suta = round2(Math.min(ficaWages, sutaRoom) * (input.sutaRate / 100));

  const net = round2(gross - pretaxBenefits - pretaxRetirement - federal - socialSecurity - medicare - additionalMedicare - state - afterTax);

  return {
    gross, incomeTaxWages, ficaWages, federal, socialSecurity, medicare, additionalMedicare, state,
    pretaxBenefits, pretaxRetirement, afterTax, net,
    employerSocialSecurity: socialSecurity, // same rate and wage base as the employee's share
    employerMedicare: medicare,
    futa, suta,
    addsToYtd: { fica: ficaWages, futa: ficaWages, suta: ficaWages },
  };
}

// ---------------------------------------------------------------------------
// Pay: regular and overtime hours.
// ---------------------------------------------------------------------------

export const OVERTIME_MULTIPLIER = 1.5;
export const OVERTIME_AFTER = 40;

/**
 * Splits worked hours into regular and overtime for the days inside a pay period. Overtime is the hours beyond 40
 * in a Monday to Sunday workweek, counted day by day from Monday, so a week that is split between two pay periods
 * puts its overtime on the days it actually happens, whichever period they fall in.
 * `daily` has the hours worked on each date of every week that touches the period (including days outside it).
 */
export function splitOvertime(daily: Map<string, number>, periodStart: string, periodEnd: string): { regular: number; overtime: number } {
  const week = (d: string) => {
    const dt = new Date(`${d}T00:00:00Z`);
    const back = (dt.getUTCDay() + 6) % 7;
    return new Date(dt.getTime() - back * 86_400_000).toISOString().slice(0, 10);
  };
  const days = [...daily.keys()].sort();
  const cumulative = new Map<string, number>();
  let regular = 0;
  let overtime = 0;
  for (const d of days) {
    const w = week(d);
    const before = cumulative.get(w) ?? 0;
    const hours = daily.get(d) ?? 0;
    const regularToday = Math.max(0, Math.min(hours, OVERTIME_AFTER - before));
    cumulative.set(w, before + hours);
    if (d >= periodStart && d <= periodEnd) {
      regular += regularToday;
      overtime += hours - regularToday;
    }
  }
  return { regular: round2(regular), overtime: round2(overtime) };
}

/** Pay for one period: hourly staff are paid for hours (overtime at time and a half), salaried staff a share of the year. */
export function periodPay(opts: { kind: 'hourly' | 'salary'; rate: number; regularHours: number; overtimeHours: number; frequency: PayFrequency; extra: number }) {
  const regularPay = opts.kind === 'hourly' ? round2(opts.regularHours * opts.rate) : round2(opts.rate / PERIODS_PER_YEAR[opts.frequency]);
  const overtimePay = opts.kind === 'hourly' ? round2(opts.overtimeHours * opts.rate * OVERTIME_MULTIPLIER) : 0;
  const extra = round2(opts.extra);
  return { regularPay, overtimePay, extra, gross: round2(regularPay + overtimePay + extra) };
}
