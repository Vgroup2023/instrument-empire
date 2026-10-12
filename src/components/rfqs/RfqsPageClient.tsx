'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Label, Select, Textarea, FieldGroup } from '@/components/ui/Field';
import { StatCard } from '@/components/ui/StatCard';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { LoadMoreBar } from '@/components/ui/LoadMoreBar';
import { PAGE_SIZE } from '@/lib/paging';
import { formatCurrency, formatDate } from '@/lib/format';
import type { RfqSummary } from '@/lib/quoting/service';
import { call, readFileBase64 } from './api';

export const STATUS_LABEL: Record<RfqSummary['status'], string> = {
  estimator_review: 'Estimator review',
  approved: 'Approved',
  returned: 'Returned',
  declined: 'Declined',
  won: 'Won',
  lost: 'Lost',
};
export const STATUS_TONE: Record<RfqSummary['status'], 'neutral' | 'success' | 'warning' | 'danger' | 'brand'> = {
  estimator_review: 'warning',
  approved: 'success',
  returned: 'danger',
  declined: 'neutral',
  won: 'brand',
  lost: 'neutral',
};

const SAMPLE_REQUEST = `Subject: RFQ 1023 - machined aluminum housings
Material: 6061-T6 aluminum
Operations: milling, drilling, tapping, finishing
Due date: ${new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10)}
Certifications: ISO 9001:2015, AS9100D

1023-001 Flange bracket housing, qty 12, 1.8 lb
1023-002 Cover plate, qty 40, 0.9 lb
1023-003 Mounting block, qty 25, 3.2 lb
1023-004 Cover plate with gasket groove, qty 25, 0.95 lb`;

