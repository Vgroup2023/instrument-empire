'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Label, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { KIND_INFO, MANUAL_KINDS, ago, formatDuration, type Activity, type ManualKind } from '@/lib/crm/model';
import { crmCall } from './api';

/** The current time, refreshed every 30 seconds, so "5m ago" and "overdue" stay right on a page left open. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** One line of the activity feed or a deal's timeline. */
export function ActivityRow({ a, dealTitle, onToggleTask }: { a: Activity; dealTitle?: string; onToggleTask?: (a: Activity) => void }) {
  const info = KIND_INFO[a.kind];
  const now = useNow();
  const overdue = a.kind === 'task' && !a.doneAt && a.dueAt && Date.parse(a.dueAt) < now;
  return (
    <li className="flex gap-3 py-2.5">
      <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-base">{info.icon}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium text-slate-900 ${a.kind === 'task' && a.doneAt ? 'line-through opacity-60' : ''}`}>{a.summary}</p>
        {dealTitle ? <p className="truncate text-xs text-brand-700">{dealTitle}</p> : null}
        {a.detail ? <p className="mt-0.5 whitespace-pre-line text-xs text-slate-600">{a.detail}</p> : null}
        <p className="mt-0.5 text-xs text-slate-500">
          {info.label}
          {a.durationSeconds ? ` · ${formatDuration(a.durationSeconds)}` : ''}
          {a.kind === 'task' && a.dueAt ? ` · due ${new Date(a.dueAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
          {overdue ? <span className="ml-1 font-semibold text-red-600">overdue</span> : null}
          {' · '}{a.actor} · {ago(a.createdAt, now)}
        </p>
      </div>
      {a.kind === 'task' && onToggleTask ? (
        <button type="button" onClick={() => onToggleTask(a)} className="self-start rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
          {a.doneAt ? 'Reopen' : 'Done'}
        </button>
      ) : null}
    </li>
  );
}

/**
 * Records a call, email, meeting, note or task against a deal or contact. A call can be timed live: start it when the
 * call begins, end it, and the length is saved with the entry.
 */
export function Composer({ dealId, contactId, actor, onLogged }: { dealId?: string; contactId?: string; actor: string; onLogged: (a: Activity) => void }) {
  const { notify } = useToast();
  const [kind, setKind] = useState<ManualKind>('note');
  const [summary, setSummary] = useState('');
  const [detail, setDetail] = useState('');
  const [due, setDue] = useState('');
  const [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (startedAt === null) return;
    tick.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [startedAt]);

  async function save(durationSeconds?: number) {
    setBusy(true);
    try {
      const seconds = durationSeconds ?? (minutes ? Math.round(Number(minutes) * 60) : undefined);
      const { activity } = await crmCall<{ activity: Activity }>('/api/crm/activities', 'POST', {
        kind, dealId, contactId, actor,
        summary: summary.trim() || (kind === 'call' ? 'Phone call' : KIND_INFO[kind].label),
        detail: detail.trim() || undefined,
        dueAt: kind === 'task' && due ? new Date(due).toISOString() : undefined,
        durationSeconds: seconds,
      });
      onLogged(activity);
      setSummary(''); setDetail(''); setDue(''); setMinutes(''); setStartedAt(null); setElapsed(0);
      notify(`${KIND_INFO[kind].label} recorded.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not record that.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Activity type">
        {MANUAL_KINDS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${kind === k ? 'border-transparent bg-royal-gradient text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
            {KIND_INFO[k].icon} {KIND_INFO[k].label}
          </button>
        ))}
      </div>
      {kind === 'call' && startedAt !== null ? (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-red-700"><span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />On the call · {formatDuration(elapsed)}</span>
          <Button size="sm" variant="danger" loading={busy} onClick={() => save(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)))}>End call and log</Button>
        </div>
      ) : null}
      <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={kind === 'task' ? 'What needs doing?' : 'Summary, for example "Discussed pricing"'} maxLength={200} aria-label="Summary" />
      <Textarea className="mt-2" rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Details (optional)" aria-label="Details" />
      <div className="mt-2 flex flex-wrap items-end gap-2">
        {kind === 'task' ? (
          <div><Label htmlFor={`due-${dealId ?? contactId}`}>Due</Label><Input id={`due-${dealId ?? contactId}`} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        ) : null}
        {kind === 'call' || kind === 'meeting' ? (
          <div className="w-28"><Label htmlFor={`min-${dealId ?? contactId}`}>Minutes</Label><Input id={`min-${dealId ?? contactId}`} type="number" min={0} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="optional" /></div>
        ) : null}
        <div className="ml-auto flex gap-2">
          {kind === 'call' && startedAt === null ? <Button type="button" size="sm" variant="secondary" onClick={() => { setStartedAt(Date.now()); setElapsed(0); }}>▶ Start call timer</Button> : null}
          <Button type="button" size="sm" loading={busy} disabled={kind === 'task' && !due} onClick={() => save()}>{kind === 'task' ? 'Add task' : 'Record'}</Button>
        </div>
      </div>
    </div>
  );
}
