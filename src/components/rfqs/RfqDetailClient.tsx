'use client';

import { CustomerNameSelect } from '@/components/documents/CustomerNameSelect';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input, Label, Select, Textarea, FieldGroup } from '@/components/ui/Field';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import { missingCertifications } from '@/lib/quoting/costing';
import type { RfqDetail } from '@/lib/quoting/service';
import type { Flag } from '@/lib/quoting/types';
import { call } from './api';
import { STATUS_LABEL, STATUS_TONE } from './RfqsPageClient';

interface PartDraft {
  partNumber: string;
  description: string;
  material: string;
  qty: string;
  weightLb: string;
  operations: string;
  finish: string;
  notes: string;
}

const draftOf = (rfq: RfqDetail): PartDraft[] =>
  rfq.parts.map((p) => ({
    partNumber: p.partNumber ?? '',
    description: p.description,
    material: p.material ?? '',
    qty: String(p.qty),
    weightLb: p.weightLb === null || p.weightLb === undefined ? '' : String(p.weightLb),
    operations: p.operations.join(', '),
    finish: p.finish ?? '',
    notes: p.notes ?? '',
  }));

const SEVERITY_TONE = { high: 'danger', medium: 'warning', low: 'neutral' } as const;
const SEVERITY_LABEL = { high: 'Must review', medium: 'Check', low: 'Note' } as const;
const CONFIDENCE_TONE = { high: 'success', medium: 'warning', low: 'danger' } as const;

const STEPS = ['RFQ received', 'Review package', 'Cost & quote', 'Estimator review', 'Approved'];

function stepIndex(status: RfqDetail['status']): number {
  if (status === 'estimator_review' || status === 'returned') return 3;
  if (status === 'declined') return 3;
  return 4; // approved, won, lost
}

