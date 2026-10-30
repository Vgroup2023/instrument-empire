'use client';

import { Card } from '@/components/ui/Card';
import { OPEN_STAGES, type Activity, type CrmMetrics, type Deal } from '@/lib/crm/model';
import { formatCurrency } from '@/lib/format';
import { ActivityRow } from './ActivityParts';

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1.5 text-[26px] font-bold leading-none tracking-tight text-[#0f2059]">{value}</p>
      {hint ? <p className={`mt-1.5 text-xs ${tone === 'bad' ? 'font-semibold text-red-600' : tone === 'good' ? 'font-semibold text-emerald-600' : 'text-slate-500'}`}>{hint}</p> : null}
    </Card>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%`, background: color }} />
    </div>
  );
}

/** The CRM overview: how much is in play, what is likely to close, who is winning, and what just happened. */
export function CrmDashboard({
  m, deals, activities, onOpenDeal, onToggleTask, live, attention, onGo,
}: {
  attention: { drafts: number; followUps: number; meetings: number };
  onGo: (tab: 'review' | 'upcoming' | 'activity') => void;
  m: CrmMetrics;
  deals: Deal[];
  activities: Activity[];
  onOpenDeal: (id: string) => void;
  onToggleTask: (a: Activity) => void;
  live: boolean;
}) {
  const open = m.stages.filter((s) => OPEN_STAGES.includes(s.key));
  const maxValue = Math.max(1, ...open.map((s) => s.value));
  const maxOwner = Math.max(1, ...m.owners.map((o) => o.wonValue + o.openValue));
  const dealTitle = (id: string | null) => deals.find((d) => d.id === id)?.title;
  const feed = activities.filter((a) => a.kind !== 'task' || a.doneAt).slice(0, 12);
  const tasks = activities.filter((a) => a.kind === 'task' && !a.doneAt).sort((a, b) => (a.dueAt ?? '') < (b.dueAt ?? '') ? -1 : 1).slice(0, 6);
  const weekTotal = Object.values(m.activityWeek).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Open pipeline" value={formatCurrency(m.openValue)} hint={`${m.openCount} open deal${m.openCount === 1 ? '' : 's'}`} />
        <Kpi label="Expected revenue" value={formatCurrency(m.forecast)} hint="Weighted by stage" />
        <Kpi label="Won (last 90 days)" value={formatCurrency(m.wonValue)} hint={`${m.wonCount} deal${m.wonCount === 1 ? '' : 's'}${m.avgDealSize ? ` · avg ${formatCurrency(m.avgDealSize)}` : ''}`} tone={m.wonCount ? 'good' : undefined} />
        <Kpi label="Win rate" value={m.winRate === null ? '—' : `${m.winRate}%`} hint={m.winRate === null ? 'Nothing closed yet' : `${m.wonCount} won, ${m.lostCount} lost`} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <Card className="p-5">
            <h3 className="text-[15px] font-semibold text-[#0f2059]">Deals by stage</h3>
            <p className="text-xs text-slate-500">Open value in each stage</p>
            <ul className="mt-4 space-y-3">
              {open.map((s) => (
                <li key={s.key}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="font-medium text-slate-800">{s.label} <span className="font-normal text-slate-500">· {s.count}</span></span>
                    <span className="font-semibold text-slate-900">{formatCurrency(s.value)}</span>
                  </div>
                  <Bar pct={(s.value / maxValue) * 100} color={s.color} />
                </li>
              ))}
            </ul>
            {m.openCount === 0 ? <p className="mt-3 text-sm text-slate-500">No open deals yet. Add one on the Pipeline tab.</p> : null}
          </Card>

          <Card className="p-5">
            <h3 className="text-[15px] font-semibold text-[#0f2059]">Team performance</h3>
            <p className="text-xs text-slate-500">Won in the last 90 days and still open, by owner</p>
            {m.owners.length === 0 ? <p className="mt-3 text-sm text-slate-500">Deals appear here once they have an owner.</p> : (
              <ul className="mt-4 space-y-3">
                {m.owners.map((o) => (
                  <li key={o.owner}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="font-medium text-slate-800">{o.owner}</span>
                      <span className="text-xs text-slate-500">won {formatCurrency(o.wonValue)} · open {formatCurrency(o.openValue)}</span>
                    </div>
                    <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                      <div style={{ width: `${(o.wonValue / maxOwner) * 100}%`, background: '#16a34a' }} />
                      <div style={{ width: `${(o.openValue / maxOwner) * 100}%`, background: '#3f5fe0' }} />
                    </div>
                  </li>
                ))}
                <li className="flex gap-4 text-[11px] text-slate-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#16a34a]" />Won</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#3f5fe0]" />Open</span></li>
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="text-[15px] font-semibold text-[#0f2059]">Activity this week</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {([['call', '📞', 'Calls'], ['email', '✉️', 'Emails'], ['sms', '💬', 'Texts'], ['meeting', '🤝', 'Meetings'], ['note', '📝', 'Notes']] as const).map(([k, icon, label]) => (
                <div key={k} className="rounded-xl bg-slate-50 p-3 text-center">
                  <p className="text-lg">{icon}</p>
                  <p className="text-xl font-bold text-[#0f2059]">{m.activityWeek[k]}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">{weekTotal} recorded in the last 7 days.</p>
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-4">
          <Card className="p-5">
            <h3 className="text-[15px] font-semibold text-[#0f2059]">Needs your attention</h3>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {([
                ['review', attention.drafts, 'follow-up emails to approve', '✍️'],
                ['upcoming', attention.followUps, 'people due a follow-up', '🔔'],
                ['upcoming', attention.meetings, 'meetings in the next 7 days', '📅'],
                ['upcoming', m.tasksOverdue, 'overdue tasks', '⚠️'],
              ] as const).map(([tab, n, label, icon]) => (
                <li key={label}>
                  <button type="button" onClick={() => onGo(tab)} className="flex w-full items-center justify-between gap-3 py-2 text-left hover:text-brand-700">
                    <span><span aria-hidden className="mr-2">{icon}</span>{label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${n ? 'bg-royal-gradient text-white' : 'bg-slate-100 text-slate-500'}`}>{n}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-[#0f2059]">Live activity</h3>
              <span className={`flex items-center gap-1.5 text-xs font-medium ${live ? 'text-emerald-600' : 'text-slate-400'}`}>
                <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-emerald-500' : 'bg-slate-300'}`} />{live ? 'Live' : 'Paused'}
              </span>
            </div>
            {feed.length === 0 ? <p className="mt-3 text-sm text-slate-500">Calls, emails, meetings and changes appear here as they happen.</p> : (
              <ul className="mt-1 divide-y divide-slate-100">
                {feed.map((a) => (
                  <div key={a.id} onClick={() => a.dealId && onOpenDeal(a.dealId)} className={a.dealId ? 'cursor-pointer' : ''}>
                    <ActivityRow a={a} dealTitle={dealTitle(a.dealId)} />
                  </div>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[15px] font-semibold text-[#0f2059]">Tasks</h3>
              <span className="text-xs text-slate-500">{m.tasksOpen} open{m.tasksOverdue ? <b className="ml-1 text-red-600">{m.tasksOverdue} overdue</b> : null}</span>
            </div>
            {tasks.length === 0 ? <p className="mt-3 text-sm text-slate-500">No open tasks.</p> : (
              <ul className="divide-y divide-slate-100">
                {tasks.map((a) => <ActivityRow key={a.id} a={a} dealTitle={dealTitle(a.dealId)} onToggleTask={onToggleTask} />)}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
