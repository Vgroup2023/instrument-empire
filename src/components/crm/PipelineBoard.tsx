'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { OPEN_STAGES, STAGES, ago, needsFollowUp, type Contact, type Deal, type ReorderItem, type StageKey } from '@/lib/crm/model';
import { formatCurrency } from '@/lib/format';
import { Avatar } from './Avatar';
import { BusinessBadge } from './BusinessBadge';

// A solid coloured header with an arrow point, the stage total underneath, as in common CRM boards.
const CHEVRON = 'flex items-center justify-between py-2.5 pl-3 pr-6 text-white [clip-path:polygon(0_0,calc(100%-14px)_0,100%_50%,calc(100%-14px)_100%,0_100%)]';

/**
 * Deals as cards in a column per stage, then a Reorder due column for customers whose next order is near. Drag a deal
 * to another column, or use the stage menu on the card. Each card shows who has it, and tags it when it needs a nudge.
 */
export function PipelineBoard({
  deals, contacts, reorders, now, onOpen, onMove, onNew, onStartReorder, onOpenContact,
}: {
  deals: Deal[];
  contacts: Contact[];
  reorders: ReorderItem[];
  now: number;
  onOpen: (id: string) => void;
  onMove: (id: string, stage: StageKey) => void;
  onNew: (stage: StageKey) => void;
  onStartReorder: (r: ReorderItem) => void;
  onOpenContact: (id: string) => void;
}) {
  const [over, setOver] = useState<StageKey | null>(null);
  const contactName = (id: string | null) => contacts.find((c) => c.id === id);
  // Won and lost columns show only the most recent so the board stays short.
  const cap = (key: StageKey, list: Deal[]) => (OPEN_STAGES.includes(key) ? list : list.slice(0, 8));
  const reorderTotal = reorders.reduce((s, r) => s + r.lastValue, 0);

  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
      {STAGES.map((stage) => {
        const all = deals.filter((d) => d.stage === stage.key).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
        const total = all.reduce((s, d) => s + d.value, 0);
        return (
          <section
            key={stage.key}
            aria-label={`${stage.label} column`}
            onDragOver={(e) => { e.preventDefault(); setOver(stage.key); }}
            onDragLeave={() => setOver((o) => (o === stage.key ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData('text/deal');
              if (id) onMove(id, stage.key);
            }}
            className={`flex w-[272px] shrink-0 flex-col overflow-hidden rounded-lg border bg-[#f5f6fa] ${over === stage.key ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200'}`}
          >
            <header>
              <div className={CHEVRON} style={{ background: stage.color }}>
                <h3 className="text-sm font-semibold">{stage.label} / {all.length}</h3>
                {OPEN_STAGES.includes(stage.key) ? (
                  <button type="button" onClick={() => onNew(stage.key)} aria-label={`Add a deal to ${stage.label}`} className="rounded px-1.5 text-lg leading-none text-white/90 hover:bg-white/20">+</button>
                ) : null}
              </div>
              <p className="bg-white px-3 py-2.5 text-[15px] font-medium tabular-nums" style={{ color: stage.color }}>
                {formatCurrency(total)}{OPEN_STAGES.includes(stage.key) ? <span className="ml-1.5 text-[11px] font-normal text-slate-400">{stage.probability}%</span> : null}
              </p>
            </header>
            <ul className="flex min-h-[80px] flex-col gap-2 px-2 pb-2">
              {cap(stage.key, all).map((d) => {
                const c = contactName(d.contactId);
                const nudge = needsFollowUp(d, now);
                const open = OPEN_STAGES.includes(d.stage);
                return (
                  <li
                    key={d.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/deal', d.id)}
                    className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing"
                  >
                    <button type="button" onClick={() => onOpen(d.id)} className="block w-full text-left">
                      <p className="text-sm text-slate-700">{d.title}</p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="rounded bg-slate-100 px-2 py-1 font-semibold tabular-nums text-slate-800" style={{ borderLeft: `3px solid ${stage.color}` }}>{formatCurrency(d.value, d.currency)}</span>
                        <span className="text-slate-500">Deal value</span>
                      </p>
                      {c ? <p className="mt-0.5 truncate text-xs text-slate-600">{c.name}{c.company ? ` · ${c.company}` : ''}</p> : null}
                      <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Avatar name={d.owner} />
                        {open && !d.owner ? <Badge tone="warning">Unassigned</Badge> : <span className="text-[11px] text-slate-500">{d.owner ?? ''}</span>}
                        {nudge ? <Badge tone="warning">Follow up</Badge> : null}
                        <BusinessBadge business={d.business} />
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {d.expectedClose ? `closes ${d.expectedClose} · ` : ''}{d.stage === 'proposal' ? 'quote ' : ''}updated {ago(d.updatedAt, now)}
                      </p>
                    </button>
                    <label className="mt-2 block">
                      <span className="sr-only">Move {d.title} to stage</span>
                      <select
                        value={d.stage}
                        onChange={(e) => onMove(d.id, e.target.value as StageKey)}
                        className="w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-600"
                      >
                        {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </label>
                  </li>
                );
              })}
              {all.length === 0 ? <li className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">Drop a deal here</li> : null}
              {all.length > cap(stage.key, all).length ? <li className="px-1 text-center text-[11px] text-slate-500">+{all.length - cap(stage.key, all).length} older</li> : null}
            </ul>
          </section>
        );
      })}

      <section aria-label="Reorder due column" className="flex w-[272px] shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-[#f5f6fa]">
        <header>
          <div className={CHEVRON} style={{ background: '#0e7490' }}><h3 className="text-sm font-semibold">Reorder due / {reorders.length}</h3></div>
          <p className="bg-white px-3 py-2.5 text-[15px] font-medium tabular-nums text-cyan-700">{formatCurrency(reorderTotal)} <span className="text-[11px] font-normal text-slate-400">last order</span></p>
        </header>
        <ul className="flex min-h-[80px] flex-col gap-2 px-2 pb-2">
          {reorders.slice(0, 8).map((r) => (
            <li key={r.contactId} className="rounded-lg border border-slate-200 bg-white p-3 shadow-card">
              <button type="button" onClick={() => onOpenContact(r.contactId)} className="block w-full text-left">
                <p className="text-sm font-semibold text-slate-900">{r.company ?? r.name}</p>
                <p className="mt-0.5 text-sm font-bold text-[#0f2059]">{formatCurrency(r.lastValue, r.currency)}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Avatar name={r.owner} />
                  <Badge tone={r.status === 'due' ? 'warning' : 'neutral'}>Day {r.daysSince}</Badge>
                  <span className="text-[11px] text-slate-500">{r.daysUntil < 0 ? `${-r.daysUntil}d overdue` : r.daysUntil === 0 ? 'due today' : `due in ${r.daysUntil}d`}</span>
                </p>
              </button>
              <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={() => onStartReorder(r)}>Start reorder</Button>
            </li>
          ))}
          {reorders.length === 0 ? <li className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">No reorders due soon</li> : null}
          {reorders.length > 8 ? <li className="px-1 text-center text-[11px] text-slate-500">+{reorders.length - 8} more in Reorders</li> : null}
        </ul>
      </section>
    </div>
  );
}
