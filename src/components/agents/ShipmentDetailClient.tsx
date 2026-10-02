'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input, Label, Select, FieldGroup } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/format';
import { ALL_DOCS } from '@/lib/agents/docupilot';
import { DEPARTMENTS, EVENT_TYPES } from '@/lib/agents/types';

interface Props {
  shipment: {
    id: string;
    reference: string;
    direction: string;
    status: string;
    customerName: string | null;
    carrier: string | null;
    containerNo: string | null;
    lastFreeDate: string | null;
    loadingDate: string | null;
    arrivalDate: string | null;
    receivedDocs: string[];
    invoicedAt: string | null;
    deliveredAt: string | null;
  };
  events: { id: string; type: string; location: string | null; note: string | null; source: string; occurredAt: string }[];
  receipt: {
    binLocation: string | null;
    expectedPieces: number | null;
    receivedPieces: number | null;
    damagedPieces: number;
    receivedAt: string | null;
    releasedAt: string | null;
    freeDays: number;
    dailyRate: number | null;
    storageBilledAt: string | null;
  } | null;
  findings: { id: string; severity: string; title: string; detail: string; department: string }[];
}

const TONE = { critical: 'danger', high: 'warning', medium: 'brand', low: 'neutral' } as const;
const typeLabel = (t: string) => EVENT_TYPES.find((e) => e.id === t)?.label ?? t;
const numOrNull = (v: string) => (v === '' ? null : Number(v));

