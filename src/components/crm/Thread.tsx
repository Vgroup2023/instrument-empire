'use client';

import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/Badge';
import { INTENT_LABEL, KIND_INFO, ago, formatDuration, type Activity, type Channel } from '@/lib/crm/model';

const CHANNEL_LABEL: Record<Channel, string> = { email: 'Email', sms: 'Text', call: 'Call', whatsapp: 'WhatsApp', web: 'Web form' };
const isMessage = (a: Activity) => Boolean(a.channel) && (a.kind === 'email' || a.kind === 'sms' || a.kind === 'call' || (a.kind === 'note' && a.channel === 'web'));

function PriorityPill({ p }: { p: number }) {
  const tone = p >= 70 ? 'danger' : p >= 40 ? 'warning' : 'neutral';
  return <Badge tone={tone}>{p >= 70 ? 'Needs you now' : p >= 40 ? 'Today' : 'Soon'} · {p}</Badge>;
}

/**
 * The whole conversation with one person, oldest first like a chat: what they sent on the left, what we sent on the
 * right, with what reading each incoming message found (what it is, how urgent, in one line). Tasks, meetings, notes and
 * system entries sit between as slim lines. The newest is kept in view.
 */
export function Thread({ activities, onToggleTask, now }: { activities: Activity[]; onToggleTask?: (a: Activity) => void; now?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const items = [...activities].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const last = items.at(-1)?.id;
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [last]);

  if (items.length === 0) return <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">Nothing recorded yet. Record a call, note or message below.</p>;

  return (
    <div ref={box} className="max-h-[420px] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-3" role="log" aria-label="Conversation">
      {items.map((a) => {
        if (!isMessage(a)) {
          const info = KIND_INFO[a.kind];
          const scheduled = a.kind === 'task' || a.kind === 'meeting';
          return (
            <div key={a.id} className="flex items-center justify-center gap-2 text-center text-xs text-slate-500">
              <span aria-hidden>{info.icon}</span>
              <span className={a.doneAt ? 'line-through' : ''}><b className="font-medium text-slate-700">{a.summary}</b> · {info.label} · {a.actor} · {ago(a.createdAt, now)}</span>
              {scheduled && onToggleTask ? <button type="button" onClick={() => onToggleTask(a)} className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-medium text-slate-700 hover:bg-slate-50">{a.doneAt ? 'Reopen' : 'Done'}</button> : null}
            </div>
          );
        }
        const inbound = a.direction === 'in';
        const t = a.triage;
        return (
          <div key={a.id} className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[88%] rounded-2xl border px-3 py-2 shadow-sm ${inbound ? 'rounded-tl-sm border-slate-200 bg-white' : 'rounded-tr-sm border-brand-200 bg-brand-50'}`}>
              <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500">
                <span aria-hidden>{KIND_INFO[a.kind].icon}</span>
                <span className="font-semibold text-slate-700">{inbound ? a.actor : 'We'}</span>
                <span>· {a.channel ? CHANNEL_LABEL[a.channel] : KIND_INFO[a.kind].label}{a.durationSeconds ? ` · ${formatDuration(a.durationSeconds)}` : ''} · {ago(a.createdAt, now)}</span>
              </p>
              <p className="mt-0.5 text-sm font-medium text-slate-900">{a.summary}</p>
              {a.detail ? <p className="mt-0.5 line-clamp-6 whitespace-pre-line text-xs text-slate-700">{a.detail}</p> : null}
              {inbound && t ? (
                <div className="mt-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
                  {t.source === 'ai' && t.summary ? <p className="mb-1 text-slate-700"><span aria-hidden>✨ </span>{t.summary}</p> : null}
                  <p className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={t.intent === 'complaint' ? 'danger' : t.intent === 'unsubscribe' ? 'neutral' : 'brand'}>{INTENT_LABEL[t.intent]}</Badge>
                    {a.priority !== null ? <PriorityPill p={a.priority} /> : null}
                    {a.doneAt ? <Badge tone="success">handled</Badge> : null}
                    {onToggleTask ? <button type="button" onClick={() => onToggleTask(a)} className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-medium text-slate-700 hover:bg-slate-50">{a.doneAt ? 'Reopen' : 'Mark handled'}</button> : null}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
