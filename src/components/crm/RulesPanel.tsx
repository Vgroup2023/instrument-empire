'use client';

import { Card } from '@/components/ui/Card';
import { QUOTE_FOLLOW_UP_DAYS, DEAL_QUIET_DAYS, STALE_DEAL_DAYS } from '@/lib/crm/model';
import { ConnectionsPanel } from './ConnectionsPanel';

/** What the CRM does on its own, in the order a deal moves, then where messages come from and where alerts go. */
const RULES: { when: string; then: string }[] = [
  { when: 'A message arrives (email, text, call or web form)', then: 'It is read, matched to the contact, tagged to a business, given a priority, and a task is made. An unhappy customer or a high-priority message is alerted straight away.' },
  { when: 'A deal moves to Quote sent', then: `A follow-up task is added, due in ${QUOTE_FOLLOW_UP_DAYS} days. The card shows "Follow up" once the quote has been quiet that long (${DEAL_QUIET_DAYS} days for other open deals).` },
  { when: `An open deal is quiet for ${STALE_DEAL_DAYS} days, or past its close date`, then: 'The pipeline agent adds a check-in task.' },
  { when: 'A deal worth $10,000 or more is quiet for 7 days, or a won deal\'s invoice is overdue', then: 'An alert is sent to your team (email, Teams, and text for the most urgent).' },
  { when: 'A deal is won', then: 'The contact becomes a customer, a draft invoice is made, and Finance gets a task. If the customer has a reorder schedule, the clock restarts from this order.' },
  { when: 'A customer\'s next reorder is near', then: 'They appear in Reorders and in the Reorder due column of the pipeline, with a Start reorder button that opens a deal for it.' },
  { when: 'Someone has not been contacted for their follow-up period', then: 'A follow-up email is drafted for a person to approve. Nothing is sent without approval.' },
];

export function RulesPanel({ onRan }: { onRan: () => void }) {
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h3 className="text-[15px] font-semibold text-[#0f2059]">What happens automatically</h3>
        <p className="mt-1 text-sm text-slate-600">These run on their own. They only create tasks, drafts and alerts for your team; nothing is sent to a customer without a person approving it.</p>
        <ol className="mt-3 divide-y divide-slate-100">
          {RULES.map((r, i) => (
            <li key={r.when} className="flex gap-3 py-2.5">
              <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span>
              <p className="text-sm text-slate-700"><b className="font-semibold text-slate-900">{r.when}:</b> {r.then}</p>
            </li>
          ))}
        </ol>
      </Card>
      <ConnectionsPanel onRan={onRan} />
    </div>
  );
}
