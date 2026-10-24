import { PROVINCES } from './canada';
import { FILING_STATUSES } from './us';
import type { Country, TaxInputs } from './types';

// The guided interview. Plain questions in plain words; each answer is one named value that the tax engine reads.
// Adding a question is adding a line here. Nothing else needs to change.

export type FieldKind = 'money' | 'count' | 'select' | 'bool';

export interface Field {
  key: string;
  label: string;
  help?: string;
  kind: FieldKind;
  options?: { value: string; label: string }[];
  /** Hidden unless this returns true. */
  when?: (inputs: TaxInputs) => boolean;
}

export interface Step {
  id: string;
  title: string;
  intro: string;
  fields: Field[];
}

const yes = (inputs: TaxInputs, key: string) => inputs[key] === true;

const US_STEPS: Step[] = [
  {
    id: 'about',
    title: 'About you',
    intro: 'Start with how you file and who is on the return. You do not need to enter Social Security numbers here.',
    fields: [
      { key: 'filingStatus', label: 'Filing status', kind: 'select', options: FILING_STATUSES, help: 'If you are married, filing jointly is usually the lowest tax. Head of household needs a qualifying person and you paid more than half the cost of keeping up a home.' },
      { key: 'age65Count', label: 'How many people on this return are 65 or older?', kind: 'count', help: 'Counts for a higher standard deduction and the new senior deduction.' },
      { key: 'blindCount', label: 'How many people on this return are blind?', kind: 'count' },
      { key: 'childrenUnder17', label: 'Children under 17 who live with you', kind: 'count', help: 'Each child with a Social Security number can earn the $2,200 child tax credit.' },
      { key: 'otherDependents', label: 'Other dependents (age 17 or older, or other relatives)', kind: 'count', help: 'Worth a $500 credit each.' },
    ],
  },
  {
    id: 'wages',
    title: 'Job income (W-2)',
    intro: 'Add up the boxes from every W-2 you received.',
    fields: [
      { key: 'wages', label: 'Wages, salaries and tips (W-2 box 1, all jobs added)', kind: 'money' },
      { key: 'wageWithholding', label: 'Federal income tax withheld (W-2 box 2, all jobs added)', kind: 'money', help: 'This is tax you already paid through your paychecks.' },
      { key: 'hasTipsOrOvertime', label: 'I earned tips or overtime pay, or paid interest on a new car loan', kind: 'bool', help: 'New deductions for these exist for 2025. We will flag them for a preparer.' },
    ],
  },
  {
    id: 'investments',
    title: 'Interest, dividends and investments',
    intro: 'From your 1099-INT, 1099-DIV and 1099-B forms.',
    fields: [
      { key: 'interest', label: 'Taxable interest (1099-INT)', kind: 'money' },
      { key: 'ordinaryDividends', label: 'Ordinary dividends (1099-DIV box 1a)', kind: 'money' },
      { key: 'qualifiedDividends', label: 'Qualified dividends (1099-DIV box 1b)', kind: 'money', help: 'Part of the figure above. Taxed at the lower investment rates.' },
      { key: 'shortTermGains', label: 'Short-term capital gain or loss (held one year or less)', kind: 'money', help: 'Use a minus sign for a loss.' },
      { key: 'longTermGains', label: 'Long-term capital gain or loss (held more than one year)', kind: 'money', help: 'Use a minus sign for a loss.' },
      { key: 'otherIncome', label: 'Any other income (unemployment, taxable refunds, prizes, side income not from a business)', kind: 'money' },
    ],
  },
  {
    id: 'business',
    title: 'Self-employment or small business',
    intro: 'Skip this if you have no business or freelance income. Otherwise enter the year in total. This becomes Schedule C.',
    fields: [
      { key: 'businessIncome', label: 'Total business income (sales and fees received)', kind: 'money' },
      { key: 'businessExpenses', label: 'Total business expenses', kind: 'money', help: 'Supplies, software, travel, home office, vehicle and other costs of doing business.' },
    ],
  },
  {
    id: 'deductions',
    title: 'Deductions and credits',
    intro: 'We compare the standard deduction with itemizing and use whichever lowers your tax.',
    fields: [
      { key: 'adjustments', label: 'Other adjustments to income (IRA, HSA, student loan interest, educator expenses)', kind: 'money', help: 'Enter the deductible amount from your forms, after any limits.' },
      { key: 'saltPaid', label: 'State and local taxes paid (income or sales tax plus property tax)', kind: 'money', help: 'Capped at $40,000 for 2025.' },
      { key: 'mortgageInterest', label: 'Home mortgage interest (1098)', kind: 'money' },
      { key: 'charity', label: 'Gifts to charity', kind: 'money' },
      { key: 'medicalExpenses', label: 'Medical and dental costs you paid yourself', kind: 'money', help: 'Only the part above 7.5% of your income counts.' },
      { key: 'otherItemized', label: 'Other itemized deductions', kind: 'money' },
      { key: 'deductionChoice', label: 'Which deduction to use', kind: 'select', options: [{ value: 'auto', label: 'Use whichever is bigger (recommended)' }, { value: 'standard', label: 'Standard deduction' }, { value: 'itemized', label: 'Itemize' }] },
      { key: 'otherCredits', label: 'Other credits you already worked out (not refundable)', kind: 'money', help: 'For example the foreign tax credit or residential energy credit.' },
      { key: 'refundableCredits', label: 'Other refundable credits you already worked out', kind: 'money', help: 'For example the earned income credit from the IRS worksheet.' },
    ],
  },
  {
    id: 'payments',
    title: 'Payments already made',
    intro: 'Tax you already sent in during the year.',
    fields: [
      { key: 'otherWithholding', label: 'Other federal tax withheld (1099 forms)', kind: 'money' },
      { key: 'estimatedPayments', label: 'Estimated tax payments you made for 2025', kind: 'money', help: 'Quarterly payments plus any amount applied from your last return.' },
    ],
  },
];

