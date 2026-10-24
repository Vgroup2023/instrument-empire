import { STATE_TAX_2025 } from './stateData';
import { bracketTax, round2 } from './types';

export const STATE_OPTIONS = Object.entries(STATE_TAX_2025)
  .map(([value, t]) => ({ value, label: t.name }))
  .sort((a, b) => a.label.localeCompare(b.label));

export interface StateResult {
  /** False for a state we do not estimate (Washington, which taxes capital gains only) or when no state is chosen. */
  computed: boolean;
  name: string;
  taxableIncome: number;
  tax: number;
  noIncomeTax: boolean;
  note?: string;
}

/**
 * A rough estimate of state income tax: federal adjusted gross income, less the state's standard deduction and
 * exemptions, taxed at the state's brackets, less any state exemption or standard-deduction credits. State returns
 * differ in many details (income adjustments, credits, exemption phase-outs, federal tax deductions, local taxes),
 * so the result is labelled an estimate wherever it is shown. Married filing separately and head of household use
 * the single column because the published tables list only single and joint.
 */
export function stateTaxEstimate(code: string, federalAgi: number, joint: boolean, dependents: number): StateResult {
  const t = STATE_TAX_2025[code];
  if (!t) return { computed: false, name: '', taxableIncome: 0, tax: 0, noIncomeTax: false };
  if (t.none) return { computed: true, name: t.name, taxableIncome: 0, tax: 0, noIncomeTax: true, note: `${t.name} has no state income tax on wages and most other income.` };
  if (t.capitalGainsOnly) return { computed: false, name: t.name, taxableIncome: 0, tax: 0, noIncomeTax: false, note: `${t.name} taxes only large capital gains, with no tax on wages. That tax is not estimated here.` };

  const std = (joint ? t.std.joint : t.std.single) ?? 0;
  const personal = (joint ? t.exemption.joint : t.exemption.single) ?? 0;
  const personalIsCredit = joint ? t.exemption.jointCredit : t.exemption.singleCredit;
  const dependentAmount = (t.exemption.dependent ?? 0) * Math.max(0, dependents);
  // Amounts a state gives as credits come off the tax; the rest come off income.
  const deductions = (t.std.credit ? 0 : std) + (personalIsCredit ? 0 : personal) + (t.exemption.dependentCredit ? 0 : dependentAmount);
  const credits = (t.std.credit ? std : 0) + (personalIsCredit ? personal : 0) + (t.exemption.dependentCredit ? dependentAmount : 0);
  const taxable = Math.max(0, federalAgi - deductions);

  const brackets = joint ? t.joint : t.single;
  const limits = brackets.map((b, i) => (i + 1 < brackets.length ? brackets[i + 1][1] : Infinity));
  const rates = brackets.map((b) => b[0]);
  let tax = bracketTax(taxable, limits, rates);
  tax = Math.max(0, tax - credits);
  return { computed: true, name: t.name, taxableIncome: round2(taxable), tax: round2(tax), noIncomeTax: false };
}
