import { stateTaxEstimate } from './states';
import { bracketTax, flag, marginalRateOf, num, round2, str, type Finding, type TaxInputs, type TaxLine, type TaxResult } from './types';

// U.S. federal individual income tax (Form 1040), tax year 2025, for the common situations: wages, interest and
// dividends, investment gains, self-employment (Schedule C and SE), standard or itemized deductions, the child
// tax credit and payments. It is an estimate to prepare a return from, not a filed return. Every figure below
// comes from this one table so a new tax year is a data change, not a code change.

export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh';
export const FILING_STATUSES: { value: FilingStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'mfj', label: 'Married filing jointly' },
  { value: 'mfs', label: 'Married filing separately' },
  { value: 'hoh', label: 'Head of household' },
];

export const US_2025 = {
  year: 2025,
  standardDeduction: { single: 15750, mfj: 31500, mfs: 15750, hoh: 23625 } as Record<FilingStatus, number>,
  /** Added per taxpayer who is 65 or older or blind. */
  extraStandardDeduction: { single: 2000, hoh: 2000, mfj: 1600, mfs: 1600 } as Record<FilingStatus, number>,
  brackets: {
    single: { limits: [11925, 48475, 103350, 197300, 250525, 626350, Infinity], rates: [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37] },
    mfj: { limits: [23850, 96950, 206700, 394600, 501050, 751600, Infinity], rates: [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37] },
    mfs: { limits: [11925, 48475, 103350, 197300, 250525, 375800, Infinity], rates: [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37] },
    hoh: { limits: [17000, 64850, 103350, 197300, 250500, 626350, Infinity], rates: [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37] },
  } as Record<FilingStatus, { limits: number[]; rates: number[] }>,
  /** Top of the 0% and 15% bands for qualified dividends and long-term gains. */
  capGains: {
    single: { zero: 48350, fifteen: 533400 },
    mfj: { zero: 96700, fifteen: 600050 },
    mfs: { zero: 48350, fifteen: 300000 },
    hoh: { zero: 64750, fifteen: 566700 },
  } as Record<FilingStatus, { zero: number; fifteen: number }>,
  capitalLossLimit: { single: 3000, mfj: 3000, hoh: 3000, mfs: 1500 } as Record<FilingStatus, number>,
  socialSecurityWageBase: 176100,
  /** Additional Medicare tax and net investment income tax start here. */
  highIncomeThreshold: { single: 200000, hoh: 200000, mfj: 250000, mfs: 125000 } as Record<FilingStatus, number>,
  childTaxCredit: { perChild: 2200, otherDependent: 500, refundableMax: 1700, phaseOutStart: { single: 200000, hoh: 200000, mfs: 200000, mfj: 400000 } as Record<FilingStatus, number> },
  qbiThreshold: { single: 197300, hoh: 197300, mfs: 197300, mfj: 394600 } as Record<FilingStatus, number>,
  saltCap: { normal: 40000, floor: 10000, phaseOutStart: 500000, mfsNormal: 20000, mfsFloor: 5000, mfsPhaseOutStart: 250000 },
  seniorDeduction: { amount: 6000, phaseOutStart: { single: 75000, hoh: 75000, mfs: 75000, mfj: 150000 } as Record<FilingStatus, number>, rate: 0.06 },
  medicalFloorRate: 0.075,
  studentLoanInterest: { max: 2500, phaseOut: { single: [85000, 100000], hoh: [85000, 100000], mfj: [170000, 200000], mfs: [0, 0] } as Record<FilingStatus, [number, number]> },
  /** American opportunity and lifetime learning credits share these income limits. */
  educationCredit: { phaseOut: { single: [80000, 90000], hoh: [80000, 90000], mfj: [160000, 180000], mfs: [0, 0] } as Record<FilingStatus, [number, number]> },
  /** Earned income credit by number of qualifying children (3 means three or more). Phase-out starts at the single or joint threshold. */
  eitc: {
    investmentLimit: 11950,
    byChildren: [
      { rate: 0.0765, earnedAmount: 8490, phaseOutRate: 0.0765, threshold: { single: 10620, mfj: 17730 } },
      { rate: 0.34, earnedAmount: 12730, phaseOutRate: 0.1598, threshold: { single: 23350, mfj: 30470 } },
      { rate: 0.4, earnedAmount: 17880, phaseOutRate: 0.2106, threshold: { single: 23350, mfj: 30470 } },
      { rate: 0.45, earnedAmount: 17880, phaseOutRate: 0.2106, threshold: { single: 23350, mfj: 30470 } },
    ],
  },
};