const CA_STEPS: Step[] = [
  {
    id: 'about',
    title: 'About you',
    intro: 'Start with where you live on December 31 and your family situation. You do not need to enter a Social Insurance Number here.',
    fields: [
      { key: 'province', label: 'Province or territory of residence on December 31', kind: 'select', options: [{ value: '', label: 'Choose…' }, ...PROVINCES] },
      { key: 'age65', label: 'I was 65 or older at the end of the year', kind: 'bool' },
      { key: 'hasPensionIncome', label: 'I receive eligible pension income', kind: 'bool', when: (i) => yes(i, 'age65') },
      { key: 'hasSpouse', label: 'I had a spouse or common-law partner and supported them', kind: 'bool' },
      { key: 'spouseNetIncome', label: "Your spouse's net income for the year", kind: 'money', when: (i) => yes(i, 'hasSpouse'), help: 'The spouse amount is reduced by their income.' },
    ],
  },
  {
    id: 'employment',
    title: 'Job income (T4)',
    intro: 'Add up the boxes from every T4 you received.',
    fields: [
      { key: 'employmentIncome', label: 'Employment income (T4 box 14, all jobs added)', kind: 'money' },
      { key: 'taxDeducted', label: 'Income tax deducted (T4 box 22, all jobs added)', kind: 'money', help: 'Tax you already paid through your paycheques.' },
      { key: 'cppPaid', label: 'CPP contributions (T4 box 16, all jobs added)', kind: 'money' },
      { key: 'eiPaid', label: 'EI premiums (T4 box 18, all jobs added)', kind: 'money' },
      { key: 'unionDues', label: 'Union or professional dues (T4 box 44)', kind: 'money' },
    ],
  },
  {
    id: 'investments',
    title: 'Investments and other income',
    intro: 'From your T5, T3 and T5008 slips.',
    fields: [
      { key: 'interestIncome', label: 'Interest and other investment income (T5 box 13)', kind: 'money' },
      { key: 'eligibleDividends', label: 'Eligible dividends, actual amount (T5 box 24)', kind: 'money', help: 'Enter the actual amount, not the grossed-up amount. We gross it up for you.' },
      { key: 'nonEligibleDividends', label: 'Other than eligible dividends, actual amount (T5 box 10)', kind: 'money' },
      { key: 'capitalGains', label: 'Net capital gain or loss for the year', kind: 'money', help: 'Use a minus sign for a loss. Half of a gain is taxable.' },
      { key: 'otherIncome', label: 'Any other income (pensions, rental profit, EI benefits)', kind: 'money' },
    ],
  },
  {
    id: 'business',
    title: 'Self-employment or small business',
    intro: 'Skip this if you have no business or freelance income.',
    fields: [
      { key: 'selfEmployedGross', label: 'Total business income', kind: 'money' },
      { key: 'selfEmployedExpenses', label: 'Total business expenses', kind: 'money' },
    ],
  },
  {
    id: 'deductions',
    title: 'Deductions and credits',
    intro: 'These lower your tax. Enter what you paid in 2025.',
    fields: [
      { key: 'rrspContribution', label: 'RRSP contributions for 2025 (including the first 60 days of 2026)', kind: 'money', help: 'Check your room on your last Notice of Assessment.' },
      { key: 'fhsaContribution', label: 'FHSA contributions for 2025', kind: 'money' },
      { key: 'childCare', label: 'Child care expenses', kind: 'money' },
      { key: 'otherDeductions', label: 'Other deductions (support payments, carrying charges, moving)', kind: 'money' },
      { key: 'tuitionAmount', label: 'Tuition you can claim (T2202)', kind: 'money' },
      { key: 'donations', label: 'Donations to registered charities', kind: 'money' },
      { key: 'refundableCredits', label: 'Other refundable credits you already worked out', kind: 'money' },
    ],
  },
  {
    id: 'payments',
    title: 'Payments already made',
    intro: 'Tax you already sent in during the year.',
    fields: [{ key: 'installmentsPaid', label: 'Tax instalments you paid for 2025', kind: 'money' }],
  },
];

export const STEPS: Record<Country, Step[]> = { US: US_STEPS, CA: CA_STEPS };

export const COUNTRY_LABEL: Record<Country, string> = { US: 'United States (Form 1040)', CA: 'Canada (T1)' };
