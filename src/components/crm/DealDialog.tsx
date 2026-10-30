'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { SOURCES, STAGES, stageInfo, type Activity, type Contact, type Deal, type StageKey } from '@/lib/crm/model';
import { crmCall } from './api';
import { ActivityRow, Composer } from './ActivityParts';

/** Create a deal, or open one to edit it, see its history and record calls, emails, meetings, notes and tasks on it. */
type DealDialogProps = {
  open: boolean;
  onClose: () => void;
  deal: Deal | null;
  startStage: StageKey;
  initialContactId?: string;
  contacts: Contact[];
  activities: Activity[];
  actor: string;
  onSaved: (d: Deal) => void;
  onDeleted: (id: string) => void;
  onActivity: (a: Activity) => void;
  onToggleTask: (a: Activity) => void;
};

/** Mounts a fresh form each time the dialog opens or a different deal is shown, so the fields start from that deal. */
export function DealDialog(props: DealDialogProps) {
  if (!props.open) return null;
  return <DealDialogInner key={props.deal?.id ?? `new-${props.startStage}-${props.initialContactId ?? ''}`} {...props} />;
}

function DealDialogInner({
  open, onClose, deal, startStage, initialContactId, contacts, activities, actor, onSaved, onDeleted, onActivity, onToggleTask,
}: DealDialogProps) {
  const { notify } = useToast();
  const [title, setTitle] = useState(deal?.title ?? '');
  const [value, setValue] = useState(deal ? String(deal.value) : '');
  const [stage, setStage] = useState<StageKey>(deal?.stage ?? startStage);
  const [contactId, setContactId] = useState(deal?.contactId ?? initialContactId ?? '');
  const [owner, setOwner] = useState(deal?.owner ?? actor);
  const [expectedClose, setExpectedClose] = useState(deal?.expectedClose ?? '');
  const [source, setSource] = useState<string>(deal?.source ?? 'other');
  const [notes, setNotes] = useState(deal?.notes ?? '');
  const [lostReason, setLostReason] = useState(deal?.lostReason ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        title, value: value === '' ? 0 : Number(value), contactId: contactId || null, owner, source, notes,
        expectedClose: expectedClose || null, actor, stage, lostReason: stage === 'lost' ? lostReason : undefined,
      };
      const res = deal
        ? await crmCall<{ deal: Deal }>(`/api/crm/deals/${deal.id}`, 'PATCH', body)
        : await crmCall<{ deal: Deal }>('/api/crm/deals', 'POST', body);
      onSaved(res.deal);
      notify(deal ? 'Deal saved.' : 'Deal added.');
      if (!deal) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the deal.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deal || !window.confirm(`Delete "${deal.title}" and its history?`)) return;
    try {
      await crmCall(`/api/crm/deals/${deal.id}`, 'DELETE');
      onDeleted(deal.id);
      onClose();
      notify('Deal deleted.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete the deal.', 'error');
    }
  }

  const history = deal ? activities.filter((a) => a.dealId === deal.id) : [];
  return (
    <Modal open={open} onClose={onClose} title={deal ? deal.title : 'New deal'} size="xl">
      <div className={deal ? 'grid grid-cols-1 gap-6 lg:grid-cols-5' : ''}>
        <form onSubmit={save} className={`space-y-3 ${deal ? 'lg:col-span-2' : ''}`}>
          <div><Label htmlFor="deal-title">Deal name</Label><Input id="deal-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} placeholder="e.g. Annual support contract" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="deal-value">Value ($)</Label><Input id="deal-value" type="number" min={0} step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" /></div>
            <div>
              <Label htmlFor="deal-stage">Stage</Label>
              <Select id="deal-stage" value={stage} onChange={(e) => setStage(e.target.value as StageKey)}>
                {STAGES.map((s) => <option key={s.key} value={s.key} disabled={!deal && (s.key === 'won' || s.key === 'lost')}>{s.label}</option>)}
              </Select>
            </div>
          </div>
          {stage === 'lost' ? <div><Label htmlFor="deal-lost">Why was it lost?</Label><Input id="deal-lost" value={lostReason} onChange={(e) => setLostReason(e.target.value)} maxLength={300} /></div> : null}
          <div>
            <Label htmlFor="deal-contact">Contact</Label>
            <Select id="deal-contact" value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">No contact yet</option>
              {contacts.filter((c) => c.status !== 'archived' || c.id === contactId).map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="deal-owner">Owner</Label><Input id="deal-owner" value={owner} onChange={(e) => setOwner(e.target.value)} maxLength={60} /></div>
            <div><Label htmlFor="deal-close">Expected close</Label><Input id="deal-close" type="date" value={expectedClose} onChange={(e) => setExpectedClose(e.target.value)} /></div>
          </div>
          <div><Label htmlFor="deal-source">Source</Label><Select id="deal-source" value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</Select></div>
          <div><Label htmlFor="deal-notes">Notes</Label><Textarea id="deal-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></div>
          {deal?.stage === 'won' ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Won, and on your books as a customer.{' '}
              <Link prefetch={false} href="/dashboard/invoices" className="font-semibold underline">Create an invoice</Link>
            </p>
          ) : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex items-center justify-between pt-1">
            {deal ? <Button type="button" variant="ghost" onClick={remove}>Delete</Button> : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{deal ? 'Close' : 'Cancel'}</Button>
              <Button type="submit" loading={busy}>{deal ? 'Save changes' : 'Add deal'}</Button>
            </div>
          </div>
        </form>

        {deal ? (
          <div className="lg:col-span-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Record activity <span className="font-normal text-slate-500">· as {actor}</span></h3>
            <Composer dealId={deal.id} contactId={deal.contactId ?? undefined} contact={contacts.find((c) => c.id === deal.contactId) ?? null} actor={actor} onLogged={onActivity} />
            <h3 className="mb-1 mt-5 text-sm font-semibold text-slate-900">History <span className="font-normal text-slate-500">· {stageInfo(deal.stage).label}</span></h3>
            {history.length === 0 ? <p className="text-sm text-slate-500">Nothing recorded yet.</p> : (
              <ul className="divide-y divide-slate-100">{history.map((a) => <ActivityRow key={a.id} a={a} onToggleTask={onToggleTask} />)}</ul>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