export function RfqsPageClient({
  initialRfqs,
  initialTotal,
  customers,
  rulesReady,
}: {
  initialRfqs: RfqSummary[];
  initialTotal: number;
  customers: { id: string; name: string }[];
  rulesReady: boolean;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [rfqs, setRfqs] = useState(initialRfqs);
  const [total, setTotal] = useState(initialTotal);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [form, setForm] = useState({ customerId: '', customerName: '', contactEmail: '', subject: '', dueDate: '', rawText: '' });
  const [files, setFiles] = useState<File[]>([]);

  const waiting = rfqs.filter((r) => r.status === 'estimator_review');
  const flagged = waiting.reduce((n, r) => n + r.highFlags, 0);
  const approvedValue = rfqs.filter((r) => r.status === 'approved').reduce((s, r) => s + r.priceTotal, 0);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const data = await call<{ rfqs: RfqSummary[]; total: number }>('GET', `/api/rfqs?limit=${PAGE_SIZE}&offset=${rfqs.length}`);
      setRfqs((cur) => [...cur, ...data.rfqs.filter((r) => !cur.some((c) => c.id === r.id))]);
      setTotal(data.total);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not load more.', 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  async function seed() {
    setSeeding(true);
    try {
      await call('POST', '/api/quoting/seed');
      notify('Sample prices, routing rules and prior jobs loaded.');
      router.refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not load sample data.', 'error');
    } finally {
      setSeeding(false);
    }
  }

  async function submit() {
    setSaving(true);
    try {
      const attached = await Promise.all(files.map(async (f) => ({ fileName: f.name, contentType: f.type || 'application/octet-stream', contentBase64: await readFileBase64(f) })));
      const body: Record<string, unknown> = {
        customerName: form.customerName || undefined,
        customerId: form.customerId || undefined,
        contactEmail: form.contactEmail || undefined,
        subject: form.subject || undefined,
        dueDate: form.dueDate || undefined,
        rawText: form.rawText || undefined,
        files: attached.length ? attached : undefined,
      };
      const res = await call<{ id: string }>('POST', '/api/rfqs', body);
      notify('RFQ read and costed. Review it before anything goes out.');
      router.push(`/dashboard/rfqs/${res.id}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not create the RFQ.', 'error');
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="RFQs to quotes"
        description="Incoming requests are read, costed with your pricing and routing rules, checked for stale assumptions, and held for estimator approval."
        actions={
          <>
            <Link href="/dashboard/quoting-rules">
              <Button variant="secondary">Quoting rules</Button>
            </Link>
            <Button onClick={() => setOpen(true)}>+ New RFQ</Button>
          </>
        }
      />

      {!rulesReady ? (
        <Card>
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">Set up your pricing rules first</p>
              <p className="text-sm text-slate-500">Quotes are only as good as the material prices, routing rules and job history behind them. Add yours under Quoting rules, or load an example set to try the workflow.</p>
            </div>
            <Button variant="secondary" onClick={seed} loading={seeding}>
              Load sample shop data
            </Button>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Awaiting estimator" value={String(waiting.length)} hint="Nothing goes out until approved" />
        <StatCard label="High-priority flags" value={String(flagged)} hint="Across quotes waiting for review" />
        <StatCard label="Approved, not yet won or lost" value={formatCurrency(approvedValue)} />
      </div>

      <Card>
        <CardBody className="p-0">
          {rfqs.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No RFQs yet" description="Paste a request or attach the customer's package to see it read, costed and flagged." />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>RFQ</Th>
                  <Th>Customer</Th>
                  <Th>Received</Th>
                  <Th>Due</Th>
                  <Th className="text-right">Parts</Th>
                  <Th className="text-right">Quote</Th>
                  <Th>Flags</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rfqs.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <Link href={`/dashboard/rfqs/${r.id}`} className="font-medium text-brand-700 hover:underline">
                        {r.rfqNumber}
                      </Link>
                      {r.subject ? <div className="max-w-[16rem] truncate text-xs text-slate-500">{r.subject}</div> : null}
                    </Td>
                    <Td>{r.customerName}</Td>
                    <Td>{formatDate(r.receivedAt)}</Td>
                    <Td>{formatDate(r.dueDate)}</Td>
                    <Td className="text-right">{r.partCount}</Td>
                    <Td className="text-right">{formatCurrency(r.priceTotal)}</Td>
                    <Td>
                      {r.highFlags ? <Badge tone="danger">{r.highFlags} high</Badge> : r.flagCount ? <Badge tone="warning">{r.flagCount} to check</Badge> : <Badge tone="success">Clear</Badge>}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
          <LoadMoreBar shown={rfqs.length} total={total} loading={loadingMore} onLoadMore={loadMore} noun="RFQs" />
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => (saving ? undefined : setOpen(false))}
        title="New RFQ"
        description="Paste the request and attach drawings, models and specs. It is read and costed right away, then waits for your review."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              Read and cost
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldGroup>
              <Label htmlFor="rfq-customer">Customer on file</Label>
              <Select id="rfq-customer" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                <option value="">Not on file yet</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="rfq-name">Customer name</Label>
              <Input id="rfq-name" value={form.customerName} disabled={!!form.customerId} placeholder={form.customerId ? 'From the customer record' : 'Required if not on file'} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="rfq-email">Contact email</Label>
              <Input id="rfq-email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="rfq-due">Due date (if not in the text)</Label>
              <Input id="rfq-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </FieldGroup>
          </div>
          <FieldGroup>
            <Label htmlFor="rfq-subject">Subject</Label>
            <Input id="rfq-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </FieldGroup>
          <FieldGroup>
            <div className="flex items-center justify-between">
              <Label htmlFor="rfq-text">Request text</Label>
              <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => setForm({ ...form, subject: form.subject || 'RFQ 1023 - machined aluminum housings', rawText: SAMPLE_REQUEST })}>
                Use a sample request
              </button>
            </div>
            <Textarea id="rfq-text" rows={9} value={form.rawText} onChange={(e) => setForm({ ...form, rawText: e.target.value })} placeholder={'Paste the email or spec. Lines like "1023-001 Flange bracket, qty 12, 1.8 lb" become parts.'} />
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="rfq-files">Drawings, models and specs (up to 5 MB in total)</Label>
            <input id="rfq-files" type="file" multiple className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            {files.length ? <p className="text-xs text-slate-500">{files.map((f) => f.name).join(', ')}</p> : null}
          </FieldGroup>
        </div>
      </Modal>
    </div>
  );
}