export function RfqDetailClient({ initial, customers }: { initial: RfqDetail; customers: { id: string; name: string }[] }) {
  const { notify } = useToast();
  const [rfq, setRfq] = useState(initial);
  const [parts, setParts] = useState<PartDraft[]>(draftOf(initial));
  const [margin, setMargin] = useState(initial.targetMarginPct === null ? '' : String(initial.targetMarginPct));
  const [dueDate, setDueDate] = useState(initial.dueDate ?? '');
  const [certs, setCerts] = useState(initial.certifications.join(', '));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [ack, setAck] = useState(false);
  const [openPart, setOpenPart] = useState<number | null>(null);
  const [estimateCustomer, setEstimateCustomer] = useState(initial.customerId ?? '');

  const editable = rfq.status === 'estimator_review' || rfq.status === 'returned';
  const high = rfq.flags.filter((f) => f.severity === 'high');
  const certList = rfq.certifications;
  const missing = new Set(missingCertifications(certList, rfq.settings.certifications));
  const daysLeft = rfq.dueDate ? Math.round((Date.parse(`${rfq.dueDate}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000) : null;
  const materials = [...new Set(rfq.parts.map((p) => p.material).filter((m): m is string => !!m))];
  const operations = [...new Set(rfq.parts.flatMap((p) => p.operations))];
  const totalQty = rfq.parts.reduce((s, p) => s + p.qty, 0);

  function apply(next: RfqDetail) {
    setRfq(next);
    setParts(draftOf(next));
    setMargin(next.targetMarginPct === null ? '' : String(next.targetMarginPct));
    setDueDate(next.dueDate ?? '');
    setCerts(next.certifications.join(', '));
    setDirty(false);
  }

  function edit(i: number, patch: Partial<PartDraft>) {
    setParts((cur) => cur.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
    setDirty(true);
  }

  async function recalc() {
    setBusy('recalc');
    try {
      const body = {
        parts: parts.map((p) => ({
          partNumber: p.partNumber || undefined,
          description: p.description,
          material: p.material || undefined,
          qty: Number(p.qty),
          weightLb: p.weightLb === '' ? null : Number(p.weightLb),
          operations: p.operations,
          finish: p.finish || undefined,
          notes: p.notes || undefined,
        })),
        targetMarginPct: margin === '' ? null : Number(margin),
        dueDate: dueDate || null,
        certifications: certs.split(',').map((c) => c.trim()).filter(Boolean),
      };
      const res = await call<{ rfq: RfqDetail }>('PATCH', `/api/rfqs/${rfq.id}`, body);
      apply(res.rfq);
      notify('Recalculated with your changes.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not recalculate.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function act(action: string, extra: Record<string, unknown> = {}, success?: string) {
    setBusy(action);
    try {
      const res = await call<{ rfq: RfqDetail }>('POST', `/api/rfqs/${rfq.id}/action`, { action, note: note || undefined, ...extra });
      apply(res.rfq);
      setNote('');
      setAck(false);
      if (success) notify(success);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'That did not work.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function saveNotes() {
    setBusy('notes');
    try {
      const res = await call<{ rfq: RfqDetail }>('PATCH', `/api/rfqs/${rfq.id}`, { estimatorNotes: note });
      apply(res.rfq);
      setNote('');
      notify('Notes saved.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save notes.', 'error');
    } finally {
      setBusy(null);
    }
  }

  const step = stepIndex(rfq.status);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/rfqs" className="text-xs text-brand-700 hover:underline">
          ← All RFQs
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">
            {rfq.rfqNumber} · {rfq.customerName}
          </h1>
          <Badge tone={STATUS_TONE[rfq.status]}>{STATUS_LABEL[rfq.status]}</Badge>
        </div>
        {rfq.subject ? <p className="mt-1 text-sm text-slate-500">{rfq.subject}</p> : null}
      </div>

      <ol className="flex flex-wrap gap-2" aria-label="Quote progress">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded-lg border px-3 py-2 text-xs font-medium ${i < step ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : i === step ? 'border-gold-400 bg-gold-100 text-gold-800' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
            {i < step ? '✓ ' : ''}
            {s}
          </li>
        ))}
      </ol>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Incoming package</CardTitle>
              <CardDescription>
                {rfq.files.length} file{rfq.files.length === 1 ? '' : 's'} · via {rfq.source}
              </CardDescription>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {rfq.files.length === 0 ? <p className="text-sm text-slate-500">No files attached.</p> : null}
            <ul className="space-y-1.5">
              {rfq.files.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                  <a href={`/api/rfqs/${rfq.id}/files/${f.id}`} className="truncate text-brand-700 hover:underline" download>
                    {f.fileName}
                  </a>
                  <Badge tone={f.kind === 'drawing' || f.kind === 'model' ? 'brand' : 'neutral'}>{f.kind}</Badge>
                </li>
              ))}
            </ul>
            {rfq.rawText ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-600">Request text</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{rfq.rawText}</pre>
              </details>
            ) : null}
            {rfq.contactEmail ? <p className="text-xs text-slate-500">Contact: {rfq.contactEmail}</p> : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>RFQ summary</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Summary label="Part count" value={String(rfq.parts.length)} />
              <Summary label="Total pieces" value={totalQty.toLocaleString()} />
            </div>
            <Summary label="Material" value={materials.length ? materials.join(', ') : 'Not stated'} warn={!materials.length} />
            <Summary label="Operations" value={operations.length ? operations.join(', ') : 'Not stated'} warn={!operations.length} />
            <Summary
              label="Due date"
              value={rfq.dueDate ? `${formatDate(rfq.dueDate)}${daysLeft !== null ? ` (${daysLeft < 0 ? `${-daysLeft} days ago` : `in ${daysLeft} days`})` : ''}` : 'Not stated'}
              warn={!rfq.dueDate || (daysLeft !== null && daysLeft < rfq.settings.minLeadDays)}
            />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Certifications</p>
              {certList.length === 0 ? (
                <p className="mt-1 text-slate-600">None asked for</p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {certList.map((c) => (
                    <Badge key={c} tone={missing.has(c) ? 'danger' : 'success'}>
                      {c} {missing.has(c) ? '· not held' : '· held'}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Costing</CardTitle>
              <CardDescription>From your prices, routing rules and job history.</CardDescription>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Estimated cost</p>
              <p className="text-2xl font-semibold text-slate-900">{formatCurrency(rfq.costTotal)}</p>
              <p className="text-xs text-slate-500">Includes {rfq.settings.overheadPct}% overhead and {rfq.settings.scrapPct}% scrap on material.</p>
            </div>
            <div className="rounded-lg bg-slate-900 p-3 text-white">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-300">Quote price at {rfq.effectiveMarginPct}% margin</p>
              <p className="text-2xl font-semibold">{formatCurrency(rfq.priceTotal)}</p>
            </div>
            {editable ? (
              <div className="grid grid-cols-2 gap-3">
                <FieldGroup>
                  <Label htmlFor="margin">Target margin %</Label>
                  <Input id="margin" inputMode="decimal" value={margin} placeholder={String(rfq.settings.targetMarginPct)} onChange={(e) => (setMargin(e.target.value), setDirty(true))} />
                </FieldGroup>
                <FieldGroup>
                  <Label htmlFor="due">Due date</Label>
                  <Input id="due" type="date" value={dueDate} onChange={(e) => (setDueDate(e.target.value), setDirty(true))} />
                </FieldGroup>
                <div className="col-span-2">
                  <FieldGroup>
                    <Label htmlFor="certs">Certifications required</Label>
                    <Input id="certs" value={certs} placeholder="ISO 9001:2015, AS9100D" onChange={(e) => (setCerts(e.target.value), setDirty(true))} />
                  </FieldGroup>
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Review before this goes out</CardTitle>
            <CardDescription>
              {rfq.flags.length === 0 ? 'Nothing flagged.' : `${high.length} must-review, ${rfq.flags.filter((f) => f.severity === 'medium').length} to check, ${rfq.flags.filter((f) => f.severity === 'low').length} notes.`}
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          {rfq.flags.length === 0 ? (
            <p className="text-sm text-emerald-700">Every input was found and current.</p>
          ) : (
            <ul className="space-y-2">
              {rfq.flags.map((f: Flag, i) => (
                <li key={`${f.code}-${i}`} className="flex items-start gap-2 text-sm">
                  <Badge tone={SEVERITY_TONE[f.severity]} className="mt-0.5 shrink-0">
                    {SEVERITY_LABEL[f.severity]}
                  </Badge>
                  <span className="text-slate-700">{f.message}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <CardTitle>Parts and pricing</CardTitle>
            <CardDescription>{editable ? 'Edit anything the reading got wrong, then recalculate.' : 'Locked. Reopen the quote to change it.'}</CardDescription>
          </div>
          {editable ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => (setParts((cur) => [...cur, { partNumber: '', description: '', material: materials[0] ?? '', qty: '1', weightLb: '', operations: operations.join(', '), finish: '', notes: '' }]), setDirty(true))}
              >
                + Add part
              </Button>
              <Button onClick={recalc} loading={busy === 'recalc'} disabled={!dirty && !!parts.length}>
                Recalculate
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardBody className="p-0">
          {dirty ? <p className="border-b border-gold-200 bg-gold-100 px-4 py-2 text-sm text-gold-800">You have changes that are not priced yet. Recalculate to update the quote.</p> : null}
          <Table>
            <Thead>
              <Tr>
                <Th>#</Th>
                <Th>Part no.</Th>
                <Th>Description</Th>
                <Th>Material</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Weight lb</Th>
                <Th>Operations</Th>
                <Th className="text-right">Unit price</Th>
                <Th className="text-right">Extended</Th>
                <Th>Basis</Th>
              </Tr>
            </Thead>
            <Tbody>
              {parts.map((p, i) => {
                const costed = rfq.parts[i];
                const showCost = costed && !dirty;
                return (
                  <PartRows key={i} i={i} p={p} costed={showCost ? costed : undefined} editable={editable} open={openPart === i} onToggle={() => setOpenPart(openPart === i ? null : i)} edit={edit} onRemove={() => (setParts((cur) => cur.filter((_, idx) => idx !== i)), setDirty(true))} />
                );
              })}
              {parts.length === 0 ? (
                <Tr>
                  <Td colSpan={10} className="text-center text-sm text-slate-500">
                    No parts were read from this request. Add them with “+ Add part”.
                  </Td>
                </Tr>
              ) : null}
            </Tbody>
          </Table>
          {openPart !== null && !dirty && rfq.parts[openPart] ? (
            <div className="border-t border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-sm font-medium text-slate-900">
                How line {openPart + 1} ({rfq.parts[openPart].partNumber ?? rfq.parts[openPart].description}) was priced
              </p>
              <div className="grid gap-4 text-sm md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Where each number came from</p>
                  <ul className="list-disc space-y-1 pl-5 text-slate-700">
                    {rfq.parts[openPart].costing.basis.map((b, k) => (
                      <li key={k}>{b}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-slate-600">
                    Material {formatCurrency(rfq.parts[openPart].costing.materialCostPerPart)} + labor {formatCurrency(rfq.parts[openPart].costing.laborCostPerPart)} + overhead {formatCurrency(rfq.parts[openPart].costing.overheadCostPerPart)} = cost {formatCurrency(rfq.parts[openPart].costing.unitCost)} per part.
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Similar prior jobs</p>
                  {rfq.parts[openPart].costing.priorJobs.length === 0 ? (
                    <p className="text-slate-500">None on file.</p>
                  ) : (
                    <ul className="space-y-1 text-slate-700">
                      {rfq.parts[openPart].costing.priorJobs.map((j) => (
                        <li key={j.id}>
                          {j.partNumber ?? 'No part no.'} · {j.description} · qty {j.qty}
                          {j.unitPrice !== null ? ` · ${formatCurrency(j.unitPrice)} each` : ''}
                          {j.completedOn ? ` · ${formatDate(j.completedOn)}` : ''} ({Math.round(j.similarity * 100)}% match by {j.matchedBy === 'part-number' ? 'part number' : 'description'})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Estimator review</CardTitle>
            <CardDescription>Approving locks the price. Nothing is sent to the customer from here; approved quotes become a draft estimate you send from Estimates.</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          {rfq.estimatorNotes ? <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{rfq.estimatorNotes}</pre> : null}
          <FieldGroup>
            <Label htmlFor="note">Note (saved with the quote; required when returning)</Label>
            <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </FieldGroup>

          {rfq.status === 'estimator_review' ? (
            <div className="space-y-3">
              {high.length ? (
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  <span>I have reviewed the {high.length} must-review flag{high.length === 1 ? '' : 's'} above and accept this price.</span>
                </label>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => act('approve', { acknowledgedFlags: ack }, 'Quote approved.')} loading={busy === 'approve'} disabled={dirty || (high.length > 0 && !ack)}>
                  Approve quote
                </Button>
                <Button variant="secondary" onClick={() => act('return', {}, 'Returned for changes.')} loading={busy === 'return'} disabled={!note.trim()}>
                  Return for changes
                </Button>
                <Button variant="secondary" onClick={saveNotes} loading={busy === 'notes'} disabled={!note.trim()}>
                  Save note
                </Button>
                <Button variant="danger" onClick={() => act('decline', {}, 'RFQ declined.')} loading={busy === 'decline'}>
                  Decline to quote
                </Button>
              </div>
              {dirty ? <p className="text-xs text-gold-800">Recalculate first so the quote you approve matches what is on screen.</p> : null}
            </div>
          ) : null}

          {rfq.status === 'returned' || rfq.status === 'declined' ? (
            <Button variant="secondary" onClick={() => act('reopen', {}, 'Reopened for review.')} loading={busy === 'reopen'}>
              Reopen for estimator review
            </Button>
          ) : null}

          {rfq.status === 'approved' || rfq.status === 'won' || rfq.status === 'lost' ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Approved {formatDate(rfq.approvedAt)} at {formatCurrency(rfq.priceTotal)}.</p>
              {rfq.estimateId ? (
                <p className="text-sm">
                  A draft estimate was created from this quote.{' '}
                  <Link href="/dashboard/estimates" className="text-brand-700 hover:underline">
                    Open Estimates
                  </Link>
                </p>
              ) : rfq.status === 'approved' ? (
                <div className="flex flex-wrap items-end gap-2">
                  {!rfq.customerId ? (
                    <FieldGroup>
                      <Label htmlFor="est-customer">Customer for the estimate</Label>
                      <CustomerNameSelect id="est-customer" customers={customers} value={estimateCustomer} onChange={setEstimateCustomer} emptyLabel="Choose a customer" />
                    </FieldGroup>
                  ) : null}
                  <Button onClick={() => act('to-estimate', { customerId: estimateCustomer || undefined }, 'Draft estimate created.')} loading={busy === 'to-estimate'} disabled={!rfq.customerId && !estimateCustomer}>
                    Create draft estimate
                  </Button>
                </div>
              ) : null}
              {rfq.status === 'approved' ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => act('won', {}, 'Marked won.')} loading={busy === 'won'}>
                    Mark won
                  </Button>
                  <Button variant="secondary" onClick={() => act('lost', {}, 'Marked lost.')} loading={busy === 'lost'}>
                    Mark lost
                  </Button>
                  {!rfq.estimateId ? (
                    <Button variant="ghost" onClick={() => act('reopen', {}, 'Reopened for review.')} loading={busy === 'reopen'}>
                      Reopen
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

function Summary({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 ${warn ? 'text-gold-800' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function PartRows({
  i,
  p,
  costed,
  editable,
  open,
  onToggle,
  edit,
  onRemove,
}: {
  i: number;
  p: PartDraft;
  costed: RfqDetail['parts'][number] | undefined;
  editable: boolean;
  open: boolean;
  onToggle: () => void;
  edit: (i: number, patch: Partial<PartDraft>) => void;
  onRemove: () => void;
}) {
  const cell = 'w-full min-w-[5rem] rounded border border-slate-200 px-2 py-1 text-sm';
  return (
    <>
      <Tr className={open ? 'bg-slate-50' : undefined}>
        <Td>{i + 1}</Td>
        <Td>{editable ? <input className={cell} value={p.partNumber} onChange={(e) => edit(i, { partNumber: e.target.value })} aria-label={`Part ${i + 1} number`} /> : p.partNumber || '—'}</Td>
        <Td>{editable ? <input className={`${cell} min-w-[10rem]`} value={p.description} onChange={(e) => edit(i, { description: e.target.value })} aria-label={`Part ${i + 1} description`} /> : p.description}</Td>
        <Td>{editable ? <input className={`${cell} min-w-[8rem]`} value={p.material} onChange={(e) => edit(i, { material: e.target.value })} aria-label={`Part ${i + 1} material`} /> : p.material || '—'}</Td>
        <Td className="text-right">{editable ? <input className={`${cell} w-20 text-right`} inputMode="numeric" value={p.qty} onChange={(e) => edit(i, { qty: e.target.value })} aria-label={`Part ${i + 1} quantity`} /> : p.qty}</Td>
        <Td className="text-right">{editable ? <input className={`${cell} w-24 text-right`} inputMode="decimal" value={p.weightLb} onChange={(e) => edit(i, { weightLb: e.target.value })} aria-label={`Part ${i + 1} weight`} /> : p.weightLb || '—'}</Td>
        <Td>{editable ? <input className={`${cell} min-w-[10rem]`} value={p.operations} onChange={(e) => edit(i, { operations: e.target.value })} aria-label={`Part ${i + 1} operations`} /> : p.operations || '—'}</Td>
        <Td className="text-right">{costed ? formatCurrency(costed.costing.unitPrice) : '—'}</Td>
        <Td className="text-right">{costed ? formatCurrency(costed.costing.unitPrice * costed.qty) : '—'}</Td>
        <Td>
          <div className="flex items-center gap-2">
            {costed ? <Badge tone={CONFIDENCE_TONE[costed.costing.confidence]}>{costed.costing.confidence}</Badge> : null}
            {costed ? (
              <button type="button" onClick={onToggle} className="text-xs text-brand-700 hover:underline">
                {open ? 'Hide' : 'How priced'}
              </button>
            ) : null}
            {editable ? (
              <button type="button" onClick={onRemove} className="text-xs text-red-600 hover:underline" aria-label={`Remove part ${i + 1}`}>
                Remove
              </button>
            ) : null}
          </div>
        </Td>
      </Tr>
    </>
  );
}
