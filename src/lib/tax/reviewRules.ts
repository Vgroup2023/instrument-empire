import { num, str, type Country, type TaxInputs, type TaxResult } from './types';
import { STEPS } from './interview';

// The review agent's built-in checks. Pure numbers in, plain findings out, so they run instantly and the same way
// in the browser, on the server and in tests. They look for things that do not add up in the answers themselves
// (a count the filing status cannot allow, tax withheld that is bigger than the pay, a gift that is out of scale)
// and for patterns that draw questions from the IRS or CRA. They never change the return and never file anything.

export type ReviewSeverity = 'high' | 'medium' | 'low';

export interface ReviewFinding {
  source: 'rules' | 'ai';
  severity: ReviewSeverity;
  title: string;
  detail: string;
  /** The interview answer this is about, so the screen can point at it. */
  field?: string;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const SEVERITY_ORDER: Record<ReviewSeverity, number> = { high: 0, medium: 1, low: 2 };

export function sortFindings<T extends { severity: ReviewSeverity }>(list: T[]): T[] {
  return [...list].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function ruleChecks(country: Country, inputs: TaxInputs, result: TaxResult): ReviewFinding[] {
  const out: ReviewFinding[] = [];
  const add = (severity: ReviewSeverity, title: string, detail: string, field?: string) => out.push({ source: 'rules', severity, title, detail, field });
  const authority = country === 'US' ? 'IRS' : 'CRA';

  if (result.totalIncome <= 0 && result.totalPayments <= 0) {
    add('low', 'No income has been entered yet', 'There is nothing to review until income and the tax already paid are filled in.');
    return out;
  }

  if (country === 'US') {
    const status = str(inputs, 'filingStatus', 'single');
    const wages = num(inputs, 'wages');
    const withheld = num(inputs, 'wageWithholding');
    if (wages > 0 && withheld > wages) add('high', 'Tax withheld is more than the wages', `You entered ${usd(withheld)} withheld on ${usd(wages)} of wages. One of the two was probably misread from the W-2. Check boxes 1 and 2.`, 'wageWithholding');
    else if (wages > 0 && withheld === 0) add('medium', 'No federal tax was withheld from wages', 'Most employers withhold tax. If nothing is withheld, check box 2 on each W-2, and confirm you were not meant to make estimated payments.', 'wageWithholding');
    else if (wages > 0 && withheld / wages > 0.4) add('medium', 'Tax withheld looks very high for the wages', `${usd(withheld)} withheld is ${Math.round((withheld / wages) * 100)}% of ${usd(wages)} in wages. That is unusual. Check box 2 against box 1 on each W-2.`, 'wageWithholding');

    const maxPeople = status === 'mfj' ? 2 : 1;
    const age65 = num(inputs, 'age65Count');
    if (age65 > maxPeople) add('high', 'More people aged 65 or older than this filing status allows', `You entered ${age65}, but a ${status === 'mfj' ? 'joint' : 'single-person'} return can count at most ${maxPeople}. The extra will be ignored, so check the number.`, 'age65Count');
    const blind = num(inputs, 'blindCount');
    if (blind > maxPeople) add('high', 'More blind people than this filing status allows', `You entered ${blind}, but this return can count at most ${maxPeople}. The extra will be ignored, so check the number.`, 'blindCount');

    const kids = num(inputs, 'childrenUnder17');
    const others = num(inputs, 'otherDependents');
    if (status === 'hoh' && kids === 0 && others === 0) add('medium', 'Head of household with no dependents listed', 'Head of household needs a qualifying person who lived with you for more than half the year (a parent can qualify without living with you). Confirm who it is, or use single.', 'filingStatus');
    const eitcKids = num(inputs, 'eitcChildren');
    if (eitcKids > kids + others) add('medium', 'More earned income credit children than dependents', `You listed ${eitcKids} qualifying children for the earned income credit but only ${kids + others} dependents. A qualifying child is normally also your dependent. The ${authority} checks this closely.`, 'eitcChildren');

    const charity = num(inputs, 'charity');
    if (result.adjustedIncome > 0 && charity >= 1000 && charity > 0.3 * result.adjustedIncome) add('medium', 'Charitable gifts are a large share of income', `${usd(charity)} is ${Math.round((charity / result.adjustedIncome) * 100)}% of adjusted gross income. Large gifts draw questions. Keep the written acknowledgement for every gift of $250 or more, and appraisals for non-cash gifts over $500.`, 'charity');

    const gross = num(inputs, 'businessIncome');
    const costs = num(inputs, 'businessExpenses');
    if (gross > 0 && costs >= 1000 && costs > 0.8 * gross && costs <= gross) add('low', 'Business expenses are most of the business income', `Expenses of ${usd(costs)} against ${usd(gross)} of income leave a very small profit. Keep receipts and mileage records for every expense.`, 'businessExpenses');

    if (wages > 0 && !str(inputs, 'state')) add('low', 'No state has been chosen', 'State tax is not estimated until you choose a state, including states with no income tax.', 'state');
  } else {
    const employment = num(inputs, 'employmentIncome');
    const deducted = num(inputs, 'taxDeducted');
    if (employment > 0 && deducted > employment) add('high', 'Tax deducted is more than the income', `You entered ${usd(deducted)} deducted on ${usd(employment)} of income. One of the two was probably misread from the T4. Check boxes 14 and 22.`, 'taxDeducted');
    else if (employment > 0 && deducted === 0) add('medium', 'No income tax was deducted from employment income', 'Most employers deduct tax. Check box 22 on each T4.', 'taxDeducted');
    if (num(inputs, 'cppPaid') > 0 && employment > 0 && employment <= 3500) add('low', 'CPP contributions on very low employment income', 'CPP is only taken from earnings above $3,500. Check boxes 14 and 16 on the T4.', 'cppPaid');

    const donations = num(inputs, 'donations');
    if (result.adjustedIncome > 0 && donations >= 500 && donations > 0.75 * result.adjustedIncome) add('medium', 'Donations are over 75% of net income', `${usd(donations)} is more than 75% of your net income, which is the usual yearly limit on the credit. Keep the official receipts.`, 'donations');

    const gross = num(inputs, 'selfEmployedGross');
    const costs = num(inputs, 'selfEmployedExpenses');
    if (gross > 0 && costs >= 1000 && costs > 0.8 * gross && costs <= gross) add('low', 'Business expenses are most of the business income', `Expenses of ${usd(costs)} against ${usd(gross)} of income leave a very small profit. Keep receipts for every expense.`, 'selfEmployedExpenses');
  }

  if (result.balance < -1000 && -result.balance > 0.3 * Math.max(result.totalIncome, 1)) {
    add('medium', 'The refund is large compared with income', `A refund of ${usd(-result.balance)} is ${Math.round((-result.balance / Math.max(result.totalIncome, 1)) * 100)}% of income. That can be right with refundable credits, but it can also mean the tax paid was overstated. Re-check the amounts already paid.`);
  }
  return sortFindings(out);
}

/** The visible answers in plain words, for showing the AI reviewer. Anything that is not a plain number, yes/no or a known choice is dropped. */
export function describeAnswers(country: Country, inputs: TaxInputs): { key: string; label: string; value: string }[] {
  const out: { key: string; label: string; value: string }[] = [];
  for (const step of STEPS[country]) {
    for (const f of step.fields) {
      if (f.when && !f.when(inputs)) continue;
      const v = inputs[f.key];
      if (v === undefined || v === '') continue;
      if (f.kind === 'money' || f.kind === 'count') {
        const n = typeof v === 'number' ? v : Number(v);
        if (Number.isFinite(n)) out.push({ key: f.key, label: f.label, value: String(n) });
      } else if (f.kind === 'bool') {
        out.push({ key: f.key, label: f.label, value: v === true || v === 'true' ? 'yes' : 'no' });
      } else if (f.kind === 'select') {
        const opt = f.options?.find((o) => o.value === v);
        if (opt) out.push({ key: f.key, label: f.label, value: opt.label });
      }
    }
  }
  return out;
}
