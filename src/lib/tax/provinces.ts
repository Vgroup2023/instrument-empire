import { bracketTax, round2 } from './types';

// Provincial and territorial income tax for tax year 2025, for every jurisdiction except Quebec (which has its
// own return, the TP-1). Brackets and rates are from the CRA page "Tax rates and income brackets used on the
// 2025 tax return"; basic personal amounts are from the CRA page for line 30000; the Ontario surtax thresholds
// and Ontario Health Premium schedule are from the Ontario Ministry of Finance as published by TaxTips.ca.
// Checked against those pages on 2026-10-24. Each year is a data change here, not a code change.
//
// What is applied: brackets, the basic personal amount, and the CPP/EI credits, all at the lowest provincial rate;
// Ontario's surtax and Health Premium. What is NOT applied (and the return says so): provincial age, spouse,
// tuition, donation and dividend credits, low-income tax reductions, Alberta's supplemental credit and other
// province-specific credits.

export interface ProvinceTable {
  name: string;
  limits: number[];
  rates: number[];
  /** Basic personal amount; a function when it depends on income. */
  basicPersonal: (netIncome: number, federalBasicPersonal: number) => number;
}

const flat = (n: number) => () => n;

export const PROVINCE_TABLES_2025: Record<string, ProvinceTable> = {
  AB: { name: 'Alberta', limits: [60000, 151234, 181481, 241974, 362961, Infinity], rates: [0.08, 0.1, 0.12, 0.13, 0.14, 0.15], basicPersonal: flat(22323) },
  BC: { name: 'British Columbia', limits: [49279, 98560, 113158, 137407, 186306, 259829, Infinity], rates: [0.0506, 0.077, 0.105, 0.1229, 0.147, 0.168, 0.205], basicPersonal: flat(12932) },
  MB: {
    name: 'Manitoba',
    limits: [47564, 101200, Infinity],
    rates: [0.108, 0.1275, 0.174],
    // Full amount to $200,000 of net income, reduced evenly to nothing at $400,000.
    basicPersonal: (ni) => (ni <= 200000 ? 15780 : ni >= 400000 ? 0 : 15780 * (1 - (ni - 200000) / 200000)),
  },
  NB: { name: 'New Brunswick', limits: [51306, 102614, 190060, Infinity], rates: [0.094, 0.14, 0.16, 0.195], basicPersonal: flat(13396) },
  NL: { name: 'Newfoundland and Labrador', limits: [44192, 88382, 157792, 220910, 282214, 564429, 1128858, Infinity], rates: [0.087, 0.145, 0.158, 0.178, 0.198, 0.208, 0.213, 0.218], basicPersonal: flat(11067) },
  NT: { name: 'Northwest Territories', limits: [51964, 103930, 168967, Infinity], rates: [0.059, 0.086, 0.122, 0.1405], basicPersonal: flat(17842) },
  NS: { name: 'Nova Scotia', limits: [30507, 61015, 95883, 154650, Infinity], rates: [0.0879, 0.1495, 0.1667, 0.175, 0.21], basicPersonal: flat(11744) },
  NU: { name: 'Nunavut', limits: [54707, 109413, 177881, Infinity], rates: [0.04, 0.07, 0.09, 0.115], basicPersonal: flat(19274) },
  ON: { name: 'Ontario', limits: [52886, 105775, 150000, 220000, Infinity], rates: [0.0505, 0.0915, 0.1116, 0.1216, 0.1316], basicPersonal: flat(12747) },
  PE: { name: 'Prince Edward Island', limits: [33328, 64656, 105000, 140000, Infinity], rates: [0.095, 0.1347, 0.166, 0.1762, 0.19], basicPersonal: flat(14650) },
  SK: { name: 'Saskatchewan', limits: [53463, 152750, Infinity], rates: [0.105, 0.125, 0.145], basicPersonal: flat(19491) },
  // Yukon uses the same basic personal amount as the federal return, reduced for high incomes.
  YT: { name: 'Yukon', limits: [57375, 114750, 177882, 500000, Infinity], rates: [0.064, 0.09, 0.109, 0.128, 0.15], basicPersonal: (_ni, federal) => federal },
};

