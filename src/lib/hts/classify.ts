import { askJson, llmEnabled, str, type LlmClient } from '@/lib/llm/json';
import { digitsOf, formatHts, type HtsIndex, type HtsRow } from './index';

// HTS suggestions grounded in the real schedule. Claude proposes headings and
// search words, the schedule supplies the candidate lines, and Claude picks one
// of those lines. A code that is not in the candidate list is thrown away, so a
// suggestion is always a line that exists in the HTSUS. It is still a
// suggestion: a licensed broker decides the classification.

export interface HtsSuggestion {
  htsno: string;
  /** Full description of the line, parents included. */
  path: string;
  general: string | null;
  confidence: number;
  source: 'ai' | 'search';
  reason?: string;
  /** Other lines worth a look when the match is weak. */
  alternatives: { htsno: string; path: string }[];
}

const PICK_LIMIT = 40;

export async function suggestHts(description: string, index: HtsIndex, client?: LlmClient): Promise<HtsSuggestion | null> {
  const lexical = index.candidates(description, 15);

  if (!llmEnabled() && !client) {
    // Keyword search alone is a weak guide, so it is offered as candidates, never as an answer.
    const top = lexical.slice(0, 3).map((c) => c.row);
    if (!top.length) return null;
    return toSuggestion(top[0], 0.2, 'search', undefined, top.slice(1));
  }

  // Step 1: which headings could this product fall under, and what would the tariff call it?
  const plan = await askJson(
    'You help classify goods under the US Harmonized Tariff Schedule.',
    `Product: ${description.slice(0, 500)}\nReturn {"headings": up to 4 four-digit HTS headings this product could fall under, most likely first, "terms": up to 6 words or short phrases the tariff text would use for this product}.`,
    { client, effort: 'low' },
  );
  const headings: string[] = [];
  let terms = '';
  if (plan && typeof plan === 'object') {
    const p = plan as Record<string, unknown>;
    if (Array.isArray(p.headings)) {
      for (const h of p.headings.slice(0, 4)) {
        const d = digitsOf(String(h)).slice(0, 4);
        if (d.length === 4 && index.hasHeading(d) && !headings.includes(d)) headings.push(d);
      }
    }
    if (Array.isArray(p.terms)) terms = p.terms.filter((t): t is string => typeof t === 'string').slice(0, 6).join(' ');
  }

  const pool = new Map<string, HtsRow>();
  for (const c of index.candidates(`${description} ${terms}`, PICK_LIMIT, headings.length ? headings : undefined)) pool.set(digitsOf(c.row.htsno), c.row);
  for (const c of lexical) if (pool.size < PICK_LIMIT + 15) pool.set(digitsOf(c.row.htsno), c.row);
  const candidates = [...pool.values()];
  if (!candidates.length) return null;

  // Step 2: choose one of the real lines.
  const list = candidates.map((r, i) => `${i + 1}. ${formatHts(r.htsno)} | ${r.path}`).join('\n');
  const pick = await askJson(
    'You help classify goods under the US Harmonized Tariff Schedule. Choose only from the numbered lines provided.',
    `Product: ${description.slice(0, 500)}\n\nCandidate tariff lines:\n${list}\n\nReturn {"choice": the number of the best line, or null if none fits, "confidence": a number from 0 to 1, "reason": one short sentence}.`,
    { client, effort: 'medium' },
  );
  if (!pick || typeof pick !== 'object') {
    return toSuggestion(candidates[0], 0.2, 'search', undefined, candidates.slice(1, 3));
  }
  const p = pick as Record<string, unknown>;
  const n = typeof p.choice === 'number' ? Math.trunc(p.choice) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > candidates.length) return null;
  const confidence = typeof p.confidence === 'number' ? Math.min(1, Math.max(0, p.confidence)) : 0.5;
  const chosen = candidates[n - 1];
  const alternatives = candidates.filter((r) => r !== chosen).slice(0, 2);
  return toSuggestion(chosen, confidence, 'ai', str(p.reason, 200), alternatives);
}

function toSuggestion(row: HtsRow, confidence: number, source: 'ai' | 'search', reason: string | undefined, alts: HtsRow[]): HtsSuggestion {
  return {
    htsno: row.htsno,
    path: row.path,
    general: row.general,
    confidence,
    source,
    reason,
    alternatives: alts.map((r) => ({ htsno: r.htsno, path: r.path })),
  };
}