export function ShipmentDetailClient({ shipment: s, events, receipt, findings }: Props) {
  const router = useRouter();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [ev, setEv] = useState({ type: 'departed', location: '', note: '' });
  const [lg, setLg] = useState({ carrier: s.carrier ?? '', containerNo: s.containerNo ?? '', lastFreeDate: s.lastFreeDate ?? '' });
  const [wh, setWh] = useState({
    binLocation: receipt?.binLocation ?? '',
    expectedPieces: receipt?.expectedPieces?.toString() ?? '',
    receivedPieces: receipt?.receivedPieces?.toString() ?? '',
    damagedPieces: receipt?.damagedPieces.toString() ?? '0',
    freeDays: receipt?.freeDays.toString() ?? '5',
    dailyRate: receipt?.dailyRate?.toString() ?? '',
  });

  async function send(url: string, method: string, body: object, ok: string) {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
      notify(ok);
      router.refresh();
      return true;
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Something went wrong.', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const whBody = () => ({
    binLocation: wh.binLocation,
    expectedPieces: numOrNull(wh.expectedPieces),
    receivedPieces: numOrNull(wh.receivedPieces),
    damagedPieces: Number(wh.damagedPieces || 0),
    freeDays: Number(wh.freeDays || 5),
    dailyRate: numOrNull(wh.dailyRate),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={s.reference}
        description={`${s.direction} · ${s.customerName ?? 'no client'} · loads ${formatDate(s.loadingDate)} · arrives ${formatDate(s.arrivalDate)}`}
        actions={
          <Link href="/dashboard/shipments" className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            All shipments
          </Link>
        }
      />

      {findings.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Open issues on this file</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-slate-100">
            {findings.map((f) => (
              <li key={f.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONE[f.severity as keyof typeof TONE] ?? 'neutral'}>{f.severity}</Badge>
                  <span className="text-xs text-slate-500">{DEPARTMENTS.find((d) => d.id === f.department)?.name}</span>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-900">{f.title}</p>
                <p className="text-xs text-slate-500">{f.detail}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Logistics</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldGroup>
                <Label htmlFor="lg-carrier">Carrier</Label>
                <Input id="lg-carrier" value={lg.carrier} onChange={(e) => setLg({ ...lg, carrier: e.target.value })} />
              </FieldGroup>
              <FieldGroup>
                <Label htmlFor="lg-cont">Container / AWB number</Label>
                <Input id="lg-cont" value={lg.containerNo} onChange={(e) => setLg({ ...lg, containerNo: e.target.value })} />
              </FieldGroup>
              <FieldGroup>
                <Label htmlFor="lg-lfd">Last free day</Label>
                <Input id="lg-lfd" type="date" value={lg.lastFreeDate} onChange={(e) => setLg({ ...lg, lastFreeDate: e.target.value })} />
              </FieldGroup>
            </div>
            <Button size="sm" loading={busy} onClick={() => send(`/api/shipments/${s.id}`, 'PATCH', lg, 'Logistics saved.')}>
              Save logistics
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {ALL_DOCS.map((d) => {
                const have = s.receivedDocs.includes(d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => send(`/api/shipments/${s.id}`, 'PATCH', { doc: d.key, received: !have }, have ? 'Marked not received.' : 'Marked received.')}
                    className={`rounded-full px-3 py-1 text-xs ${have ? 'bg-emerald-100 text-emerald-700' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {have ? '✓ ' : ''}
                    {d.label}
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Warehouse</CardTitle>
          <div className="flex gap-2">
            {receipt?.releasedAt ? <Badge tone="neutral">Released {formatDate(receipt.releasedAt)}</Badge> : receipt?.receivedAt ? <Badge tone="brand">In warehouse since {formatDate(receipt.receivedAt)}</Badge> : <Badge>Not received</Badge>}
            {receipt?.storageBilledAt ? <Badge tone="success">Storage billed</Badge> : null}
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <FieldGroup>
              <Label htmlFor="wh-bin">Bin / location</Label>
              <Input id="wh-bin" value={wh.binLocation} onChange={(e) => setWh({ ...wh, binLocation: e.target.value })} />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="wh-exp">Expected pieces</Label>
              <Input id="wh-exp" type="number" min="0" value={wh.expectedPieces} onChange={(e) => setWh({ ...wh, expectedPieces: e.target.value })} />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="wh-rec">Received pieces</Label>
              <Input id="wh-rec" type="number" min="0" value={wh.receivedPieces} onChange={(e) => setWh({ ...wh, receivedPieces: e.target.value })} />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="wh-dmg">Damaged pieces</Label>
              <Input id="wh-dmg" type="number" min="0" value={wh.damagedPieces} onChange={(e) => setWh({ ...wh, damagedPieces: e.target.value })} />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="wh-free">Free storage days</Label>
              <Input id="wh-free" type="number" min="0" value={wh.freeDays} onChange={(e) => setWh({ ...wh, freeDays: e.target.value })} />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="wh-rate">Storage rate per day (USD)</Label>
              <Input id="wh-rate" type="number" min="0" step="0.01" value={wh.dailyRate} onChange={(e) => setWh({ ...wh, dailyRate: e.target.value })} />
            </FieldGroup>
          </div>
          <div className="flex flex-wrap gap-2">
            {!receipt?.receivedAt ? (
              <Button size="sm" loading={busy} onClick={() => send(`/api/shipments/${s.id}/warehouse`, 'PUT', { ...whBody(), received: true }, 'Goods received.')}>
                Receive goods
              </Button>
            ) : (
              <Button size="sm" variant="secondary" loading={busy} onClick={() => send(`/api/shipments/${s.id}/warehouse`, 'PUT', whBody(), 'Warehouse record saved.')}>
                Save changes
              </Button>
            )}
            {receipt?.receivedAt && !receipt.releasedAt ? (
              <Button size="sm" variant="secondary" loading={busy} onClick={() => send(`/api/shipments/${s.id}/warehouse`, 'PUT', { ...whBody(), released: true }, 'Goods released.')}>
                Release goods
              </Button>
            ) : null}
            {receipt?.receivedAt && !receipt.storageBilledAt ? (
              <Button size="sm" variant="ghost" loading={busy} onClick={() => send(`/api/shipments/${s.id}/warehouse`, 'PUT', { storageBilled: true }, 'Marked storage billed.')}>
                Mark storage billed
              </Button>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
            <FieldGroup>
              <Label htmlFor="ev-type">Event</Label>
              <Select id="ev-type" value={ev.type} onChange={(e) => setEv({ ...ev, type: e.target.value })}>
                {EVENT_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="ev-loc">Location</Label>
              <Input id="ev-loc" value={ev.location} onChange={(e) => setEv({ ...ev, location: e.target.value })} />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="ev-note">Note</Label>
              <Input id="ev-note" value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} />
            </FieldGroup>
            <Button
              size="sm"
              loading={busy}
              onClick={async () => {
                if (await send(`/api/shipments/${s.id}/events`, 'POST', ev, 'Event added.')) setEv({ ...ev, location: '', note: '' });
              }}
            >
              Add event
            </Button>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-slate-500">No events yet. Carrier and warehouse systems can post them automatically through the integration feed.</p>
          ) : (
            <ol className="space-y-2 border-l border-slate-200 pl-4">
              {events.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="font-medium text-slate-900">{typeLabel(e.type)}</span>
                  <span className="text-slate-500">
                    {' '}
                    · {formatDate(e.occurredAt)}
                    {e.location ? ` · ${e.location}` : ''} · {e.source}
                  </span>
                  {e.note ? <div className="text-xs text-slate-500">{e.note}</div> : null}
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
