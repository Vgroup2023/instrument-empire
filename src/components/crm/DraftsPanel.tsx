'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { ago, type Activity, type Contact, type Draft } from '@/lib/crm/model';
import { crmCall } from './api';

function DraftCard({ draft, contact, actor, onChanged, onActivity }: { draft: Draft; contact?: Contact; actor: string; onChanged: (d: Draft) => void; onActivity: (a: Activity) => void }) {
  const { notify } = useToast();
  const [subject, setSubject] = useState(draft.subject ?? '');
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState<'send' | 'dismiss' | null>(null);

  async function act(action: 'send' | 'dismiss') {
    setBusy(action);
    try {
      const res = await crmCall<{ draft: Draft; activity: Activity | null }>(`/api/crm/drafts/${draft.id}`, 'PATCH', { action, subject, body, actor });
      onChanged(res.draft);
      if (res.activity) onActivity(res.activity);
      notify(action === 'send' ? `Sent to ${contact?.name ?? 'the contact'}.` : 'Draft dismissed.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not do that.', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">To {contact?.name ?? 'contact'} <span className="font-normal text-slate-500">{contact?.email ?? ''}</span></p>
        <p className="text-xs text-slate-500">{draft.createdBy} · {ago(draft.createdAt)}</p>
      </div>
      {draft.reason ? <p className="mt-0.5 text-xs text-slate-600">{draft.reason}</p> : null}
      {draft.status === 'failed' && draft.error ? <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">Last attempt failed: {draft.error}</p> : null}
      <Input className="mt-3" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" maxLength={300} />
      <Textarea className="mt-2" rows={7} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message" maxLength={10000} />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" loading={busy === 'dismiss'} onClick={() => act('dismiss')}>Dismiss</Button>
        <Button loading={busy === 'send'} disabled={!body.trim() || !contact?.email} onClick={() => act('send')}>Send email</Button>
      </div>
    </Card>
  );
}

/** Messages the agents have written, waiting for a person to read, change and send. Nothing here goes out by itself. */
export function DraftsPanel({ drafts, contacts, actor, onChanged, onActivity }: { drafts: Draft[]; contacts: Contact[]; actor: string; onChanged: (d: Draft) => void; onActivity: (a: Activity) => void }) {
  const waiting = drafts.filter((d) => d.status === 'pending' || d.status === 'failed');
  const done = drafts.filter((d) => d.status === 'sent' || d.status === 'dismissed').slice(0, 10);
  const who = (id: string) => contacts.find((c) => c.id === id);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">The Follow-up agent writes a message for anyone you have not been in touch with for their follow-up period (weekly by default). Read it, change it if you like, and send it, or dismiss it.</p>
      {waiting.length === 0 ? <Card className="p-6 text-sm text-slate-500">Nothing waiting for your approval.</Card> : waiting.map((d) => (
        <DraftCard key={`${d.id}-${d.updatedAt}`} draft={d} contact={who(d.contactId)} actor={actor} onChanged={onChanged} onActivity={onActivity} />
      ))}
      {done.length ? (
        <Card className="px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Recently handled</h3>
          <ul className="divide-y divide-slate-100">
            {done.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="truncate">{who(d.contactId)?.name ?? 'Contact'}: {d.subject ?? '(no subject)'}</span>
                <span className="shrink-0 text-xs text-slate-500">{d.status === 'sent' ? 'Sent' : 'Dismissed'} · {ago(d.sentAt ?? d.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
