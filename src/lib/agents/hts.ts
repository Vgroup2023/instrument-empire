import type { AgentContext, Finding } from './types';
import { isActive } from './types';

// HTS Oracle is a rules agent, not a tariff database. It validates the shape
// of codes brokers enter and offers a 6-digit starting point from a short,
// curated keyword list. A licensed broker must confirm the full 10-digit
// classification; nothing here is a binding ruling.

const KEYWORDS: { words: string[]; heading: string; label: string }[] = [
  { words: ['lithium-ion', 'lithium ion', 'li-ion', 'lithium cell'], heading: '8507.60', label: 'lithium-ion accumulators' },
  { words: ['laptop', 'notebook computer'], heading: '8471.30', label: 'portable data-processing machines' },
  { words: ['smartphone', 'mobile phone', 'cell phone'], heading: '8517.13', label: 'smartphones' },
  { words: ['t-shirt', 'tee shirt', 'tshirt'], heading: '6109.10', label: 'cotton T-shirts, knitted' },
  { words: ['coffee beans', 'green coffee'], heading: '0901.11', label: 'coffee, not roasted, not decaffeinated' },
  { words: ['leather handbag', 'leather purse'], heading: '4202.21', label: 'handbags with leather outer surface' },
  { words: ['wooden furniture', 'wood furniture'], heading: '9403.60', label: 'other wooden furniture' },
  { words: ['plastic bottle'], heading: '3923.30', label: 'plastic carboys, bottles, flasks' },
  { words: ['steel bolt', 'steel screw', 'steel fastener'], heading: '7318.15', label: 'threaded screws and bolts, iron or steel' },
  { words: ['solar panel', 'solar module', 'photovoltaic'], heading: '8541.43', label: 'photovoltaic cells assembled in modules' },
  { words: ['bicycle'], heading: '8712.00', label: 'bicycles' },
  { words: ['red wine', 'white wine'], heading: '2204.21', label: 'wine in containers of 2 litres or less' },
  { words: ['toy'], heading: '9503.00', label: 'toys' },
];

export function suggestHeading(description: string): { heading: string; label: string } | null {
  const text = description.toLowerCase();
  for (const k of KEYWORDS) {
    if (k.words.some((w) => text.includes(w))) return { heading: k.heading, label: k.label };
  }
  return null;
}

export function normalizeHts(code: string): string {
  return code.replace(/[^0-9]/g, '');
}

/** A usable US HTS number is 10 digits; chapters run 01-97 and 77 is reserved. */
export function isValidHts(code: string): boolean {
  const digits = normalizeHts(code);
  if (digits.length !== 10) return false;
  const chapter = Number(digits.slice(0, 2));
  return chapter >= 1 && chapter <= 97 && chapter !== 77;
}

export function runHtsOracle(ctx: AgentContext): Finding[] {
  const out: Finding[] = [];
  for (const s of ctx.shipments.filter(isActive)) {
    for (const line of s.lines) {
      const hint = suggestHeading(line.description);
      if (!line.htsCode) {
        out.push({
          agent: 'hts-oracle',
          severity: 'medium',
          shipmentId: s.id,
          dedupeKey: `hts:missing:${line.id}`,
          title: `${s.reference}: "${line.description}" has no HTS code`,
          detail: hint
            ? `Suggested starting point: ${hint.heading} (${hint.label}). A broker must confirm the full 10-digit number.`
            : 'No suggestion available for this description. Classify it manually.',
        });
        continue;
      }
      if (!isValidHts(line.htsCode)) {
        out.push({
          agent: 'hts-oracle',
          severity: 'high',
          shipmentId: s.id,
          dedupeKey: `hts:invalid:${line.id}`,
          title: `${s.reference}: HTS "${line.htsCode}" is not a valid 10-digit code`,
          detail: 'US HTS numbers have 10 digits, with chapters 01 to 97 (77 is unused).',
        });
        continue;
      }
      if (hint) {
        const digits = normalizeHts(line.htsCode);
        const hintDigits = normalizeHts(hint.heading);
        if (!digits.startsWith(hintDigits.slice(0, 4))) {
          out.push({
            agent: 'hts-oracle',
            severity: 'medium',
            shipmentId: s.id,
            dedupeKey: `hts:mismatch:${line.id}`,
            title: `${s.reference}: "${line.description}" may be misclassified`,
            detail: `The description usually falls under ${hint.heading} (${hint.label}), but the line uses ${line.htsCode}. Review the classification.`,
          });
        }
      }
    }
  }
  return out;
}
