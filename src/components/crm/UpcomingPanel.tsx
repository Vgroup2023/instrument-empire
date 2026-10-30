'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ago, bucketUpcoming, followUpDue, OPEN_STAGES, type Activity, type Contact, type Deal } from '@/lib/crm/model';
import { ActivityRow } from './ActivityParts';

/** Meetings and tasks coming up, grouped by when, and the people due a follow-up. */
export function UpcomingPanel({
  activities, deals, contacts, onOpenDeal, onOpenContact, onToggleTask,
}: {
  activities: Activity[];
  deals: Deal[];
  contacts: Contact[];
  onOpenDeal: (id: string) => void;
  onOpenContact: (id: string) => void;
  onToggleTask: (a: Activity) => void;
}) {
  // eslint-disable-next-line react-hooks/purity -- the grouping is relative to the moment the page is drawn
  const now = Date.now();
  const open = activities.filter((a) => (a.kind === 'task' || a.kind === 'meeting') && !a.doneAt && a.dueAt);
  const groups = bucketUpcoming(open, now, new Date().getTimezoneOffset());
  const contactName = (a: Activity) => (a.dealId ? deals.find((d) => d.id === a.dealId)?.title : contacts.find((c) => c.id === a.contactId)?.name);

  const openDealFor = new Set(deals.filter((d) => OPEN_STAGES.includes(d.stage) && d.contactId).map((d) => d.contactId));
  const due = contacts
    .filter((c) => c.status !== 'archived' && !c.doNotContact)
    .map((c) => ({ c, days: c.followUpDays ?? (openDealFor.has(c.id) ? 7 : null) }))
    .filter((x) => x.days !== null && followUpDue({ ...x.c, followUpDays: x.days }, now))
    .sort((a, b) => (a.c.lastContactAt ?? a.c.createdAt) < (b.c.lastContactAt ?? b.c.createdAt) ? -1 : 1);

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-8">
        {groups.length === 0 ? (
          <Card className="p-6 text-sm text-slate-500">Nothing scheduled. Schedule a meeting or add a task from any deal or contact; the agents also add tasks when someone asks to meet or a deal goes quiet.</Card>
        ) : groups.map((g) => (
          <Card key={g.label} className="px-5 py-3">
            <h3 className={`text-sm font-semibold ${g.label === 'Overdue' ? 'text-red-600' : 'text-[#0f2059]'}`}>{g.label} <span className="font-normal text-slate-500">· {g.items.length}</span></h3>
            <ul className="divide-y divide-slate-100">
              {g.items.map((a) => (
                <div key={a.id} onClick={() => a.dealId && onOpenDeal(a.dealId)} className={a.dealId ? 'cursor-pointer' : ''}>
                  <ActivityRow a={a} dealTitle={contactName(a)} onToggleTask={onToggleTask} />
                </div>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <Card className="h-fit px-5 py-4 xl:col-span-4">
        <h3 className="text-sm font-semibold text-[#0f2059]">Follow-ups due <span className="font-normal text-slate-500">· {due.length}</span></h3>
        <p className="text-xs text-slate-500">People you have not been in touch with for their follow-up period. The Follow-up agent writes a draft for each; find it under Review.</p>
        {due.length === 0 ? <p className="mt-3 text-sm text-slate-500">Everyone is up to date.</p> : (
          <ul className="mt-2 divide-y divide-slate-100">
            {due.slice(0, 15).map(({ c }) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500">last in touch {c.lastContactAt ? ago(c.lastContactAt) : 'never'}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => onOpenContact(c.id)}>Open</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
