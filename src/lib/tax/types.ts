// Shared shapes for the tax preparation engine. The engine is pure (numbers in, numbers out) so the
// same code runs in the browser for the live refund/owing meter and in tests.

export type Country = 'US' | 'CA';
export type TaxInputs = Record<string, number | string | boolean>;

export interface TaxLine {
  label: string;
  amount: number;
  /** Form line reference, e.g. "1040 line 15" or "T1 line 26000". */
  ref?: string;
  note?: string;
  /** Section heading rows have no amount. */
  heading?: boolean;
  bold?: boolean;
}

export interface Finding {
  level: 'warn' | 'tip' | 'info';
  title: string;
  detail: string;
}

export interface TaxResult {
  country: Country;
  taxYear: number;
  lines: TaxLine[];
  totalIncome: number;
  adjustedIncome: number;
  taxableIncome: number;
  totalTax: number;
  totalPayments: number;
  /** Positive: you owe this much. Negative: this much comes back to you. */
  balance: number;
  marginalRate: number;
  effectiveRate: number;
  findings: Finding[];
  /** Things this version does not compute, shown plainly so nobody assumes they were. */
  notComputed: string[];
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** A money or count input, treated as 0 when blank or not a number. */
export function num(inputs: TaxInputs, key: string): number {
  const v = inputs[key];
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function str(inputs: TaxInputs, key: string, fallback = ''): string {
  const v = inputs[key];
  return typeof v === 'string' && v ? v : fallback;
}

export function flag(inputs: TaxInputs, key: string): boolean {
  return inputs[key] === true || inputs[key] === 'true';
}

/** Tax from graduated brackets: `limits` are the upper edge of each band (Infinity for the last). */
export function bracketTax(income: number, limits: number[], rates: number[]): number {
  let tax = 0;
  let lower = 0;
  for (let i = 0; i < limits.length; i++) {
    if (income <= lower) break;
    tax += (Math.min(income, limits[i]) - lower) * rates[i];
    lower = limits[i];
  }
  return tax;
}

/** The rate that applies to the next dollar of income. */
export function marginalRateOf(income: number, limits: number[], rates: number[]): number {
  for (let i = 0; i < limits.length; i++) if (income < limits[i]) return rates[i];
  return rates[rates.length - 1];
}
