'use client';

import { useMemo, useState } from 'react';
import { Select } from '@/components/ui/Field';
import { Card } from '@/components/ui/Card';
import { openValueSeries, type Contact, type CrmMetrics, type Deal, type ReorderItem, type StageKey } from '@/lib/crm/model';
import { formatCurrency } from '@/lib/format';
import { PipelineBoard } from './PipelineBoard';

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl2 border border-slate-200 bg-white px-4 py-3 shadow-card">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold leading-none text-[#0f2059]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** Open pipeline value over the last six months, as a simple area chart. */
function PipelineChart({ deals, now }: { deals: Deal[]; now: number }) {
  const series = useMemo(() => openValueSeries(deals, now, 6), [deals, now]);
  const max = Math.max(1, ...series.map((p) => p.value));
  const W = 800, H = 150, PAD = 6;
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(1, series.length - 1);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(series.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-[#0f2059]">Open pipeline value</h3>
        <span className="text-xs text-slate-500">Last 6 months · now {formatCurrency(series.at(-1)?.value ?? 0)}</span>
      </div>
      <div className="mt-2 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`Open pipeline value by month: ${series.map((p) => `${p.label} ${formatCurrency(p.value)}`).join(', ')}`} className="w-full min-w-[480px]">
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="#e2e8f0" />
        <line x1={PAD} x2={W - PAD} y1={PAD} y2={PAD} stroke="#e2e8f0" strokeDasharray="3 3" />
        <text x={PAD + 2} y={PAD + 11} fontSize="10" fill="#94a3b8">{formatCurrency(max)}</text>
        <path d={area} fill="#3f5fe0" opacity="0.12" />
        <path d={line} fill="none" stroke="#3f5fe0" strokeWidth="2.5" strokeLinejoin="round" />
        {series.map((p, i) => <circle key={p.label} cx={x(i)} cy={y(p.value)} r="3" fill="#3f5fe0" />)}
        {series.map((p, i) => <text key={`t-${p.label}`} x={x(i)} y={H + 12} fontSize="10" textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'} fill="#64748b">{p.label}</text>)}
      </svg>
      </div>
    </Card>
  );
}

/** The first tab: how much is in play, the board, and how the pipeline has moved. Narrow the board to one person's deals. */
export function PipelineView({
  m, deals, contacts, reorders, now, actor, onOpen, onMove, onNew, onStartReorder, onOpenContact,
}: {
  m: CrmMetrics;
  deals: Deal[];
  contacts: Contact[];
  reorders: ReorderItem[];
  now: number;
  actor: string;
  onOpen: (id: string) => void;
  onMove: (id: string, stage: StageKey) => void;
  onNew: (stage: StageKey) => void;
  onStartReorder: (r: ReorderItem) => void;
  onOpenContact: (id: string) => void;
}) {
  const [who, setWho] = useState('all');
  const people = useMemo(() => [...new Set(deals.map((d) => d.owner?.trim()).filter((n): n is string => Boolean(n)))].sort((a, b) => a.localeCompare(b)), [deals]);
  const shown = useMemo(() => (who === 'all' ? deals : who === 'none' ? deals.filter((d) => !d.owner?.trim()) : deals.filter((d) => d.owner?.trim() === who)), [deals, who]);
  const hasMe = actor.trim() !== '';
  const shownReorders = who === 'all' ? reorders : who === 'none' ? reorders.filter((r) => !r.owner) : reorders.filter((r) => r.owner === who);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open pipeline" value={formatCurrency(m.openValue)} hint={`${m.openCount} open deal${m.openCount === 1 ? '' : 's'}`} />
        <Kpi label="Expected revenue" value={formatCurrency(m.forecast)} hint="Weighted by stage" />
        <Kpi label="Won (last 90 days)" value={formatCurrency(m.wonValue)} hint={`${m.wonCount} deal${m.wonCount === 1 ? '' : 's'}`} />
        <Kpi label="Win rate" value={m.winRate === null ? '—' : `${m.winRate}%`} hint={m.winRate === null ? 'Nothing closed yet' : `${m.wonCount} won, ${m.lostCount} lost`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-slate-600" htmlFor="pipeline-who">Show</label>
        <Select id="pipeline-who" className="!w-auto" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="all">Everyone&apos;s deals</option>
          {hasMe ? <option value={actor}>My deals ({actor})</option> : null}
          {people.filter((p) => p !== actor).map((p) => <option key={p} value={p}>{p}</option>)}
          <option value="none">Unassigned</option>
        </Select>
      </div>
      <PipelineBoard deals={shown} contacts={contacts} reorders={shownReorders} now={now} onOpen={onOpen} onMove={onMove} onNew={onNew} onStartReorder={onStartReorder} onOpenContact={onOpenContact} />
      <PipelineChart deals={deals} now={now} />
    </div>
  );
}
