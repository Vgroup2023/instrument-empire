import { bracketTax, flag, marginalRateOf, num, round2, str, type Finding, type TaxInputs, type TaxLine, type TaxResult } from './types';

// Canadian federal personal income tax (T1 and Schedule 1), tax year 2025, for the common situations:
// employment income, self-employment, investment income and dividends, capital gains, RRSP and other
// deductions, and the usual non-refundable credits. Provincial or territorial tax is a separate calculation
// (Form 428) that is NOT included in this version, and the result says so.

export const PROVINCES: { value: string; label: string }[] = [
  { value: 'AB', label: 'Alberta' },
  { value: 'BC', label: 'British Columbia' },
  { value: 'MB', label: 'Manitoba' },
  { value: 'NB', label: 'New Brunswick' },
  { value: 'NL', label: 'Newfoundland and Labrador' },
  { value: 'NS', label: 'Nova Scotia' },
  { value: 'NT', label: 'Northwest Territories' },
  { value: 'NU', label: 'Nunavut' },
  { value: 'ON', label: 'Ontario' },
  { value: 'PE', label: 'Prince Edward Island' },
  { value: 'QC', label: 'Quebec' },
  { value: 'SK', label: 'Saskatchewan' },
  { value: 'YT', label: 'Yukon' },
];

export const CA_2025 = {
  year: 2025,
  brackets: { limits: [57375, 114750, 177882, 253414, Infinity], rates: [0.145, 0.205, 0.26, 0.29, 0.33] },
  /** The lowest rate for 2025 is 14.5% (15% for half the year, 14% after); non-refundable credits use it. */
  creditRate: 0.145,
  basicPersonal: { max: 16129, min: 14538, reduceFrom: 177882, reduceTo: 253414 },
  canadaEmployment: 1471,
  age: { amount: 9028, reduceFrom: 45522, rate: 0.15 },
  cpp: { rate: 0.0595, baseRate: 0.0495, enhancedRate: 0.01, exemption: 3500, maxPensionable: 71300, maxEmployeeContribution: 4034.1 },
  eiMax: 1077.48,
  capitalGainsInclusion: 0.5,
  dividends: {
    eligible: { grossUp: 0.38, creditRate: 0.150198 },
    nonEligible: { grossUp: 0.15, creditRate: 0.090301 },
  },
  donations: { firstAmount: 200, lowRate: 0.145, highRate: 0.29 },
};

