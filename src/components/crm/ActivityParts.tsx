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
  const scheduled = (a.kind === 'task' || a.kind === 'meeting') && Boolean(a.dueAt);
  const overdue = scheduled && !a.doneAt && a.dueAt && Date.parse(a.dueAt) < now;
  const done = scheduled && Boolean(a.doneAt);
  return (
    <li className="flex gap-3 py-2.5">
      <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-base">{info.icon}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium text-slate-900 ${done ? 'line-through opacity-60' : ''}`}>
          {a.direction === 'in' ? <span className="mr-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">Received</span> : null}
          {a.direction === 'out' && a.channel ? <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">Sent</span> : null}
          {a.summary}
        </p>
        {dealTitle ? <p className="truncate text-xs text-brand-700">{dealTitle}</p> : null}
        {a.detail ? <p className="mt-0.5 line-clamp-4 whitespace-pre-line text-xs text-slate-600">{a.detail}</p> : null}
        <p className="mt-0.5 text-xs text-slate-500">
          {info.label}
          {a.durationSeconds ? ` · ${formatDuration(a.durationSeconds)}` : ''}
          {scheduled && a.dueAt ? ` · ${a.kind === 'task' ? 'due' : 'scheduled'} ${new Date(a.dueAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
          {overdue ? <span className="ml-1 font-semibold text-red-600">overdue</span> : null}
          {' · '}{a.actor} · {ago(a.createdAt, now)}
          {a.kind === 'meeting' && a.dueAt ? <a href={`/api/crm/activities/${a.id}/ics`} className="ml-2 font-medium text-brand-700 underline" onClick={(e) => e.stopPropagation()}>Add to calendar</a> : null}
        </p>
      </div>
      {scheduled && onToggleTask ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); onToggleTask(a); }} className="self-start rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
          {a.doneAt ? 'Reopen' : 'Done'}
        </button>
      ) : null}
    </li>
  );
}

/**
 * Records a call, email, text, meeting, note or task against a deal or contact, or sends the email or text for real.
 * A call can be timed live: start it when the call begins, end it, and the length is saved with the entry. A meeting
 * given a future time is scheduled, and shows up under Upcoming.
 */
export function Composer({
  dealId, contactId, contact, actor, onLogged,
}: {
  dealId?: string;
  contactId?: string;
  contact?: { name: string; email: string | null; phone: string | null; doNotContact: boolean } | null;
  actor: string;
  onLogged: (a: Activity) => void;
}) {
  const { notify } = useToast();
  const [kind, setKind] = useState<ManualKind>('note');
  const [summary, setSummary] = useState('');
  const [detail, setDetail] = useState('');
  const [due, setDue] = useState('');
  const [minutes, setMinutes] = useState('');
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const idKey = dealId ?? contactId ?? 'x';

  useEffect(() => {
    if (startedAt === null) return;
    tick.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [startedAt]);

  function reset() {
    setSummary(''); setDetail(''); setDue(''); setMinutes(''); setStartedAt(null); setElapsed(0);
  }

  async function save(durationSeconds?: number) {
    setBusy(true);
    try {
      const seconds = durationSeconds ?? (minutes ? Math.round(Number(minutes) * 60) : undefined);
      const { activity } = await crmCall<{ activity: Activity }>('/api/crm/activities', 'POST', {
        kind, dealId, contactId, actor,
        direction: kind === 'call' || kind === 'email' || kind === 'sms' ? direction : undefined,
        summary: summary.trim() || (kind === 'call' ? 'Phone call' : KIND_INFO[kind].label),
        detail: detail.trim() || undefined,
        dueAt: (kind === 'task' || kind === 'meeting') && due ? new Date(due).toISOString() : undefined,
        durationSeconds: seconds,
      });
      onLogged(activity);
      reset();
      notify(kind === 'meeting' && due ? 'Meeting scheduled.' : `${KIND_INFO[kind].label} recorded.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not record that.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!contactId && !dealId) return;
    setBusy(true);
    try {
      const { activity } = await crmCall<{ activity: Activity }>('/api/crm/send', 'POST', {
        contactId, dealId, channel: kind === 'sms' ? 'sms' : 'email', subject: summary.trim() || undefined,
        body: kind === 'sms' ? summary.trim() : detail.trim(), actor,
      });
      onLogged(activity);
      reset();
      notify(kind === 'sms' ? 'Text sent.' : 'Email sent.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not send that.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const canSend =
    Boolean(contactId) && Boolean(contact) && !contact?.doNotContact &&
    ((kind === 'email' && Boolean(contact?.email) && detail.trim().length > 0) || (kind === 'sms' && Boolean(contact?.phone) && summary.trim().length > 0));
  const sendHint = !contact ? null : contact.doNotContact ? `${contact.name} asked not to be contacted.` : kind === 'email' && !contact.email ? 'No email address on file.' : kind === 'sms' && !contact.phone ? 'No phone number on file.' : null;
  const scheduling = kind === 'meeting' && due !== '';

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
      <Input
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder={kind === 'task' ? 'What needs doing?' : kind === 'email' ? 'Subject' : kind === 'sms' ? 'Text message' : kind === 'meeting' ? 'Meeting topic' : 'Summary, for example "Discussed pricing"'}
        maxLength={kind === 'sms' ? 1000 : 200}
        aria-label="Summary"
      />
      <Textarea className="mt-2" rows={kind === 'email' ? 4 : 2} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={kind === 'email' ? 'Message' : 'Details (optional)'} aria-label="Details" />
      <div className="mt-2 flex flex-wrap items-end gap-2">
        {kind === 'call' || kind === 'email' || kind === 'sms' ? (
          <div className="w-32"><Label htmlFor={`dir-${idKey}`}>Direction</Label>
            <select id={`dir-${idKey}`} value={direction} onChange={(e) => setDirection(e.target.value as 'in' | 'out')} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm">
              <option value="out">{kind === 'call' ? 'I called' : 'I sent'}</option>
              <option value="in">{kind === 'call' ? 'They called' : 'I received'}</option>
            </select>
          </div>
        ) : null}
        {kind === 'task' || kind === 'meeting' ? (
          <div><Label htmlFor={`due-${idKey}`}>{kind === 'task' ? 'Due' : 'When (blank if it already happened)'}</Label><Input id={`due-${idKey}`} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        ) : null}
        {kind === 'call' || (kind === 'meeting' && !due) ? (
          <div className="w-28"><Label htmlFor={`min-${idKey}`}>Minutes</Label><Input id={`min-${idKey}`} type="number" min={0} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="optional" /></div>
        ) : null}
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {kind === 'call' && startedAt === null ? <Button type="button" size="sm" variant="secondary" onClick={() => { setStartedAt(Date.now()); setElapsed(0); }}>▶ Start call timer</Button> : null}
          {kind === 'email' || kind === 'sms' ? (
            <Button type="button" size="sm" variant="secondary" loading={busy} disabled={!canSend} title={sendHint ?? undefined} onClick={send}>
              {kind === 'sms' ? 'Send text' : 'Send email'}
            </Button>
          ) : null}
          <Button type="button" size="sm" loading={busy} disabled={kind === 'task' && !due} onClick={() => save()}>
            {kind === 'task' ? 'Add task' : scheduling ? 'Schedule meeting' : kind === 'email' || kind === 'sms' ? 'Record only' : 'Record'}
          </Button>
        </div>
      </div>
      {sendHint && (kind === 'email' || kind === 'sms') ? <p className="mt-1.5 text-xs text-amber-700">{sendHint}</p> : null}
    </div>
  );
}
