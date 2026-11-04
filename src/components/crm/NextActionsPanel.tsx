'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { ActionLevel, NextAction } from '@/lib/crm/model';
import { BusinessBadge } from './BusinessBadge';

const LEVELS: { key: ActionLevel; title: string; hint: string; color: string }[] = [
  { key: 'now', title: 'Now', hint: 'Needs a person right away.', color: '#dc2626' },
  { key: 'today', title: 'Today', hint: 'Should be done today.', color: '#f59e0b' },
  { key: 'soon', title: 'Soon', hint: 'Can wait a little.', color: '#64748b' },
];
const TYPE_ICON = { message: '✉️', task: '✅', draft: '✍️' } as const;

/** One action card: what to do, why (in the AI's words), for whom, and the buttons to do it. */
export function ActionCard({ a, onOpenContact, onDone, onReview, compact }: {
  a: NextAction;
  onOpenContact: (id: string) => void;
  onDone: (a: NextAction) => void;
  onReview: () => void;
  compact?: boolean;
}) {
  return (
    <li className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-card">
      <span aria-hidden className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-lg">{TYPE_ICON[a.type]}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-slate-900">
          {a.title}
          <BusinessBadge business={a.business} />
          {a.overdue ? <Badge tone="danger">overdue</Badge> : null}
        </p>
        {a.why ? <p className={`mt-0.5 text-sm text-slate-700 ${compact ? 'line-clamp-1' : 'line-clamp-2'}`}>{a.why}</p> : null}
        <p className="mt-0.5 text-xs text-slate-500">{a.meta}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <span className="text-xs font-bold tabular-nums text-slate-400" title="Priority score, 0 to 100">{a.score}</span>
        <span className="flex flex-wrap justify-end gap-1.5">
          {a.contactId ? <Button size="sm" variant="secondary" onClick={() => onOpenContact(a.contactId!)}>Open</Button> : null}
          {a.type === 'draft' ? <Button size="sm" onClick={onReview}>Review</Button> : <Button size="sm" onClick={() => onDone(a)}>{a.type === 'message' ? 'Handled' : 'Done'}</Button>}
        </span>
      </div>
    </li>
  );
}

/**
 * Everything waiting on a person, in the order to do it: customer messages nobody has answered, open tasks, and drafts
 * waiting to be approved. Each says why in a line, and one click opens the conversation or ticks it off.
 */
export function NextActionsPanel({ items, onOpenContact, onDone, onReview }: {
  items: NextAction[];
  onOpenContact: (id: string) => void;
  onDone: (a: NextAction) => void;
  onReview: () => void;
}) {
  if (items.length === 0) {
    return <Card className="p-8 text-center"><p className="text-base font-semibold text-slate-900">You are all caught up.</p><p className="mt-1 text-sm text-slate-600">No unanswered messages, open tasks or drafts waiting. New ones appear here the moment they arrive.</p></Card>;
  }
  return (
    <div className="space-y-5">
      {LEVELS.map((lv) => {
        const list = items.filter((x) => x.level === lv.key);
        if (list.length === 0) return null;
        return (
          <section key={lv.key} aria-label={lv.title}>
            <div className="mb-1.5 flex items-baseline gap-2" style={{ borderLeft: `4px solid ${lv.color}`, paddingLeft: 8 }}>
              <h3 className="text-[15px] font-semibold text-slate-900">{lv.title}</h3>
              <span className="text-xs text-slate-500">{list.length} · {lv.hint}</span>
            </div>
            <ul className="space-y-2">
              {list.map((a) => <ActionCard key={`${a.type}-${a.id}`} a={a} onOpenContact={onOpenContact} onDone={onDone} onReview={onReview} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