export function computeCanada(inputs: TaxInputs): TaxResult {
  const T = CA_2025;
  const findings: Finding[] = [];
  const province = str(inputs, 'province', '');
  const notComputed: string[] = [
    'Provincial or territorial income tax (Form 428), Ontario Health Premium and provincial credits. Your total bill will be higher than the federal figure shown.',
    'Canada Workers Benefit, GST/HST credit and the Canada Child Benefit, which are paid separately.',
    'Medical expense claim, disability amount, moving expenses, home accessibility and other credits not listed in the interview.',
    'Alternative minimum tax and the foreign income and property reporting forms.',
  ];
  if (province === 'QC') notComputed.push('Quebec has its own return (TP-1). The federal tax shown here is before the Quebec abatement of 16.5%.');

  // --- Income ----------------------------------------------------------------------------------------------
  const employment = num(inputs, 'employmentIncome');
  const interest = num(inputs, 'interestIncome');
  const eligibleActual = num(inputs, 'eligibleDividends');
  const nonEligibleActual = num(inputs, 'nonEligibleDividends');
  const eligibleTaxable = round2(eligibleActual * (1 + T.dividends.eligible.grossUp));
  const nonEligibleTaxable = round2(nonEligibleActual * (1 + T.dividends.nonEligible.grossUp));
  const netGains = num(inputs, 'capitalGains');
  const taxableGains = netGains > 0 ? round2(netGains * T.capitalGainsInclusion) : 0;
  const otherIncome = num(inputs, 'otherIncome');
  const selfEmployment = round2(num(inputs, 'selfEmployedGross') - num(inputs, 'selfEmployedExpenses'));

  // --- CPP and EI -------------------------------------------------------------------------------------------
  const cppPaidEmployee = num(inputs, 'cppPaid');
  const eiPaid = num(inputs, 'eiPaid');
  // Self-employed people pay both halves of CPP on profit that still fits under the yearly maximum.
  let cppSelfEmployed = 0;
  if (selfEmployment > 0) {
    const pensionableUsed = cppPaidEmployee / T.cpp.rate;
    const room = Math.max(0, Math.min(T.cpp.maxPensionable, employment + selfEmployment) - T.cpp.exemption - pensionableUsed);
    cppSelfEmployed = round2(2 * T.cpp.rate * Math.min(selfEmployment, room));
  }
  const cppEmployeeCapped = Math.min(cppPaidEmployee, T.cpp.maxEmployeeContribution);
  const cppOverpaid = round2(Math.max(0, cppPaidEmployee - T.cpp.maxEmployeeContribution));
  const eiCapped = Math.min(eiPaid, T.eiMax);
  const eiOverpaid = round2(Math.max(0, eiPaid - T.eiMax));
  const selfHalf = cppSelfEmployed / 2;
  // Each person's own half is split: the base part earns a credit, the enhanced part is a deduction.
  const ownHalf = cppEmployeeCapped + selfHalf;
  const enhancedDeduction = round2(ownHalf * (T.cpp.enhancedRate / T.cpp.rate));
  const baseCppCredit = round2(ownHalf - enhancedDeduction);
  const employerHalfDeduction = round2(selfHalf);

  const totalIncome = round2(employment + interest + eligibleTaxable + nonEligibleTaxable + taxableGains + otherIncome + selfEmployment);

  // --- Deductions ---------------------------------------------------------------------------------------------
  const rrsp = num(inputs, 'rrspContribution');
  const fhsa = num(inputs, 'fhsaContribution');
  const childCare = num(inputs, 'childCare');
  const unionDues = num(inputs, 'unionDues');
  const otherDeductions = num(inputs, 'otherDeductions');
  const netIncome = round2(Math.max(0, totalIncome - enhancedDeduction - employerHalfDeduction - rrsp - fhsa - childCare - unionDues - otherDeductions));
  const taxableIncome = netIncome;

  // --- Federal tax before credits -------------------------------------------------------------------------------
  const taxBeforeCredits = round2(bracketTax(taxableIncome, T.brackets.limits, T.brackets.rates));
  const marginalRate = marginalRateOf(taxableIncome, T.brackets.limits, T.brackets.rates);

  // --- Non-refundable credits -------------------------------------------------------------------------------------
  const bp = T.basicPersonal;
  const basicPersonal =
    netIncome <= bp.reduceFrom ? bp.max : netIncome >= bp.reduceTo ? bp.min : bp.max - ((netIncome - bp.reduceFrom) / (bp.reduceTo - bp.reduceFrom)) * (bp.max - bp.min);
  const canadaEmployment = employment > 0 ? Math.min(T.canadaEmployment, employment) : 0;
  const ageAmount = flag(inputs, 'age65') ? Math.max(0, T.age.amount - T.age.rate * Math.max(0, netIncome - T.age.reduceFrom)) : 0;
  const spouseAmount = flag(inputs, 'hasSpouse') && !flag(inputs, 'spouseSelfSupporting') ? Math.max(0, bp.max - Math.max(0, num(inputs, 'spouseNetIncome'))) : 0;
  const tuition = num(inputs, 'tuitionAmount');
  const amounts = round2(basicPersonal + canadaEmployment + ageAmount + spouseAmount + baseCppCredit + eiCapped + tuition);
  const creditsFromAmounts = round2(amounts * T.creditRate);
  const donations = num(inputs, 'donations');
  const donationCredit = round2(
    T.donations.lowRate * Math.min(donations, T.donations.firstAmount) + T.donations.highRate * Math.max(0, donations - T.donations.firstAmount),
  );
  const dividendCredit = round2(eligibleTaxable * T.dividends.eligible.creditRate + nonEligibleTaxable * T.dividends.nonEligible.creditRate);
  const nonRefundable = round2(Math.min(taxBeforeCredits, creditsFromAmounts + donationCredit + dividendCredit));
  const federalTax = round2(taxBeforeCredits - nonRefundable);

  // --- Payments ----------------------------------------------------------------------------------------------------
  const taxDeducted = num(inputs, 'taxDeducted');
  const installments = num(inputs, 'installmentsPaid');
  const refundableOther = num(inputs, 'refundableCredits');
  const totalPayments = round2(taxDeducted + installments + cppOverpaid + eiOverpaid + refundableOther);
  const totalTax = round2(federalTax + cppSelfEmployed);
  const balance = round2(totalTax - totalPayments);

  // --- Findings ----------------------------------------------------------------------------------------------------
  if (!province) findings.push({ level: 'warn', title: 'Choose your province or territory', detail: 'It sets your provincial tax, which is added to the federal tax shown here.' });
  if (netGains < 0) findings.push({ level: 'info', title: 'Net capital loss', detail: `A net capital loss cannot reduce other income this year. $${Math.round(-netGains * T.capitalGainsInclusion).toLocaleString()} of allowable loss can be carried back 3 years or forward.` });
  if (cppOverpaid > 0 || eiOverpaid > 0) findings.push({ level: 'info', title: 'Over-contributed to CPP or EI', detail: 'With more than one employer you can pay above the yearly maximum. The excess is refunded on your return and is counted in your payments.' });
  if (selfEmployment > 0 && installments === 0 && balance > 3000) findings.push({ level: 'tip', title: 'Pay instalments next year', detail: 'You have self-employment income and owe a balance. Quarterly instalments avoid interest and a large bill in April.' });
  if (rrsp === 0 && totalIncome > 60000) findings.push({ level: 'tip', title: 'An RRSP contribution would lower your tax', detail: `At your income, each $1,000 contributed saves about $${Math.round(marginalRate * 1000)} of federal tax. Check your room on your last Notice of Assessment. The deadline is 60 days after the year ends.` });
  if (balance < -3000 && employment > 0) findings.push({ level: 'tip', title: 'Large refund', detail: 'You are overpaying through the year. Form TD1 and the T1213 request can lower the tax withheld from each paycheque.' });
  if (flag(inputs, 'age65') && !flag(inputs, 'hasPensionIncome')) findings.push({ level: 'tip', title: 'Pension income amount', detail: 'If you receive eligible pension income, a further credit of up to $2,000 of income applies. It is not calculated in this version.' });
  if (donations > 0) findings.push({ level: 'info', title: 'Donation credit uses standard rates', detail: 'The credit is 14.5% on the first $200 and 29% above that. A higher rate applies to the part of donations covered by income over $253,414.' });

  const lines: TaxLine[] = [
    { label: 'Income', amount: 0, heading: true },
    { label: 'Employment income', amount: employment, ref: 'T1 line 10100' },
    { label: 'Interest and other investment income', amount: interest, ref: 'line 12100' },
    { label: 'Taxable dividends (grossed up)', amount: round2(eligibleTaxable + nonEligibleTaxable), ref: 'lines 12000 and 12010' },
    { label: 'Taxable capital gains', amount: taxableGains, ref: 'line 12700' },
    { label: 'Self-employment income', amount: selfEmployment, ref: 'lines 13500 to 14300' },
    { label: 'Other income', amount: otherIncome, ref: 'line 13000' },
    { label: 'Total income', amount: totalIncome, ref: 'line 15000', bold: true },
    { label: 'CPP deductions (enhanced part and employer half)', amount: -round2(enhancedDeduction + employerHalfDeduction), ref: 'lines 22200 and 22215' },
    { label: 'RRSP and FHSA deductions', amount: -round2(rrsp + fhsa), ref: 'lines 20800 and 20805' },
    { label: 'Child care, union dues and other deductions', amount: -round2(childCare + unionDues + otherDeductions), ref: 'lines 21400, 21200 and others' },
    { label: 'Net income and taxable income', amount: netIncome, ref: 'lines 23600 and 26000', bold: true },
    { label: 'Federal tax and credits', amount: 0, heading: true },
    { label: 'Federal tax on taxable income', amount: taxBeforeCredits, ref: 'Schedule 1' },
    { label: 'Non-refundable credits', amount: -nonRefundable, ref: 'Schedule 1', note: 'Personal, employment, CPP/EI, age, spouse, tuition, donations and dividend credits' },
    { label: 'Federal tax', amount: federalTax, ref: 'line 42000', bold: true },
    ...(cppSelfEmployed > 0 ? [{ label: 'CPP on self-employment income', amount: cppSelfEmployed, ref: 'line 42100' }] : []),
    { label: 'Total federal tax payable (before provincial tax)', amount: totalTax, bold: true },
    { label: 'Payments', amount: 0, heading: true },
    { label: 'Income tax deducted at source', amount: taxDeducted, ref: 'line 43700' },
    ...(installments > 0 ? [{ label: 'Tax instalments paid', amount: installments, ref: 'line 47600' }] : []),
    ...(cppOverpaid + eiOverpaid > 0 ? [{ label: 'CPP and EI overpayment refund', amount: round2(cppOverpaid + eiOverpaid), ref: 'lines 44800 and 45000' }] : []),
    ...(refundableOther > 0 ? [{ label: 'Other refundable credits', amount: refundableOther }] : []),
    { label: 'Total payments', amount: totalPayments, bold: true },
    { label: balance > 0 ? 'Federal balance owing (before provincial tax)' : 'Federal refund (before provincial tax)', amount: Math.abs(balance), bold: true },
  ];

  return {
    country: 'CA',
    taxYear: T.year,
    lines,
    totalIncome,
    adjustedIncome: netIncome,
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