function overlap(lo: number, hi: number, bandLo: number, bandHi: number): number {
  return Math.max(0, Math.min(hi, bandHi) - Math.max(lo, bandLo));
}

export function computeUs(inputs: TaxInputs): TaxResult {
  const T = US_2025;
  const rawStatus = str(inputs, 'filingStatus', 'single');
  const status: FilingStatus = (['single', 'mfj', 'mfs', 'hoh'] as const).includes(rawStatus as FilingStatus) ? (rawStatus as FilingStatus) : 'single';
  const findings: Finding[] = [];
  const notComputed: string[] = [
    'Retirement-saver credit, dependent care credit, residential energy credits and other credits not listed in the interview.',
    'Alternative minimum tax, underpayment penalty and the passive-loss rules.',
    'Qualified tips, qualified overtime and car-loan-interest deductions.',
  ];

  // --- Income ---------------------------------------------------------------------------------------------
  const wages = num(inputs, 'wages');
  const interest = num(inputs, 'interest');
  const ordinaryDividends = num(inputs, 'ordinaryDividends');
  const qualifiedDividends = Math.min(num(inputs, 'qualifiedDividends'), ordinaryDividends);
  const shortTerm = num(inputs, 'shortTermGains');
  const longTerm = num(inputs, 'longTermGains');
  const otherIncome = num(inputs, 'otherIncome');
  const businessProfit = round2(num(inputs, 'businessIncome') - num(inputs, 'businessExpenses'));

  const netCapital = shortTerm + longTerm;
  const lossLimit = T.capitalLossLimit[status];
  const preferentialGains = longTerm > 0 ? Math.max(0, Math.min(longTerm, netCapital)) : 0;
  const capitalInIncome = netCapital >= 0 ? netCapital : -Math.min(-netCapital, lossLimit);
  const capitalLossCarryover = netCapital < 0 ? Math.max(0, -netCapital - lossLimit) : 0;

  const totalIncome = round2(wages + interest + ordinaryDividends + capitalInIncome + otherIncome + businessProfit);

  // --- Self-employment tax --------------------------------------------------------------------------------
  const seEarnings = businessProfit > 0 ? round2(businessProfit * 0.9235) : 0;
  let seTax = 0;
  if (seEarnings >= 400) {
    const socialSecurity = 0.124 * Math.min(seEarnings, Math.max(0, T.socialSecurityWageBase - wages));
    seTax = round2(socialSecurity + 0.029 * seEarnings);
  }
  const halfSeTax = round2(seTax / 2);

  // --- Adjustments, AGI -----------------------------------------------------------------------------------
  const otherAdjustments = num(inputs, 'adjustments');
  const beforeStudentLoan = round2(totalIncome - halfSeTax - otherAdjustments);
  const [sliStart, sliEnd] = T.studentLoanInterest.phaseOut[status];
  const sliFactor = status === 'mfs' ? 0 : beforeStudentLoan <= sliStart ? 1 : beforeStudentLoan >= sliEnd ? 0 : (sliEnd - beforeStudentLoan) / (sliEnd - sliStart);
  const studentLoanPaid = Math.max(0, num(inputs, 'studentLoanInterest'));
  const studentLoanDeduction = round2(Math.min(studentLoanPaid, T.studentLoanInterest.max) * sliFactor);
  const adjustedIncome = round2(beforeStudentLoan - studentLoanDeduction);
  if (studentLoanPaid > 0 && studentLoanDeduction < Math.min(studentLoanPaid, T.studentLoanInterest.max)) findings.push({ level: 'info', title: 'Student loan interest deduction is reduced', detail: status === 'mfs' ? 'Married filing separately cannot take it.' : 'Your income is in the range where the deduction phases out.' });

  // --- Deduction: standard or itemized, whichever is larger unless chosen ----------------------------------
  const age65 = Math.min(Math.max(Math.trunc(num(inputs, 'age65Count')), 0), status === 'mfj' ? 2 : 1);
  const blind = Math.min(Math.max(Math.trunc(num(inputs, 'blindCount')), 0), status === 'mfj' ? 2 : 1);
  const standard = T.standardDeduction[status] + (age65 + blind) * T.extraStandardDeduction[status];

  const isMfs = status === 'mfs';
  const saltLimit = Math.max(
    isMfs ? T.saltCap.mfsFloor : T.saltCap.floor,
    (isMfs ? T.saltCap.mfsNormal : T.saltCap.normal) - 0.3 * Math.max(0, adjustedIncome - (isMfs ? T.saltCap.mfsPhaseOutStart : T.saltCap.phaseOutStart)),
  );
  const saltPaid = num(inputs, 'saltPaid');
  const salt = Math.min(saltPaid, saltLimit);
  const medical = Math.max(0, num(inputs, 'medicalExpenses') - T.medicalFloorRate * Math.max(0, adjustedIncome));
  const charity = Math.min(num(inputs, 'charity'), 0.6 * Math.max(0, adjustedIncome));
  const itemized = round2(salt + medical + num(inputs, 'mortgageInterest') + charity + num(inputs, 'otherItemized'));
  const choice = str(inputs, 'deductionChoice', 'auto');
  const useItemized = choice === 'itemized' ? true : choice === 'standard' ? false : itemized > standard;
  const deduction = useItemized ? itemized : standard;
  if (saltPaid > saltLimit) findings.push({ level: 'info', title: 'State and local tax deduction is capped', detail: `You entered $${Math.round(saltPaid).toLocaleString()} but only $${Math.round(saltLimit).toLocaleString()} can be deducted for 2025.` });

  // Senior deduction (2025-2028): per taxpayer 65 or older, reduced as income rises.
  const seniors = age65;
  const seniorDeduction = seniors
    ? Math.max(0, T.seniorDeduction.amount * seniors - T.seniorDeduction.rate * Math.max(0, adjustedIncome - T.seniorDeduction.phaseOutStart[status]))
    : 0;

  // --- Qualified business income deduction (simple case only) ----------------------------------------------
  const taxableBeforeQbi = Math.max(0, adjustedIncome - deduction - seniorDeduction);
  let qbiDeduction = 0;
  if (businessProfit > 0) {
    if (taxableBeforeQbi > T.qbiThreshold[status]) {
      notComputed.push('The qualified business income deduction: your income is above the level where W-2 wage and property limits apply. A preparer should work it out.');
      findings.push({ level: 'warn', title: 'Qualified business income deduction not included', detail: 'Your taxable income is above the simple-case limit. The deduction can be worth up to 20% of business profit; ask a preparer to calculate it.' });
    } else {
      const qbi = Math.max(0, businessProfit - halfSeTax);
      const netGainAndQualDiv = Math.max(0, preferentialGains) + qualifiedDividends;
      qbiDeduction = round2(Math.min(0.2 * qbi, 0.2 * Math.max(0, taxableBeforeQbi - netGainAndQualDiv)));
    }
  }

  const taxableIncome = round2(Math.max(0, taxableBeforeQbi - qbiDeduction));

  // --- Regular tax with qualified dividends and long-term gains at their own rates -------------------------
  const preferential = Math.min(preferentialGains + qualifiedDividends, taxableIncome);
  const ordinaryTaxable = round2(taxableIncome - preferential);
  const band = T.brackets[status];
  const ordinaryTax = bracketTax(ordinaryTaxable, band.limits, band.rates);
  const cg = T.capGains[status];
  const gainsEnd = ordinaryTaxable + preferential;
  const at15 = overlap(ordinaryTaxable, gainsEnd, cg.zero, cg.fifteen);
  const at20 = overlap(ordinaryTaxable, gainsEnd, cg.fifteen, Infinity);
  const regularTax = round2(ordinaryTax + 0.15 * at15 + 0.2 * at20);
  const marginalRate = marginalRateOf(ordinaryTaxable, band.limits, band.rates);

  // --- Education credits (Form 8863) --------------------------------------------------------------------------------
  const [edStart, edEnd] = T.educationCredit.phaseOut[status];
  const edFactor = status === 'mfs' ? 0 : adjustedIncome <= edStart ? 1 : adjustedIncome >= edEnd ? 0 : (edEnd - adjustedIncome) / (edEnd - edStart);
  const aotcEach = [1, 2, 3, 4].map((i) => Math.max(0, num(inputs, `aotcExpenses${i}`))).map((e) => Math.min(2000, e) + 0.25 * Math.min(2000, Math.max(0, e - 2000)));
  const aotcFull = aotcEach.reduce((a, b) => a + b, 0);
  const aotc = round2(aotcFull * edFactor);
  const aotcRefundable = round2(aotc * 0.4);
  const lifetime = round2(0.2 * Math.min(10000, Math.max(0, num(inputs, 'llcExpenses'))) * edFactor);
  const educationNonRefundable = Math.min(round2(aotc - aotcRefundable + lifetime), regularTax);
  if ((aotcFull > 0 || num(inputs, 'llcExpenses') > 0) && status === 'mfs') findings.push({ level: 'info', title: 'No education credits when married filing separately', detail: 'Neither the American opportunity nor the lifetime learning credit is allowed.' });
  else if (aotcFull + Math.min(10000, num(inputs, 'llcExpenses')) * 0.2 > 0 && edFactor < 1) findings.push({ level: 'info', title: 'Education credits are reduced', detail: edFactor === 0 ? 'Your income is above the limit, so no education credit applies.' : 'Your income is in the range where the education credits phase out.' });

  // --- Earned income credit -----------------------------------------------------------------------------------------
  const earnedForEitc = Math.max(0, wages + businessProfit - halfSeTax);
  const investmentIncome = Math.max(0, interest + ordinaryDividends + Math.max(0, netCapital));
  const eitcKids = Math.min(Math.max(Math.trunc(num(inputs, 'eitcChildren')), 0), 3);
  const eitcEligibleType = eitcKids > 0 || flag(inputs, 'eitcChildlessEligible');
  let eitc = 0;
  if (eitcEligibleType && status !== 'mfs' && investmentIncome <= T.eitc.investmentLimit) {
    const row = T.eitc.byChildren[eitcKids];
    const maxCredit = Math.round(row.rate * row.earnedAmount);
    const threshold = status === 'mfj' ? row.threshold.mfj : row.threshold.single;
    eitc = Math.max(0, Math.min(Math.round(row.rate * earnedForEitc * 100) / 100, maxCredit) - row.phaseOutRate * Math.max(0, Math.max(adjustedIncome, earnedForEitc) - threshold));
    eitc = round2(eitc);
  }
  if (eitcEligibleType && investmentIncome > T.eitc.investmentLimit) findings.push({ level: 'info', title: 'No earned income credit', detail: `Investment income of $${Math.round(investmentIncome).toLocaleString()} is over the $${T.eitc.investmentLimit.toLocaleString()} limit.` });
  if (eitcEligibleType && status === 'mfs') findings.push({ level: 'info', title: 'Earned income credit and married filing separately', detail: 'Separated spouses can sometimes claim it, but that case is not calculated here.' });
  if (eitc > 0) findings.push({ level: 'tip', title: 'Earned income credit included', detail: `Calculated from the IRS formula, so the IRS table may differ by a few dollars. Everyone on the claim, and each qualifying child, needs a valid Social Security number, and the credit is a common audit target: keep proof of where the child lived.` });

  // --- Child tax credit -------------------------------------------------------------------------------------
  const children = Math.max(0, Math.trunc(num(inputs, 'childrenUnder17')));
  const otherDependents = Math.max(0, Math.trunc(num(inputs, 'otherDependents')));
  const ctcMax = children * T.childTaxCredit.perChild + otherDependents * T.childTaxCredit.otherDependent;
  const over = Math.max(0, adjustedIncome - T.childTaxCredit.phaseOutStart[status]);
  const ctcAllowed = Math.max(0, ctcMax - Math.ceil(over / 1000) * 50);
  const nonRefundableCtc = Math.min(ctcAllowed, Math.max(0, regularTax - educationNonRefundable));
  const earnedIncome = Math.max(0, wages + businessProfit - halfSeTax);
  const additionalCtc = Math.min(
    ctcAllowed - nonRefundableCtc,
    children * T.childTaxCredit.refundableMax,
    Math.max(0, 0.15 * (earnedIncome - 2500)),
  );
  const otherNonRefundable = Math.min(Math.max(0, num(inputs, 'otherCredits')), Math.max(0, regularTax - educationNonRefundable - nonRefundableCtc));
  const incomeTaxAfterCredits = round2(Math.max(0, regularTax - educationNonRefundable - nonRefundableCtc - otherNonRefundable));

  // --- Other taxes --------------------------------------------------------------------------------------------
  const threshold = T.highIncomeThreshold[status];
  const additionalMedicare = round2(0.009 * Math.max(0, wages + seEarnings - threshold));
  const niit = round2(0.038 * Math.min(investmentIncome, Math.max(0, adjustedIncome - threshold)));
  const federalOnlyTax = round2(incomeTaxAfterCredits + seTax + additionalMedicare + niit);
  let totalTax = federalOnlyTax;

  // --- State (estimate) ---------------------------------------------------------------------------------------------
  const stateCode = str(inputs, 'state', '');
  const state = stateCode ? stateTaxEstimate(stateCode, adjustedIncome, status === 'mfj', children + otherDependents) : null;
  const stateTax = state?.computed ? state.tax : 0;
  const stateWithheld = state?.computed ? num(inputs, 'stateWithholding') + num(inputs, 'stateEstimatedPayments') : 0;
  if (!stateCode) notComputed.push('State income tax, until you choose your state.');
  else if (state && !state.computed) notComputed.push(state.note ?? 'State income tax for the state you chose.');
  else if (state?.computed && !state.noIncomeTax) notComputed.push('State income tax is an estimate from published 2025 rates. Your state return may differ because of state-specific income adjustments, credits, exemption phase-outs, local taxes and rate changes made after January 1, 2025.');
  const federalTotalTax = federalOnlyTax;
  totalTax = round2(federalOnlyTax + stateTax);

  // --- Payments -------------------------------------------------------------------------------------------------
  const withheld = num(inputs, 'wageWithholding') + num(inputs, 'otherWithholding');
  const estimated = num(inputs, 'estimatedPayments');
  const refundableCredits = round2(additionalCtc + eitc + aotcRefundable + num(inputs, 'refundableCredits'));
  const federalPayments = round2(withheld + estimated + refundableCredits);
  const federalBalance = round2(federalTotalTax - federalPayments);
  const stateBalance = round2(stateTax - stateWithheld);
  const totalPayments = round2(federalPayments + stateWithheld);
  const balance = round2(federalBalance + stateBalance);

  // --- Findings ---------------------------------------------------------------------------------------------------
  if (flag(inputs, 'hasTipsOrOvertime')) findings.push({ level: 'warn', title: 'New 2025 deductions are not included', detail: 'You said you earned tips or overtime or paid car-loan interest. Those new deductions exist for 2025 but are not calculated here yet. Ask a preparer, as they could lower your tax.' });
  if (status === 'mfs') findings.push({ level: 'tip', title: 'Married filing separately', detail: 'Filing separately usually costs more than filing jointly and limits several credits. Compare before you choose it.' });
  if (!useItemized && itemized > 0 && itemized <= standard) findings.push({ level: 'info', title: 'Standard deduction is better for you', detail: `Your itemized deductions ($${Math.round(itemized).toLocaleString()}) are below the standard deduction ($${Math.round(standard).toLocaleString()}), so the standard deduction was used.` });
  if (useItemized && choice === 'itemized' && itemized < standard) findings.push({ level: 'tip', title: 'You chose to itemize but standard is higher', detail: `Standard deduction is $${Math.round(standard).toLocaleString()} versus $${Math.round(itemized).toLocaleString()} itemized. Switching would cut your tax by about $${Math.round((standard - itemized) * marginalRate).toLocaleString()}.` });
  if (interest + ordinaryDividends > 1500) findings.push({ level: 'info', title: 'Schedule B needed', detail: 'Interest and dividends over $1,500 are listed payer by payer on Schedule B.' });
  if (businessProfit < 0) findings.push({ level: 'info', title: 'Business loss', detail: 'A business loss lowers your other income this year. Keep records in case the IRS asks whether the activity is a business or a hobby.' });
  if (businessProfit > 0 && estimated === 0 && balance > 1000) findings.push({ level: 'tip', title: 'Pay estimated tax next year', detail: 'You have self-employment profit and no estimated payments. Quarterly payments avoid an underpayment penalty and a large bill in April.' });
  if (capitalLossCarryover > 0) findings.push({ level: 'info', title: 'Capital loss carries forward', detail: `$${Math.round(capitalLossCarryover).toLocaleString()} of capital loss is above this year's limit and carries to next year.` });
  if (balance > 1000 && wages > 0) findings.push({ level: 'tip', title: 'You owe a balance', detail: 'Consider a new W-4 so more is withheld from each paycheck next year and April holds no surprise.' });
  if (balance < -3000 && wages > 0 && businessProfit <= 0) findings.push({ level: 'tip', title: 'Large refund', detail: 'A large refund means you lent the government money all year. A new W-4 would put more of it in each paycheck.' });
  if (state?.note && !state.computed) findings.push({ level: 'info', title: `${state.name} state tax`, detail: state.note });
  if (state?.computed && !state.noIncomeTax) findings.push({ level: 'info', title: 'State tax is an estimate', detail: `Based on published ${T.year} ${state.name} rates and your federal adjusted gross income. Check it against your ${state.name} return before you rely on it.` });
  if (children > 0 && ctcAllowed < ctcMax) findings.push({ level: 'info', title: 'Child tax credit reduced', detail: 'Your income is above the point where the credit starts to phase out.' });

  // --- The return, line by line -----------------------------------------------------------------------------------
  const lines: TaxLine[] = [
    { label: 'Income', amount: 0, heading: true },
    { label: 'Wages, salaries, tips', amount: wages, ref: '1040 line 1z' },
    { label: 'Interest and dividends', amount: interest + ordinaryDividends, ref: 'Schedule B' },
    { label: 'Capital gains (or limited loss)', amount: capitalInIncome, ref: 'Schedule D' },
    { label: 'Business profit or loss', amount: businessProfit, ref: 'Schedule C' },
    { label: 'Other income', amount: otherIncome, ref: 'Schedule 1' },
    { label: 'Total income', amount: totalIncome, ref: '1040 line 9', bold: true },
    { label: 'Half of self-employment tax', amount: -halfSeTax, ref: 'Schedule 1' },
    { label: 'Other adjustments you entered', amount: -otherAdjustments, ref: 'Schedule 1' },
    ...(studentLoanDeduction > 0 ? [{ label: 'Student loan interest deduction', amount: -studentLoanDeduction, ref: 'Schedule 1' }] : []),
    { label: 'Adjusted gross income', amount: adjustedIncome, ref: '1040 line 11', bold: true },
    { label: 'Deductions', amount: 0, heading: true },
    { label: useItemized ? 'Itemized deductions' : 'Standard deduction', amount: -deduction, ref: '1040 line 12e' },
    ...(seniorDeduction > 0 ? [{ label: 'Senior deduction', amount: -seniorDeduction, ref: 'Schedule 1-A' }] : []),
    ...(qbiDeduction > 0 ? [{ label: 'Qualified business income deduction', amount: -qbiDeduction, ref: '1040 line 13' }] : []),
    { label: 'Taxable income', amount: taxableIncome, ref: '1040 line 15', bold: true },
    { label: 'Tax and credits', amount: 0, heading: true },
    { label: 'Tax on taxable income', amount: regularTax, ref: '1040 line 16' },
    ...(educationNonRefundable > 0 ? [{ label: 'Education credits', amount: -educationNonRefundable, ref: 'Form 8863' }] : []),
    ...(nonRefundableCtc > 0 ? [{ label: 'Child and dependent credit', amount: -nonRefundableCtc, ref: 'Schedule 8812' }] : []),
    ...(otherNonRefundable > 0 ? [{ label: 'Other credits you entered', amount: -otherNonRefundable, ref: 'Schedule 3' }] : []),
    ...(seTax > 0 ? [{ label: 'Self-employment tax', amount: seTax, ref: 'Schedule SE' }] : []),
    ...(additionalMedicare > 0 ? [{ label: 'Additional Medicare tax', amount: additionalMedicare, ref: 'Form 8959' }] : []),
    ...(niit > 0 ? [{ label: 'Net investment income tax', amount: niit, ref: 'Form 8960' }] : []),
    { label: 'Total federal tax', amount: federalTotalTax, ref: '1040 line 24', bold: true },
    { label: 'Payments', amount: 0, heading: true },
    { label: 'Tax withheld', amount: withheld, ref: '1040 line 25' },
    ...(estimated > 0 ? [{ label: 'Estimated tax payments', amount: estimated, ref: '1040 line 26' }] : []),
    ...(eitc > 0 ? [{ label: 'Earned income credit', amount: eitc, ref: '1040 line 27' }] : []),
    ...(additionalCtc > 0 ? [{ label: 'Additional child tax credit', amount: round2(additionalCtc), ref: '1040 line 28' }] : []),
    ...(aotcRefundable > 0 ? [{ label: 'American opportunity credit (refundable part)', amount: aotcRefundable, ref: '1040 line 29' }] : []),
    ...(num(inputs, 'refundableCredits') > 0 ? [{ label: 'Other refundable credits you entered', amount: num(inputs, 'refundableCredits') }] : []),
    { label: 'Total federal payments', amount: federalPayments, ref: '1040 line 33', bold: true },
    { label: federalBalance > 0 ? 'Federal amount you owe' : 'Federal refund', amount: Math.abs(federalBalance), ref: federalBalance > 0 ? '1040 line 37' : '1040 line 35a', bold: true },
    ...(state?.computed && !state.noIncomeTax
      ? [
          { label: `${state.name} income tax (estimate)`, amount: 0, heading: true },
          { label: `Taxable income in ${state.name}`, amount: state.taxableIncome },
          { label: `${state.name} income tax (estimate)`, amount: stateTax, bold: true },
          { label: 'State tax withheld and paid', amount: stateWithheld },
          { label: stateBalance > 0 ? 'State amount you owe (estimate)' : 'State refund (estimate)', amount: Math.abs(stateBalance), bold: true },
          { label: balance > 0 ? 'Total you owe, federal and state' : 'Total refund, federal and state', amount: Math.abs(balance), bold: true },
        ]
      : state?.computed && state.noIncomeTax
        ? [{ label: `${state.name}: no state income tax`, amount: 0, heading: true }]
        : []),
  ];

  return {
    country: 'US',
    taxYear: T.year,
    lines,
    totalIncome,
    adjustedIncome,
    taxableIncome,
    totalTax,
    totalPayments,
    balance,
    marginalRate,
    effectiveRate: totalIncome > 0 ? round2(totalTax / totalIncome) : 0,
    findings,
    notComputed,
  };
}
