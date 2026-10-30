'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Input, Label, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { CONTACT_STATUSES, OPEN_STAGES, SOURCES, ago, leadScore, nextFollowUp, type Activity, type Contact, type Deal } from '@/lib/crm/model';
import { crmCall } from './api';
import { ActivityRow, Composer } from './ActivityParts';

const tone = (s: Contact['status']) => (s === 'customer' ? 'success' : s === 'qualified' ? 'brand' : s === 'archived' ? 'neutral' : 'warning');

export function ContactsPanel({
  contacts, deals, activities, actor, onSaved, onDeleted, onActivity, onToggleTask, onNewDeal, initialOpenId,
}: {
  initialOpenId?: string | null;
  contacts: Contact[];
  deals: Deal[];
  activities: Activity[];
  actor: string;
  onSaved: (c: Contact) => void;
  onDeleted: (id: string) => void;
  onActivity: (a: Activity) => void;
  onToggleTask: (a: Activity) => void;
  onNewDeal: (contactId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | Contact['status']>('all');
  const [editing, setEditing] = useState<Contact | null>(() => contacts.find((c) => c.id === initialOpenId) ?? null);
  const [creating, setCreating] = useState(false);

  const scored = useMemo(() => {
    return contacts.map((c) => {
      const acts = activities.filter((a) => a.contactId === c.id && a.kind !== 'created').length;
      const openValue = deals.filter((d) => d.contactId === c.id && OPEN_STAGES.includes(d.stage)).reduce((s, d) => s + d.value, 0);
      return { c, score: leadScore(c, acts, openValue), deals: deals.filter((d) => d.contactId === c.id).length };
    });
  }, [contacts, deals, activities]);

  const q = query.trim().toLowerCase();
  const shown = scored
    .filter(({ c }) => (status === 'all' ? c.status !== 'archived' : c.status === status))
    .filter(({ c }) => !q || [c.name, c.company, c.email, c.phone].some((v) => v?.toLowerCase().includes(q)))
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, company, email…" aria-label="Search contacts" />
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filter by status">
          <option value="all">Active contacts</option>
          {CONTACT_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </Select>
        <Button className="ml-auto" onClick={() => setCreating(true)}>+ New contact</Button>
      </div>
      <Card>
        {shown.length === 0 ? <p className="p-6 text-sm text-slate-500">{contacts.length === 0 ? 'No contacts yet. Add your first lead.' : 'No contacts match.'}</p> : (
          <Table>
            <Thead><Tr><Th>Name</Th><Th>Company</Th><Th>Status</Th><Th>Source</Th><Th className="text-right">Deals</Th><Th>Last contact</Th><Th>Lead score</Th></Tr></Thead>
            <Tbody>
              {shown.map(({ c, score, deals: n }) => (
                <Tr key={c.id} className="cursor-pointer" onClick={() => setEditing(c)}>
                  <Td className="font-medium text-slate-900">{c.name}<p className="text-xs font-normal text-slate-500">{c.email ?? c.phone ?? ''}</p></Td>
                  <Td>{c.company ?? '—'}</Td>
                  <Td><Badge tone={tone(c.status)}>{c.status}</Badge></Td>
                  <Td className="capitalize">{c.source}</Td>
                  <Td className="text-right">{n}</Td>
                  <Td className="text-xs text-slate-600">{c.doNotContact ? <Badge tone="danger">do not contact</Badge> : c.lastContactAt ? ago(c.lastContactAt) : '—'}</Td>
                  <Td>
                    <span className="flex items-center gap-2" title="Scored from the details on file, where the lead came from, how much has happened and the open deal value">
                      <span className="h-2 w-16 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full" style={{ width: `${score}%`, background: score >= 70 ? '#16a34a' : score >= 40 ? '#f59e0b' : '#94a3b8' }} /></span>
                      <span className="text-xs font-semibold text-slate-700">{score}</span>
                    </span>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
      <ContactDialog
        open={creating || editing !== null}
        onClose={() => { setCreating(false); setEditing(null); }}
        contact={editing}
        activities={activities}
        actor={actor}
        onSaved={onSaved}
        onDeleted={onDeleted}
        onActivity={onActivity}
        onToggleTask={onToggleTask}
        onNewDeal={(id) => { setEditing(null); onNewDeal(id); }}
      />
    </div>
  );
}

type ContactDialogProps = {
  open: boolean; onClose: () => void; contact: Contact | null; activities: Activity[]; actor: string;
  onSaved: (c: Contact) => void; onDeleted: (id: string) => void; onActivity: (a: Activity) => void; onToggleTask: (a: Activity) => void; onNewDeal: (id: string) => void;
};

/** Mounts a fresh form each time the dialog opens or a different contact is shown. */
function ContactDialog(props: ContactDialogProps) {
  if (!props.open) return null;
  return <ContactDialogInner key={props.contact?.id ?? 'new'} {...props} />;
}

function ContactDialogInner({
  open, onClose, contact, activities, actor, onSaved, onDeleted, onActivity, onToggleTask, onNewDeal,
}: ContactDialogProps) {
  const { notify } = useToast();
  const [f, setF] = useState({
    name: contact?.name ?? '', company: contact?.company ?? '', jobTitle: contact?.jobTitle ?? '', email: contact?.email ?? '', phone: contact?.phone ?? '',
    source: (contact?.source ?? 'other') as string, status: (contact?.status ?? 'lead') as string, owner: contact?.owner ?? actor, notes: contact?.notes ?? '',
    followUpDays: contact?.followUpDays ? String(contact.followUpDays) : '', doNotContact: contact?.doNotContact ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: Exclude<keyof typeof f, 'doNotContact'>) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));


  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...f, followUpDays: f.followUpDays ? Number(f.followUpDays) : null };
      const res = contact
        ? await crmCall<{ contact: Contact }>(`/api/crm/contacts/${contact.id}`, 'PATCH', body)
        : await crmCall<{ contact: Contact }>('/api/crm/contacts', 'POST', { ...body, actor });
      onSaved(res.contact);
      notify(contact ? 'Contact saved.' : 'Contact added.');
      if (!contact) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the contact.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!contact || !window.confirm(`Delete ${contact.name}? Their deals stay, without a contact.`)) return;
    try {
      await crmCall(`/api/crm/contacts/${contact.id}`, 'DELETE');
      onDeleted(contact.id);
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete the contact.', 'error');
    }
  }

  const history = contact ? activities.filter((a) => a.contactId === contact.id) : [];
  return (
    <Modal open={open} onClose={onClose} title={contact ? contact.name : 'New contact'} size="xl">
      <div className={contact ? 'grid grid-cols-1 gap-6 lg:grid-cols-5' : ''}>
        <form onSubmit={save} className={`space-y-3 ${contact ? 'lg:col-span-2' : ''}`}>
          <div><Label htmlFor="ct-name">Name</Label><Input id="ct-name" value={f.name} onChange={set('name')} required maxLength={120} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="ct-company">Company</Label><Input id="ct-company" value={f.company} onChange={set('company')} maxLength={120} /></div>
            <div><Label htmlFor="ct-title">Job title</Label><Input id="ct-title" value={f.jobTitle} onChange={set('jobTitle')} maxLength={120} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="ct-email">Email</Label><Input id="ct-email" type="email" value={f.email} onChange={set('email')} /></div>
            <div><Label htmlFor="ct-phone">Phone</Label><Input id="ct-phone" value={f.phone} onChange={set('phone')} maxLength={40} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label htmlFor="ct-source">Source</Label><Select id="ct-source" value={f.source} onChange={set('source')}>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
            <div><Label htmlFor="ct-status">Status</Label><Select id="ct-status" value={f.status} onChange={set('status')}>{CONTACT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
            <div><Label htmlFor="ct-owner">Owner</Label><Input id="ct-owner" value={f.owner} onChange={set('owner')} maxLength={60} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ct-follow">Follow up</Label>
              <Select id="ct-follow" value={f.followUpDays} onChange={set('followUpDays')}>
                <option value="">Only while a deal is open (weekly)</option>
                <option value="7">Every week</option>
                <option value="14">Every 2 weeks</option>
                <option value="30">Every month</option>
                <option value="90">Every 3 months</option>
              </Select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={f.doNotContact} onChange={(e) => setF((p) => ({ ...p, doNotContact: e.target.checked }))} />
                Do not contact
              </label>
            </div>
          </div>
          {contact ? (
            <p className="text-xs text-slate-500">
              Last in touch: {contact.lastContactAt ? ago(contact.lastContactAt) : 'never'}
              {nextFollowUp(contact) ? ` · next follow-up ${new Date(nextFollowUp(contact)!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
            </p>
          ) : null}
          <div><Label htmlFor="ct-notes">Notes</Label><Textarea id="ct-notes" rows={3} value={f.notes} onChange={set('notes')} maxLength={2000} /></div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex items-center justify-between pt-1">
            {contact ? <Button type="button" variant="ghost" onClick={remove}>Delete</Button> : <span />}
            <div className="flex gap-2">
              {contact ? <Button type="button" variant="secondary" onClick={() => onNewDeal(contact.id)}>+ Deal</Button> : null}
              <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{contact ? 'Close' : 'Cancel'}</Button>
              <Button type="submit" loading={busy}>{contact ? 'Save' : 'Add contact'}</Button>
            </div>
          </div>
        </form>
        {contact ? (
          <div className="lg:col-span-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Record activity <span className="font-normal text-slate-500">· as {actor}</span></h3>
            <Composer contactId={contact.id} contact={contact} actor={actor} onLogged={onActivity} />
            <h3 className="mb-1 mt-5 text-sm font-semibold text-slate-900">History</h3>
            {history.length === 0 ? <p className="text-sm text-slate-500">Nothing recorded yet.</p> : <ul className="divide-y divide-slate-100">{history.map((a) => <ActivityRow key={a.id} a={a} onToggleTask={onToggleTask} />)}</ul>}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
