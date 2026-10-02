'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Input, Label, Select, Textarea, FieldGroup } from '@/components/ui/Field';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import { DESK_AGENTS } from '@/lib/agents/types';
import type { DeskOverview } from '@/lib/desk/queries';

const STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'brand'> = {
  received: 'neutral',
  parsing: 'neutral',
  needs_review: 'warning',
  confirmed: 'brand',
  on_hold: 'danger',
  processing: 'brand',
  ready_to_ship: 'brand',
  shipped: 'success',
  delivered: 'success',
  cancelled: 'neutral',
};
const PIPELINE = ['needs_review', 'on_hold', 'confirmed', 'processing', 'ready_to_ship', 'shipped', 'delivered'];
const label = (s: string) => s.replace(/_/g, ' ');
const STALE_HOURS = 26;

function ago(iso: string | null, nowIso: string): string {
  if (!iso) return 'never run';
  const mins = Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export function OrderDeskClient({ data, generatedAt }: { data: DeskOverview; generatedAt: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [order, setOrder] = useState({ email: '', name: '', rawText: '' });
  const [msg, setMsg] = useState({ from: '', subject: '', body: '' });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [track, setTrack] = useState<Record<string, { carrier: string; trackingNo: string }>>({});

  async function call(key: string, url: string, body: object, ok: string): Promise<boolean> {
    setBusy(key);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error ?? 'Something went wrong.');
      notify(typeof out.emailed === 'string' ? `${ok} ${out.emailed}` : ok);
      router.refresh();
      return true;
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Something went wrong.', 'error');
      return false;
    } finally {
      setBusy(null);
    }
  }

  const waiting = data.messages.filter((m) => m.status === 'awaiting_approval' || m.status === 'escalated');
  const handledByAgent = data.messages.filter((m) => m.status === 'auto_replied').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Order desk"
        description="Four agents take an order from the inbox to the carrier and answer customers along the way. They stop and ask a person only when something needs judgement."
        actions={
          <>
            <Button variant="secondary" onClick={() => setMsgOpen(true)}>
              Add customer message
            </Button>
            <Button onClick={() => setOrderOpen(true)}>Add order</Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {DESK_AGENTS.map((a) => {
          const last = data.lastRun[a.id] ?? null;
          const fresh = last !== null && new Date(generatedAt).getTime() - new Date(last).getTime() < STALE_HOURS * 3_600_000;
          return (
            <div key={a.id} className="rounded-xl2 border border-slate-200 bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">{a.name}</span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className={`h-2.5 w-2.5 animate-pulse rounded-full ${fresh ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  {fresh ? 'Online' : 'Stale'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{a.summary}</p>
              <p className="mt-2 text-xs text-slate-400">Last run {ago(last, generatedAt)}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {PIPELINE.map((s) => (
          <div key={s} className="rounded-lg border border-slate-200 bg-surface px-3 py-2 text-center shadow-card">
            <div className="text-lg font-semibold text-slate-900">{data.counts[s] ?? 0}</div>
            <div className="text-xs capitalize text-slate-500">{label(s)}</div>
          </div>
        ))}
        <div className="rounded-lg border border-slate-200 bg-surface px-3 py-2 text-center shadow-card">
          <div className="text-lg font-semibold text-slate-900">{handledByAgent}</div>
          <div className="text-xs text-slate-500">replies sent by agent</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Customer messages waiting for you ({waiting.length})</CardTitle>
            <CardDescription>The agent drafted each reply from the order record. Edit it if you like, then send.</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {waiting.length === 0 ? (
            <EmptyState title="No messages waiting" description="Messages the agent answers itself don't show up here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {waiting.map((m) => (
                <li key={m.id} className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={m.status === 'escalated' ? 'danger' : 'warning'}>{m.status === 'escalated' ? 'escalated' : 'needs approval'}</Badge>
                    <span className="text-xs text-slate-500">
                      {m.fromEmail} · {m.intent ? label(m.intent) : 'unread'} · {formatDate(m.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-900">{m.subject ?? '(no subject)'}</p>
                  <p className="whitespace-pre-wrap text-sm text-slate-600">{m.body.slice(0, 500)}</p>
                  {m.escalationReason ? <p className="text-xs text-amber-700">Why it stopped: {m.escalationReason}</p> : null}
                  <Textarea
                    aria-label={`Reply to ${m.fromEmail}`}
                    rows={5}
                    value={drafts[m.id] ?? m.replyDraft ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" loading={busy === `send-${m.id}`} onClick={() => call(`send-${m.id}`, `/api/desk/messages/${m.id}`, { action: 'send', reply: drafts[m.id] ?? m.replyDraft ?? '' }, 'Reply sent.')}>
                      Send reply
                    </Button>
                    <Button size="sm" variant="ghost" loading={busy === `close-${m.id}`} onClick={() => call(`close-${m.id}`, `/api/desk/messages/${m.id}`, { action: 'close' }, 'Closed without a reply.')}>
                      Close without replying
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
        </CardHeader>
        {data.orders.length === 0 ? (
          <EmptyState title="No orders yet" description="Add one here, or point an email-to-webhook service or web form at the integration endpoint." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Order</Th>
                <Th>Items</Th>
                <Th>Total</Th>
                <Th>Status</Th>
                <Th>Next step</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.orders.map((o) => (
                <Tr key={o.id}>
                  <Td>
                    <div className="font-medium text-slate-900">{o.orderNumber}</div>
                    <div className="text-xs text-slate-500">
                      {o.customerName ?? o.customerEmail ?? 'unknown'} · {o.channel}
                    </div>
                  </Td>
                  <Td className="max-w-xs whitespace-normal text-xs">{o.lines.join(', ') || '—'}</Td>
                  <Td>{o.total === null ? '—' : formatCurrency(o.total)}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{label(o.status)}</Badge>
                    {o.holdReason && o.status !== 'cancelled' ? <div className="mt-1 max-w-xs whitespace-normal text-xs text-amber-700">{o.holdReason}</div> : null}
                  </Td>
                  <Td>
                    {o.status === 'needs_review' ? (
                      <div className="flex gap-2">
                        <Button size="sm" loading={busy === `ap-${o.id}`} onClick={() => call(`ap-${o.id}`, `/api/desk/orders/${o.id}`, { action: 'approve' }, 'Order approved.')}>
                          Approve
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => call(`cx-${o.id}`, `/api/desk/orders/${o.id}`, { action: 'cancel' }, 'Order cancelled.')}>
                          Cancel
                        </Button>
                      </div>
                    ) : o.status === 'ready_to_ship' || o.status === 'processing' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          aria-label={`Carrier for ${o.orderNumber}`}
                          placeholder="Carrier"
                          className="w-24"
                          value={track[o.id]?.carrier ?? ''}
                          onChange={(e) => setTrack((t) => ({ ...t, [o.id]: { carrier: e.target.value, trackingNo: t[o.id]?.trackingNo ?? '' } }))}
                        />
                        <Input
                          aria-label={`Tracking number for ${o.orderNumber}`}
                          placeholder="Tracking no."
                          className="w-32"
                          value={track[o.id]?.trackingNo ?? ''}
                          onChange={(e) => setTrack((t) => ({ ...t, [o.id]: { carrier: t[o.id]?.carrier ?? '', trackingNo: e.target.value } }))}
                        />
                        <Button size="sm" loading={busy === `sh-${o.id}`} onClick={() => call(`sh-${o.id}`, `/api/desk/orders/${o.id}`, { action: 'ship', ...(track[o.id] ?? {}) }, 'Marked shipped.')}>
                          Mark shipped
                        </Button>
                        {o.shipByDate ? <span className="text-xs text-slate-500">ship by {formatDate(o.shipByDate)}</span> : null}
                      </div>
                    ) : o.status === 'shipped' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">
                          {o.carrier} {o.trackingNo}
                        </span>
                        <Button size="sm" variant="secondary" onClick={() => call(`dv-${o.id}`, `/api/desk/orders/${o.id}`, { action: 'deliver' }, 'Marked delivered.')}>
                          Mark delivered
                        </Button>
                      </div>
                    ) : o.status === 'on_hold' || o.status === 'confirmed' ? (
                      <Button size="sm" variant="ghost" onClick={() => call(`cx-${o.id}`, `/api/desk/orders/${o.id}`, { action: 'cancel' }, 'Order cancelled.')}>
                        Cancel
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>What the agents did</CardTitle>
            <CardDescription>Every automatic step, newest first.</CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          {data.events.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {data.events.map((e) => (
                <li key={e.id} className="text-slate-600">
                  <span className="font-medium text-slate-900">{label(e.action)}</span>
                  {e.orderNumber ? ` · ${e.orderNumber}` : ''} · {e.agent} · {ago(e.createdAt, generatedAt)}
                  {e.detail ? <span className="text-slate-500"> — {e.detail}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        title="Add an order"
        description="Paste the customer's email or order text. The Order Intake agent reads it, checks it and confirms it."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOrderOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={busy === 'new-order'}
              disabled={!order.rawText.trim()}
              onClick={async () => {
                if (await call('new-order', '/api/desk/intake', { kind: 'order', ...order }, 'Order received and processed.')) {
                  setOrderOpen(false);
                  setOrder({ email: '', name: '', rawText: '' });
                }
              }}
            >
              Submit order
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldGroup>
              <Label htmlFor="o-email">Customer email</Label>
              <Input id="o-email" type="email" value={order.email} onChange={(e) => setOrder({ ...order, email: e.target.value })} />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="o-name">Customer name</Label>
              <Input id="o-name" value={order.name} onChange={(e) => setOrder({ ...order, name: e.target.value })} />
            </FieldGroup>
          </div>
          <FieldGroup>
            <Label htmlFor="o-text">Order text</Label>
            <Textarea id="o-text" rows={8} placeholder={'2 x Blue widget\nSteel bracket x 10\n\nShip to:\nJane Buyer\n123 Main St\nSpringfield, IL 62704'} value={order.rawText} onChange={(e) => setOrder({ ...order, rawText: e.target.value })} />
          </FieldGroup>
        </div>
      </Modal>

      <Modal
        open={msgOpen}
        onClose={() => setMsgOpen(false)}
        title="Add a customer message"
        description="The Customer Service agent answers it from the order record, or drafts a reply for you."
        footer={
          <>
            <Button variant="secondary" onClick={() => setMsgOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={busy === 'new-msg'}
              disabled={!msg.from.trim() || !msg.body.trim()}
              onClick={async () => {
                if (await call('new-msg', '/api/desk/intake', { kind: 'message', ...msg }, 'Message handled.')) {
                  setMsgOpen(false);
                  setMsg({ from: '', subject: '', body: '' });
                }
              }}
            >
              Submit message
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FieldGroup>
            <Label htmlFor="m-from">From (email)</Label>
            <Input id="m-from" type="email" value={msg.from} onChange={(e) => setMsg({ ...msg, from: e.target.value })} />
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="m-subj">Subject</Label>
            <Input id="m-subj" value={msg.subject} onChange={(e) => setMsg({ ...msg, subject: e.target.value })} />
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="m-body">Message</Label>
            <Textarea id="m-body" rows={6} value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} />
          </FieldGroup>
        </div>
      </Modal>
    </div>
  );
}
