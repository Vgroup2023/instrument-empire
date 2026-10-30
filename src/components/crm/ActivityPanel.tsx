'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { ALL_KINDS, KIND_INFO, type Activity, type ActivityKind, type Contact, type Deal } from '@/lib/crm/model';
import { ActivityRow } from './ActivityParts';

/** Every recorded activity across the CRM, newest first, with a filter by type. Tasks have their own list. */
export function ActivityPanel({
  activities, deals, contacts, mode, onOpenDeal, onToggleTask,
}: {
  activities: Activity[];
  deals: Deal[];
  contacts: Contact[];
  mode: 'feed' | 'tasks';
  onOpenDeal: (id: string) => void;
  onToggleTask: (a: Activity) => void;
}) {
  const [kind, setKind] = useState<'all' | ActivityKind>('all');
  const title = (a: Activity) => {
    const d = deals.find((x) => x.id === a.dealId)?.title;
    const c = contacts.find((x) => x.id === a.contactId)?.name;
    return d ?? c;
  };

  let list = activities;
  if (mode === 'tasks') list = activities.filter((a) => a.kind === 'task').sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt) || (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
  else if (kind !== 'all') list = activities.filter((a) => a.kind === kind);

  return (
    <div className="space-y-3">
      {mode === 'feed' ? (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filter by type">
          {(['all', ...ALL_KINDS] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${kind === k ? 'border-transparent bg-royal-gradient text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
              {k === 'all' ? 'All' : `${KIND_INFO[k].icon} ${KIND_INFO[k].label}`}
            </button>
          ))}
        </div>
      ) : null}
      <Card className="px-5 py-2">
        {list.length === 0 ? <p className="py-6 text-sm text-slate-500">{mode === 'tasks' ? 'No tasks. Add one from a deal or a contact.' : 'No activity recorded yet. Open a deal and record a call, email, meeting or note.'}</p> : (
          <ul className="divide-y divide-slate-100">
            {list.map((a) => (
              <div key={a.id} onClick={() => a.dealId && onOpenDeal(a.dealId)} className={a.dealId ? 'cursor-pointer' : ''}>
                <ActivityRow a={a} dealTitle={title(a)} onToggleTask={onToggleTask} />
              </div>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
