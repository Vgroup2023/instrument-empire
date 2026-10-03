'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Input, Label, Select, FieldGroup } from '@/components/ui/Field';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import { REQUIRED_DOCS } from '@/lib/agents/docupilot';
import type { ShipmentRow } from '@/lib/agents/queries';

interface LineDraft {
  description: string;
  htsCode: string;
  value: string;
  eccn: string;
}

const emptyLine = (): LineDraft => ({ description: '', htsCode: '', value: '', eccn: '' });

function Step({ done, label, onMark }: { done: boolean; label: string; onMark: () => void }) {
  return done ? (
    <Badge tone="success">{label} ✓</Badge>
  ) : (
    <button type="button" onClick={onMark} className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">
      Mark {label}
    </button>
  );
}

export function ShipmentsPageClient({ shipments, customers }: { shipments: ShipmentRow[]; customers: { id: string; name: string }[] }) {
  const router = useRouter();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    reference: '',
    direction: 'import',
    customerId: '',
    originCountry: '',
    destinationCountry: '',
    shipper: '',
    consignee: '',
    loadingDate: '',
    arrivalDate: '',
    declaredValue: '',
  });
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function patch(id: string, body: object) {
    const res = await fetch(`/api/shipments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      notify(data.error ?? 'Could not update the shipment.', 'error');
      return;
    }
    router.refresh();
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          declaredValue: form.declaredValue ? Number(form.declaredValue) : undefined,
          lines: lines.map((l) => ({
            description: l.description,
            htsCode: l.htsCode,
            value: l.value ? Number(l.value) : undefined,
            eccn: l.eccn,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not save the shipment.');
      notify('Shipment added.');
      setOpen(false);
      setLines([emptyLine()]);
      router.refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Something went wrong.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shipments"
        description="Every file the agents watch. Mark filings and documents as they happen."
        actions={<Button onClick={() => setOpen(true)}>New shipment</Button>}
      />

      <Card>
        {shipments.length === 0 ? (
          <EmptyState title="No shipments yet" description="Add a file to start getting ISF, entry, screening and document checks." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>File</Th>
                <Th>Dates</Th>
                <Th>Value</Th>
                <Th>Filings</Th>
                <Th>Documents</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {shipments.map((s) => (
                <Tr key={s.id}>
                  <Td>
                    <Link prefetch={false} href={`/dashboard/shipments/${s.id}`} className="font-medium text-brand-700 hover:underline">
                      {s.reference}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {s.direction} · {s.customerName ?? 'no client'} · {s.lineCount} line{s.lineCount === 1 ? '' : 's'}
                    </div>
                  </Td>
                  <Td>
                    <div className="text-xs">Loads {formatDate(s.loadingDate)}</div>
                    <div className="text-xs">Arrives {formatDate(s.arrivalDate)}</div>
                  </Td>
                  <Td>{s.declaredValue === null ? '—' : formatCurrency(s.declaredValue)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {s.direction === 'import' ? (
                        <>
                          <Step done={!!s.isfFiledAt} label="ISF" onMark={() => patch(s.id, { milestone: 'isf' })} />
                          <Step done={!!s.entryFiledAt} label="entry" onMark={() => patch(s.id, { milestone: 'entry' })} />
                        </>
                      ) : (
                        <Step done={!!s.eeiFiledAt} label="EEI" onMark={() => patch(s.id, { milestone: 'eei' })} />
                      )}
                      <Step done={!!s.invoicedAt} label="invoiced" onMark={() => patch(s.id, { milestone: 'invoiced' })} />
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {REQUIRED_DOCS[s.direction].map((d) => {
                        const have = s.receivedDocs.includes(d.key);
                        return (
                          <button
                            key={d.key}
                            type="button"
                            title={have ? 'Click to mark as not received' : 'Click to mark as received'}
                            onClick={() => patch(s.id, { doc: d.key, received: !have })}
                            className={`rounded-full px-2 py-0.5 text-xs ${have ? 'bg-emerald-100 text-emerald-700' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                          >
                            {d.label.split(' /')[0]}
                          </button>
                        );
                      })}
                    </div>
                  </Td>
                  <Td>
                    {s.status === 'open' ? (
                      <Button size="sm" variant="secondary" onClick={() => patch(s.id, { status: 'completed' })}>
                        Complete
                      </Button>
                    ) : (
                      <Badge tone={s.status === 'completed' ? 'success' : 'neutral'}>{s.status}</Badge>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New shipment"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} disabled={!form.reference.trim()}>
              Save shipment
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldGroup>
            <Label htmlFor="sh-ref">File reference</Label>
            <Input id="sh-ref" value={form.reference} onChange={set('reference')} />
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="sh-dir">Direction</Label>
            <Select id="sh-dir" value={form.direction} onChange={set('direction')}>
              <option value="import">Import</option>
              <option value="export">Export</option>
            </Select>
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="sh-cust">Client</Label>
            <Select id="sh-cust" value={form.customerId} onChange={set('customerId')}>
              <option value="">None</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="sh-val">Declared value (USD)</Label>
            <Input id="sh-val" type="number" min="0" step="0.01" value={form.declaredValue} onChange={set('declaredValue')} />
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="sh-origin">Origin country (2 letters)</Label>
            <Input id="sh-origin" maxLength={2} value={form.originCountry} onChange={set('originCountry')} />
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="sh-dest">Destination country (2 letters)</Label>
            <Input id="sh-dest" maxLength={2} value={form.destinationCountry} onChange={set('destinationCountry')} />
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="sh-shipper">Shipper</Label>
            <Input id="sh-shipper" value={form.shipper} onChange={set('shipper')} />
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="sh-cons">Consignee</Label>
            <Input id="sh-cons" value={form.consignee} onChange={set('consignee')} />
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="sh-load">Loading date</Label>
            <Input id="sh-load" type="date" value={form.loadingDate} onChange={set('loadingDate')} />
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="sh-arr">Arrival date</Label>
            <Input id="sh-arr" type="date" value={form.arrivalDate} onChange={set('arrivalDate')} />
          </FieldGroup>
        </div>
        <div className="mt-4 space-y-2">
          <div className="text-xs font-medium text-slate-700">Lines</div>
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr]">
              <Input aria-label="Description" placeholder="Description" value={l.description} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              <Input aria-label="HTS code" placeholder="HTS code" value={l.htsCode} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, htsCode: e.target.value } : x)))} />
              <Input aria-label="Line value" placeholder="Value" type="number" min="0" step="0.01" value={l.value} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
              <Input aria-label="ECCN" placeholder="ECCN (exports)" value={l.eccn} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, eccn: e.target.value } : x)))} />
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            Add line
          </Button>
        </div>
      </Modal>
    </div>
  );
}
