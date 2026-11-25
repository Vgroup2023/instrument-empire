import { askJson, llmEnabled, str, type LlmClient } from '@/lib/llm/json';
import { computeReturn } from './index';
import { STEPS } from './interview';
import { describeAnswers, ruleChecks, sortFindings, type ReviewFinding, type ReviewSeverity } from './reviewRules';
import type { Country, TaxInputs } from './types';

export type { ReviewFinding, ReviewSeverity } from './reviewRules';

// The AI reviewer for a draft return. It reads the interview answers and the computed figures the way a second
// preparer would before sign-off, and lists what looks wrong, risky or possibly missed. It only ever returns
// suggestions: it cannot change an answer, recalculate the tax or file anything, and every field it sends back
// is checked here before the screen sees it. The answers are numbers, yes/no and fixed choices (no names, no
// identity numbers), and anything else is dropped before it is sent.

export interface ReviewReport {
  generatedAt: string;
  country: Country;
  taxYear: number;
  /** The built-in checks, always run. */
  rules: ReviewFinding[];
  ai: {
    /** off: no Anthropic key. unavailable: Claude did not answer this time. ok: answered (possibly with nothing to add). */
    status: 'ok' | 'off' | 'unavailable';
    summary: string | null;
    findings: ReviewFinding[];
  };
}

const MAX_AI_FINDINGS = 6;
const SEVERITIES: readonly ReviewSeverity[] = ['high', 'medium', 'low'];

/** Pure: keeps only well-formed findings, at most six, whose `field` (if any) is a real interview answer. */
export function validateAiReview(raw: unknown, knownFields: ReadonlySet<string>): { summary: string | null; findings: ReviewFinding[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.findings)) return null;
  const findings: ReviewFinding[] = [];
  for (const item of r.findings) {
    if (findings.length >= MAX_AI_FINDINGS) break;
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    const title = str(f.title, 110);
    const detail = str(f.detail, 400);
    if (!title || !detail) continue;
    const severity = SEVERITIES.includes(f.severity as ReviewSeverity) ? (f.severity as ReviewSeverity) : 'low';
    const field = typeof f.field === 'string' && knownFields.has(f.field) ? f.field : undefined;
    findings.push({ source: 'ai', severity, title, detail, field });
  }
  return { summary: str(r.summary, 260) ?? null, findings: sortFindings(findings) };
}

function systemPrompt(country: Country, taxYear: number): string {
  const form = country === 'US' ? 'U.S. federal Form 1040 personal income tax return' : 'Canadian federal T1 personal income tax return';
  const authority = country === 'US' ? 'IRS' : 'CRA';
  return [
    `You are a careful second reviewer of a draft ${form} for tax year ${taxYear}. A person filled in the answers; a human preparer will sign off after you.`,
    'You are given the answers, the figures the software computed from them, and a list of notes that were already raised. Report only what the answers themselves support.',
    `Look for: answers that contradict each other or the computed figures; amounts that look misread or implausible for the situation; patterns that draw ${authority} attention, and what records to keep for them; credits or deductions the answers suggest might apply but were not claimed (say "ask a preparer", do not say they apply); items in the not-computed list that the answers suggest do apply.`,
    'Do not recalculate the tax. Do not state a tax rule, limit or date unless you are sure of it. Never suggest hiding income, inflating an amount or avoiding a record. Do not repeat a note that was already raised. Do not mention that you are an AI.',
    `Return {"summary": a plain one or two sentence overall impression (max 240 characters), "findings": [up to ${MAX_AI_FINDINGS} items, most important first, each {"severity": "high"|"medium"|"low", "title": max 100 characters, "detail": what looks off and what to check, max 350 characters, "field": the answer key it is about, or null}]}. If nothing is worth raising, return an empty findings list.`,
  ].join(' ');
}

export async function reviewReturn(opts: { country: Country; taxYear: number; inputs: TaxInputs; client?: LlmClient }): Promise<ReviewReport> {
  const { country, taxYear, inputs, client } = opts;
  const result = computeReturn(country, inputs);
  const rules = ruleChecks(country, inputs, result);
  const base = { generatedAt: new Date().toISOString(), country, taxYear, rules };

  if (!client && !llmEnabled()) return { ...base, ai: { status: 'off', summary: null, findings: [] } };

  const answers = describeAnswers(country, inputs);
  const known = new Set(STEPS[country].flatMap((s) => s.fields.map((f) => f.key)));
  const payload = {
    country,
    taxYear,
    answers,
    computed: {
      totalIncome: result.totalIncome,
      adjustedIncome: result.adjustedIncome,
      taxableIncome: result.taxableIncome,
      totalTax: result.totalTax,
      totalPayments: result.totalPayments,
      balancePositiveIsOwing: result.balance,
      averageRate: result.effectiveRate,
      nextDollarRate: result.marginalRate,
    },
    alreadyRaised: [...result.findings.map((f) => f.title), ...rules.map((f) => f.title)],
    notComputed: result.notComputed,
  };
  const raw = await askJson(systemPrompt(country, taxYear), `Review this draft return.\n${JSON.stringify(payload)}`, { client, maxTokens: 1800, effort: 'medium' });
  const checked = validateAiReview(raw, known);
  if (!checked) return { ...base, ai: { status: 'unavailable', summary: null, findings: [] } };
  return { ...base, ai: { status: 'ok', summary: checked.summary, findings: checked.findings } };
}