export const ONTARIO_2025 = { surtaxFirst: 5710, surtaxSecond: 7307, surtaxFirstRate: 0.2, surtaxSecondRate: 0.36 };

/** Ontario Health Premium for 2025 by taxable income (Ontario Ministry of Finance schedule). */
export function ontarioHealthPremium(taxableIncome: number): number {
  const t = taxableIncome;
  if (t <= 20000) return 0;
  if (t <= 25000) return (t - 20000) * 0.06;
  if (t <= 36000) return 300;
  if (t <= 38500) return 300 + (t - 36000) * 0.06;
  if (t <= 48000) return 450;
  if (t <= 48600) return 450 + (t - 48000) * 0.25;
  if (t <= 72000) return 600;
  if (t <= 72600) return 600 + (t - 72000) * 0.25;
  if (t <= 200000) return 750;
  if (t <= 200600) return 750 + (t - 200000) * 0.25;
  return 900;
}

export interface ProvincialResult {
  /** True when the jurisdiction is covered (every one but Quebec). */
  computed: boolean;
  name: string;
  taxBeforeCredits: number;
  credits: number;
  surtax: number;
  healthPremium: number;
  /** Total provincial tax payable. */
  tax: number;
  /** The lowest-bracket rate, which non-refundable credits are worth. */
  creditRate: number;
  marginalRate: number;
}

/**
 * Provincial tax on the same taxable income as the federal return.
 * `creditAmounts` are the dollar amounts of credits shared with the federal return that the province also gives
 * (the CPP base part and EI); the basic personal amount is added here.
 */
export function provincialTax(code: string, taxableIncome: number, netIncome: number, federalBasicPersonal: number, creditAmounts: number): ProvincialResult {
  const table = PROVINCE_TABLES_2025[code];
  if (!table) return { computed: false, name: code === 'QC' ? 'Quebec' : '', taxBeforeCredits: 0, credits: 0, surtax: 0, healthPremium: 0, tax: 0, creditRate: 0, marginalRate: 0 };
  const creditRate = table.rates[0];
  const taxBeforeCredits = bracketTax(taxableIncome, table.limits, table.rates);
  const credits = (table.basicPersonal(netIncome, federalBasicPersonal) + creditAmounts) * creditRate;
  const afterCredits = Math.max(0, taxBeforeCredits - credits);
  let surtax = 0;
  let healthPremium = 0;
  if (code === 'ON') {
    surtax = ONTARIO_2025.surtaxFirstRate * Math.max(0, afterCredits - ONTARIO_2025.surtaxFirst) + ONTARIO_2025.surtaxSecondRate * Math.max(0, afterCredits - ONTARIO_2025.surtaxSecond);
    healthPremium = ontarioHealthPremium(taxableIncome);
  }
  let marginalRate = table.rates[table.rates.length - 1];
  for (let i = 0; i < table.limits.length; i++) {
    if (taxableIncome < table.limits[i]) {
      marginalRate = table.rates[i];
      break;
    }
  }
  if (code === 'ON' && afterCredits > ONTARIO_2025.surtaxSecond) marginalRate *= 1 + ONTARIO_2025.surtaxFirstRate + ONTARIO_2025.surtaxSecondRate;
  else if (code === 'ON' && afterCredits > ONTARIO_2025.surtaxFirst) marginalRate *= 1 + ONTARIO_2025.surtaxFirstRate;
  return {
    computed: true,
    name: table.name,
    taxBeforeCredits: round2(taxBeforeCredits),
    credits: round2(Math.min(credits, taxBeforeCredits)),
    surtax: round2(surtax),
    healthPremium: round2(healthPremium),
    tax: round2(afterCredits + surtax + healthPremium),
    creditRate,
    marginalRate,
  };
}
