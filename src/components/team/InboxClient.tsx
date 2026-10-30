'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input, Label, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { DEPARTMENTS, departmentName, type DepartmentKey } from '@/lib/auth/permissions';

interface Task {
  id: string;
  title: string;
  detail: string | null;
  fromName: string;
  toDepartment: DepartmentKey | null;
  toUserName: string | null;
  status: 'open' | 'done' | 'dismissed';
  href: string | null;
  dueDate: string | null;
  doneAt: string | null;
  doneByName: string | null;
  createdAt: string;
}
type Box = 'inbox' | 'sent' | 'done';
const TABS: { key: Box; label: string }[] = [{ key: 'inbox', label: 'For me' }, { key: 'sent', label: 'Handed on' }, { key: 'done', label: 'Finished' }];

async function call<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || 'That did not work. Please try again.');
  return data;
}

export function InboxClient({ initial, readOnly }: { initial: Task[]; readOnly: boolean }) {
  const { notify } = useToast();
  const [box, setBox] = useState<Box>('inbox');
  const [tasks, setTasks] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  async function load(next: Box) {
    setBox(next);
    setLoading(true);
    try {
      setTasks((await call<{ tasks: Task[] }>(`/api/tasks?box=${next}`)).tasks);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not load.', 'error');
    } finally {
      setLoading(false);
    }
  }
  async function mark(t: Task, status: 'open' | 'done' | 'dismissed') {
    try {
      await call(`/api/tasks/${t.id}`, 'PATCH', { status });
      notify(status === 'done' ? 'Marked done.' : status === 'open' ? 'Reopened.' : 'Dismissed.');
      await load(box);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'That did not work.', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Inbox" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={box === t.key} onClick={() => load(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${box === t.key ? 'bg-royal-gradient text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{t.label}</button>
          ))}
        </div>
        {!readOnly ? <Button onClick={() => setAdding(true)}>Hand work to a team</Button> : null}
      </div>

      <Card>
        <CardHeader><CardTitle>{TABS.find((t) => t.key === box)!.label} ({tasks.length})</CardTitle></CardHeader>
        <CardBody className="p-0" aria-busy={loading}>
          {tasks.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">{box === 'inbox' ? 'Nothing waiting for you. When another team hands you work, it shows up here and in the bell at the top.' : 'Nothing here yet.'}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {tasks.map((t) => (
                <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0 max-w-2xl">
                    <div className="font-medium text-slate-900">{t.title}</div>
                    {t.detail ? <p className="mt-1 text-sm text-slate-600">{t.detail}</p> : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>From {t.fromName}</span>
                      <span>·</span>
                      <span>For {t.toUserName ?? (t.toDepartment ? departmentName(t.toDepartment) : 'the team')}</span>
                      <span>·</span>
                      <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                      {t.dueDate ? <Badge tone="warning">Due {t.dueDate}</Badge> : null}
                      {t.status !== 'open' ? <Badge tone="success">{t.status === 'done' ? `Done by ${t.doneByName ?? 'someone'}` : 'Dismissed'}</Badge> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {t.href ? <Link prefetch={false} href={t.href} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Open</Link> : null}
                    {!readOnly && t.status === 'open' ? (
                      <>
                        <Button size="sm" onClick={() => mark(t, 'done')}>Mark done</Button>
                        <Button size="sm" variant="ghost" onClick={() => mark(t, 'dismissed')}>Dismiss</Button>
                      </>
                    ) : null}
                    {!readOnly && t.status !== 'open' ? <Button size="sm" variant="secondary" onClick={() => mark(t, 'open')}>Reopen</Button> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {adding ? <HandOffDialog onClose={() => setAdding(false)} onSaved={async () => { setAdding(false); notify('Handed over.'); await load('sent'); }} /> : null}
    </div>
  );
}

function HandOffDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [dept, setDept] = useState<DepartmentKey | ''>('finance');
  const [person, setPerson] = useState('');
  const [due, setDue] = useState('');
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The colleague list loads when the dialog opens.
  useEffect(() => {
    let alive = true;
    call<{ people: { id: string; name: string }[] }>('/api/tasks/people').then((r) => alive && setPeople(r.people)).catch(() => {});
    return () => { alive = false; };
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await call('/api/tasks', 'POST', { title, detail: detail || undefined, toDepartment: dept || undefined, toUserId: person || undefined, dueDate: due || undefined });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Hand work to a team" description="It lands in their Team inbox and the bell at the top."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Hand over</Button></>}>
      <div className="space-y-3">
        {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div><Label htmlFor="tt">What needs doing</Label><Input id="tt" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Send the signed contract to the customer" /></div>
        <div><Label htmlFor="td">Details (optional)</Label><Textarea id="td" rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="tdept">Department</Label>
            <Select id="tdept" value={dept} onChange={(e) => setDept(e.target.value as DepartmentKey | '')}>
              <option value="">Any (a person)</option>
              {DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="tp">A specific person (optional)</Label>
            <Select id="tp" value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Whole department</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
        </div>
        <div><Label htmlFor="tdue">Due (optional)</Label><Input id="tdue" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
      </div>
    </Modal>
  );
}
