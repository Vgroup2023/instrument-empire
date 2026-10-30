'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input, Label, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { DEPARTMENTS, ROLES, canManageUser, departmentName, roleName, type DepartmentKey, type Principal, type RoleKey } from '@/lib/auth/permissions';

interface Person {
  id: string;
  email: string;
  name: string;
  role: RoleKey;
  departments: DepartmentKey[];
  status: 'invited' | 'active' | 'disabled';
  lastLoginAt: string | null;
}
interface Me extends Principal { id: string | null; name: string; legacy: boolean }

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || 'That did not work. Please try again.');
  return data;
}

const statusTone = { active: 'success', invited: 'warning', disabled: 'neutral' } as const;

export function TeamClient({ initial, me }: { initial: Person[]; me: Me }) {
  const router = useRouter();
  const { notify } = useToast();
  const [people, setPeople] = useState(initial);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [link, setLink] = useState<{ title: string; url: string; emailed: boolean } | null>(null);

  const reload = async () => {
    const data = await call<{ users: Person[] }>('/api/team', 'GET');
    setPeople(data.users);
  };
  const canInvite = !me.legacy && ROLES.some((r) => canManageUser(me, null, { role: r.key, departments: me.departments.length ? me.departments : ['finance'] }));

  async function act(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'That did not work.', 'error');
    }
  }

  const newLink = (p: Person) => act(async () => {
    const r = await call<{ link: string; emailed: boolean }>(`/api/team/${p.id}/link`, 'POST');
    setLink({ title: p.status === 'invited' ? `Invitation for ${p.name}` : `Password reset for ${p.name}`, url: r.link, emailed: r.emailed });
    await reload();
  });
  const setStatus = (p: Person, status: 'active' | 'disabled') => act(async () => {
    await call(`/api/team/${p.id}`, 'PATCH', { status });
    notify(status === 'disabled' ? `${p.name} can no longer sign in.` : `${p.name} can sign in again.`);
    await reload();
  });
  const cancel = (p: Person) => act(async () => {
    await call(`/api/team/${p.id}`, 'DELETE');
    notify('Invitation cancelled.');
    await reload();
  });

  return (
    <div className="space-y-6">
      {me.legacy ? <SetupOwner onDone={() => { router.refresh(); }} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>People ({people.length})</CardTitle>
          {canInvite ? <Button size="sm" onClick={() => setInviting(true)}>Add a person</Button> : null}
        </CardHeader>
        <CardBody className="p-0">
          {people.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">{me.legacy ? 'Create your owner account above, then add your people here.' : 'No one here yet.'}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {people.map((p) => {
                const self = p.id === me.id;
                const manageable = !me.legacy && canManageUser(me, { role: p.role, departments: p.departments, isSelf: self }, { role: p.role, departments: p.departments });
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{p.name}</span>
                        {self ? <Badge>You</Badge> : null}
                        <Badge tone={statusTone[p.status]}>{p.status === 'invited' ? 'Invited' : p.status === 'active' ? 'Active' : 'Disabled'}</Badge>
                      </div>
                      <div className="truncate text-sm text-slate-500">{p.email}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        {roleName(p.role)} · {p.role === 'owner' || p.role === 'admin' ? 'All departments' : p.departments.map(departmentName).join(', ') || 'No departments'}
                        {p.lastLoginAt ? ` · last in ${new Date(p.lastLoginAt).toLocaleDateString()}` : ''}
                      </div>
                    </div>
                    {manageable ? (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>Edit</Button>
                        {p.status === 'invited' ? (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => newLink(p)}>New link</Button>
                            <Button size="sm" variant="ghost" onClick={() => cancel(p)}>Cancel invite</Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => newLink(p)}>Reset password</Button>
                            {p.status === 'active' ? <Button size="sm" variant="ghost" onClick={() => setStatus(p, 'disabled')}>Disable</Button> : <Button size="sm" variant="secondary" onClick={() => setStatus(p, 'active')}>Enable</Button>}
                          </>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Who can do what</CardTitle></CardHeader>
        <CardBody>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {ROLES.map((r) => (
              <div key={r.key}><dt className="font-medium text-slate-900">{r.name}</dt><dd className="text-slate-600">{r.blurb}</dd></div>
            ))}
          </dl>
        </CardBody>
      </Card>

      {inviting ? <PersonDialog key="new" me={me} onClose={() => setInviting(false)} onSaved={async (r) => {
        setInviting(false);
        if (r) setLink({ title: `Invitation for ${r.name}`, url: r.link, emailed: r.emailed });
        await reload();
      }} /> : null}
      {editing ? <PersonDialog key={editing.id} me={me} person={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); notify('Saved.'); await reload(); }} /> : null}
      {link ? <LinkDialog {...link} onClose={() => setLink(null)} /> : null}
    </div>
  );
}

function LinkDialog({ title, url, emailed, onClose }: { title: string; url: string; emailed: boolean; onClose: () => void }) {
  const { notify } = useToast();
  return (
    <Modal open onClose={onClose} title={title} description={emailed ? 'We also emailed this link. It works once.' : 'Send this link to them yourself. It works once and expires.'}
      footer={<Button onClick={onClose}>Done</Button>}>
      <Label htmlFor="link">Link</Label>
      <div className="flex gap-2">
        <Input id="link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <Button variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(url); notify('Link copied.'); } catch { notify('Select the link and copy it.', 'error'); } }}>Copy</Button>
      </div>
    </Modal>
  );
}

function PersonDialog({ me, person, onClose, onSaved }: {
  me: Me; person?: Person; onClose: () => void;
  onSaved: (r?: { name: string; link: string; emailed: boolean }) => void | Promise<void>;
}) {
  const [name, setName] = useState(person?.name ?? '');
  const [email, setEmail] = useState(person?.email ?? '');
  const [role, setRole] = useState<RoleKey>(person?.role ?? 'member');
  const [depts, setDepts] = useState<DepartmentKey[]>(person?.departments ?? (me.role === 'manager' ? me.departments : []));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wide = role === 'owner' || role === 'admin';
  const roles = ROLES.filter((r) => canManageUser(me, person ? { role: person.role, departments: person.departments, isSelf: false } : null, { role: r.key, departments: depts.length ? depts : me.departments }));
  const deptChoices = DEPARTMENTS.filter((d) => me.role === 'owner' || me.role === 'admin' || me.departments.includes(d.key));

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const departments = wide ? [] : depts;
      if (person) {
        await call(`/api/team/${person.id}`, 'PATCH', { name, role, departments });
        await onSaved();
      } else {
        const r = await call<{ link: string; emailed: boolean }>('/api/team', 'POST', { name, email, role, departments });
        await onSaved({ name, link: r.link, emailed: r.emailed });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={person ? `Edit ${person.name}` : 'Add a person'} description={person ? undefined : 'They get a link to choose their own password.'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>{person ? 'Save' : 'Create invitation'}</Button></>}>
      <div className="space-y-3">
        {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div><Label htmlFor="pn">Name</Label><Input id="pn" value={name} onChange={(e) => setName(e.target.value)} /></div>
        {!person ? <div><Label htmlFor="pe">Email</Label><Input id="pe" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div> : null}
        <div>
          <Label htmlFor="pr">Role</Label>
          <Select id="pr" value={role} onChange={(e) => setRole(e.target.value as RoleKey)}>
            {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </Select>
          <p className="mt-1 text-xs text-slate-500">{ROLES.find((r) => r.key === role)?.blurb}</p>
        </div>
        {wide ? (
          <p className="text-sm text-slate-600">Owners and admins can open every department.</p>
        ) : (
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-slate-700">Departments</legend>
            <div className="space-y-1.5">
              {deptChoices.map((d) => (
                <label key={d.key} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={depts.includes(d.key)} onChange={(e) => setDepts((cur) => e.target.checked ? [...cur, d.key] : cur.filter((k) => k !== d.key))} />
                  <span><span className="font-medium text-slate-900">{d.name}</span> <span className="text-slate-500">{d.blurb}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </Modal>
  );
}

function SetupOwner({ onDone }: { onDone: () => void }) {
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call('/api/auth/setup-owner', 'POST', { name, email, password });
      notify('Owner account created. From now on sign in with your email and password.');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      setBusy(false);
    }
  }
  return (
    <Card className="border-brand-200">
      <CardHeader><CardTitle>Step 1: create your own owner account</CardTitle></CardHeader>
      <CardBody>
        <p className="mb-4 text-sm text-slate-600">Right now everyone shares one passphrase. Create your personal owner account to start adding people. Once you do, the shared passphrase stops working.</p>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
          {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-3">{error}</p> : null}
          <div><Label htmlFor="on">Your name</Label><Input id="on" required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label htmlFor="oe">Email</Label><Input id="oe" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label htmlFor="op">Password (10+ characters)</Label><Input id="op" type="password" required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div className="sm:col-span-3"><Button type="submit" loading={busy}>Create owner account</Button></div>
        </form>
      </CardBody>
    </Card>
  );
}
