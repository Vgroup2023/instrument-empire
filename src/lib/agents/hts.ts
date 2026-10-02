import type { AgentContext, Finding } from './types';
import { isActive } from './types';
import { digitsOf, formatHts } from '@/lib/hts';

// HTS Oracle checks the codes brokers enter against the real tariff (when it
// has been synced) and suggests a line for goods that have none. It does not
// classify: a licensed broker must confirm every code. Without the synced
// tariff it falls back to checking the shape of the code and a short keyword list.

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

export const normalizeHts = digitsOf;

/** A usable US HTS number is 10 digits; chapters run 01-97 and 77 is reserved. */
export function isValidHts(code: string): boolean {
  const digits = digitsOf(code);
  if (digits.length !== 10) return false;
  const chapter = Number(digits.slice(0, 2));
  return chapter >= 1 && chapter <= 97 && chapter !== 77;
}

/** "Heading text > ... > last line", since lines like "Other" mean nothing alone. */
function shortPath(path: string): string {
  const parts = path.split(' > ');
  const first = parts[0].length > 60 ? `${parts[0].slice(0, 57)}...` : parts[0];
  return parts.length > 1 ? `${first} > ${parts[parts.length - 1]}` : first;
}

export function runHtsOracle(ctx: AgentContext): Finding[] {
  const out: Finding[] = [];
  for (const s of ctx.shipments.filter(isActive)) {
    for (const line of s.lines) {
      const sug = line.htsSuggestion ?? null;
      const hint = suggestHeading(line.description);

      if (!line.htsCode) {
        let detail: string;
        if (sug && sug.source === 'ai') {
          const alts = sug.alternatives.length ? ` Also consider ${sug.alternatives.map((a) => formatHts(a.htsno)).join(', ')}.` : '';
          detail = `Claude suggests ${formatHts(sug.htsno)} (${sug.path}), general duty ${sug.general ?? 'not stated'}, ${Math.round(sug.confidence * 100)}% confidence${sug.reason ? `: ${sug.reason}` : '.'}${alts} A broker must confirm the classification.`;
        } else if (sug) {
          const alts = [sug, ...sug.alternatives].map((a) => `${formatHts(a.htsno)} (${shortPath(a.path)})`).join('; ');
          detail = `Keyword matches only, not a classification: ${alts}. Turn on Claude (ANTHROPIC_API_KEY) for a reasoned suggestion.`;
        } else if (hint) {
          detail = `Suggested starting point: ${hint.heading} (${hint.label}). A broker must confirm the full 10-digit number.`;
        } else {
          detail = 'No suggestion available for this description. Classify it manually.';
        }
        out.push({
          agent: 'hts-oracle',
          severity: 'medium',
          shipmentId: s.id,
          dedupeKey: `hts:missing:${line.id}`,
          title: `${s.reference}: "${line.description}" has no HTS code`,
          detail,
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

      if (ctx.hts) {
        const found = ctx.hts.lookup(line.htsCode);
        if (found.status === 'unknown') {
          out.push({
            agent: 'hts-oracle',
            severity: 'high',
            shipmentId: s.id,
            dedupeKey: `hts:unknown:${line.id}`,
            title: `${s.reference}: HTS ${formatHts(line.htsCode)} is not in the current tariff`,
            detail: 'The code has the right shape but no such line exists in the USITC Harmonized Tariff Schedule. It may be mistyped or retired.',
          });
          continue;
        }
        if (found.status === 'suffix_unknown') {
          out.push({
            agent: 'hts-oracle',
            severity: 'medium',
            shipmentId: s.id,
            dedupeKey: `hts:suffix:${line.id}`,
            title: `${s.reference}: statistical suffix on ${formatHts(line.htsCode)} is not recognised`,
            detail: `The 8-digit line ${formatHts(found.row.htsno)} (${found.row.description}) exists, but not with that 2-digit statistical suffix.`,
          });
          continue;
        }
        if (sug && sug.source === 'ai' && sug.confidence >= 0.8 && digitsOf(sug.htsno).slice(0, 4) !== digitsOf(line.htsCode).slice(0, 4)) {
          out.push({
            agent: 'hts-oracle',
            severity: 'medium',
            shipmentId: s.id,
            dedupeKey: `hts:mismatch:${line.id}`,
            title: `${s.reference}: "${line.description}" may be misclassified`,
            detail: `The line uses ${formatHts(line.htsCode)} (${found.row.description}). Claude would expect ${formatHts(sug.htsno)} (${sug.path})${sug.reason ? `: ${sug.reason}` : '.'} Review the classification.`,
          });
        }
        continue;
      }

      if (hint) {
        const digits = digitsOf(line.htsCode);
        const hintDigits = digitsOf(hint.heading);
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
