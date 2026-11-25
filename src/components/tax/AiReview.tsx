'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { STEPS } from '@/lib/tax/interview';
import { ruleChecks, type ReviewFinding, type ReviewSeverity } from '@/lib/tax/reviewRules';
import type { ReviewReport } from '@/lib/tax/review';
import type { Country, TaxInputs, TaxResult } from '@/lib/tax';

const SEVERITY: Record<ReviewSeverity, { tone: 'danger' | 'warning' | 'neutral'; label: string }> = {
  high: { tone: 'danger', label: 'Fix first' },
  medium: { tone: 'warning', label: 'Check' },
  low: { tone: 'neutral', label: 'Note' },
};

function FindingList({ items, labels }: { items: ReviewFinding[]; labels: Map<string, string> }) {
  return (
    <ul className="space-y-3">
      {items.map((f) => (
        <li key={`${f.source}-${f.title}`} className="flex gap-3 text-sm">
          <Badge tone={SEVERITY[f.severity].tone} className="h-fit shrink-0">{SEVERITY[f.severity].label}</Badge>
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{f.title}</p>
            <p className="text-slate-600">{f.detail}</p>
            {f.field && labels.get(f.field) ? <p className="mt-0.5 text-xs text-slate-500">About: {labels.get(f.field)}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The second-reviewer card on the Review step. The built-in checks update as the answers change; the AI reviewer runs
 * when asked, because each run costs a little. Everything here is a suggestion: nothing is changed or filed.
 */
export type SavedReview = { report: ReviewReport; ranWith: string };

export function AiReview({ returnId, country, inputs, result, review, onReview }: { returnId: string; country: Country; inputs: TaxInputs; result: TaxResult; review: SavedReview | null; onReview: (r: SavedReview) => void }) {
  const [state, setState] = useState<'idle' | 'running' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const labels = useMemo(() => new Map(STEPS[country].flatMap((s) => s.fields.map((f) => [f.key, f.label] as const))), [country]);
  const checks = useMemo(() => ruleChecks(country, inputs, result), [country, inputs, result]);
  const now = JSON.stringify(inputs);
  const stale = review !== null && review.ranWith !== now;

  async function run() {
    setState('running');
    setError(null);
    try {
      const res = await fetch(`/api/tax/returns/${returnId}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inputs }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The review could not run. Please try again.');
      onReview({ report: data.review as ReviewReport, ranWith: now });
      setState('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The review could not run. Please try again.');
      setState('error');
    }
  }

  const ai = review?.report.ai;
  return (
    <section aria-labelledby="ai-review-title" className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="ai-review-title" className="text-sm font-semibold text-slate-900">Second reviewer</h3>
          <p className="mt-1 text-xs text-slate-600">A second pair of eyes before you file. It looks for answers that do not add up, amounts that look misread, and things that draw questions. Suggestions only: nothing is changed or filed.</p>
        </div>
        <Button size="sm" onClick={run} loading={state === 'running'} disabled={result.totalIncome <= 0 && result.totalPayments <= 0}>
          {review ? 'Ask the AI reviewer again' : 'Ask the AI reviewer'}
        </Button>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Built-in checks</p>
          {checks.length === 0 ? <p className="text-sm text-slate-600">No problems found by the built-in checks.</p> : <FindingList items={checks} labels={labels} />}
        </div>

        {state === 'running' ? (
          <p className="flex items-center gap-2 text-sm text-slate-600" role="status"><Spinner size={16} /> The AI reviewer is reading your return…</p>
        ) : null}
        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}

        {ai && state !== 'running' ? (
          <div>
            <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              AI reviewer
              {stale ? <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[11px] normal-case tracking-normal text-gold-800">Your answers changed since this review. Ask again for a fresh one.</span> : null}
            </p>
            {ai.status === 'off' ? <p className="text-sm text-slate-600">The AI reviewer is switched off because no Anthropic key is set. The built-in checks above still ran.</p> : null}
            {ai.status === 'unavailable' ? <p className="text-sm text-slate-600">The AI reviewer could not answer this time. The built-in checks above are still valid. Please try again.</p> : null}
            {ai.status === 'ok' ? (
              <div className="space-y-3">
                {ai.summary ? <p className="text-sm text-slate-700">{ai.summary}</p> : null}
                {ai.findings.length === 0 ? <p className="text-sm text-slate-600">The AI reviewer had nothing more to add.</p> : <FindingList items={ai.findings} labels={labels} />}
              </div>
            ) : null}
          </div>
        ) : null}
        <p className="text-xs text-slate-500">The reviewer sees your answers as numbers and yes/no choices, never names or identity numbers. It can be wrong. A preparer should confirm anything marked Fix first or Check.</p>
      </div>
    </section>
  );
}
