'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Field';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { ago, type Contact, type Deal, type ReorderItem } from '@/lib/crm/model';
import { formatCurrency } from '@/lib/format';
import { Avatar } from './Avatar';
import { BusinessBadge } from './BusinessBadge';

const CYCLES = [30, 45, 60, 90, 120, 180, 365];

/** The reorder cycle picker: how often this customer usually orders again. */
function Cycle({ value, onChange, label }: { value: number | null; onChange: (days: number | null) => void; label: string }) {
  const options = value && !CYCLES.includes(value) ? [...CYCLES, value].sort((a, b) => a - b) : CYCLES;
  return (
    <Select className="w-auto" aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">No schedule</option>
      {options.map((d) => <option key={d} value={d}>Every {d} days</option>)}
    </Select>
  );
}

function Group({ title, hint, color, items, onStart, onOpenContact, onSetDays, now }: {
  title: string; hint: string; color: string; items: ReorderItem[]; now: number;
  onStart: (r: ReorderItem) => void; onOpenContact: (id: string) => void; onSetDays: (id: string, days: number | null) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title}>
      <div className="mb-1.5 flex items-baseline gap-2" style={{ borderLeft: `4px solid ${color}`, paddingLeft: 8 }}>
        <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
        <span className="text-xs text-slate-500">{items.length} · {hint}</span>
      </div>
      <Card>
        <Table>
          <Thead><Tr><Th>Customer</Th><Th>Owner</Th><Th>Cycle</Th><Th>Last order</Th><Th className="text-right">Last value</Th><Th>Next order</Th><Th className="text-right"> </Th></Tr></Thead>
          <Tbody>
            {items.map((r) => (
              <Tr key={r.contactId}>
                <Td className="font-medium text-slate-900">
                  <button type="button" className="text-left hover:underline" onClick={() => onOpenContact(r.contactId)}>{r.company ?? r.name}</button> <BusinessBadge business={r.business} />
                  {r.company ? <p className="text-xs font-normal text-slate-500">{r.name}</p> : null}
                </Td>
                <Td><span className="inline-flex items-center gap-1.5 text-xs text-slate-600"><Avatar name={r.owner} />{r.owner ?? 'Unassigned'}</span></Td>
                <Td><Cycle value={r.everyDays} label={`Reorder cycle for ${r.company ?? r.name}`} onChange={(d) => onSetDays(r.contactId, d)} /></Td>
                <Td className="text-xs text-slate-600">{ago(r.lastOrderAt, now)}<p className="text-[11px] text-slate-400">Day {r.daysSince}</p></Td>
                <Td className="text-right">{formatCurrency(r.lastValue, r.currency)}</Td>
                <Td className="text-xs">
                  {r.inPipeline ? <Badge tone="brand">In the pipeline</Badge> : r.daysUntil < 0 ? <span className="font-semibold text-red-600">{-r.daysUntil}d overdue</span> : r.daysUntil === 0 ? <span className="font-semibold text-amber-600">Due today</span> : <span className="text-slate-600">in {r.daysUntil}d</span>}
                </Td>
                <Td className="text-right">{r.inPipeline ? null : <Button size="sm" variant={r.status === 'later' ? 'secondary' : 'primary'} onClick={() => onStart(r)}>Start reorder</Button>}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Card>
    </section>
  );
}

/**
 * Reorder schedules: how often each customer orders again, and who is due. Starting a reorder opens a deal for it
 * (valued at their last order) in the pipeline. Customers with a won deal but no schedule are listed at the end.
 */
export function ReordersPanel({
  items, contacts, deals, now, onStart, onOpenContact, onSetDays,
}: {
  items: ReorderItem[];
  contacts: Contact[];
  deals: Deal[];
  now: number;
  onStart: (r: ReorderItem) => void;
  onOpenContact: (id: string) => void;
  onSetDays: (contactId: string, days: number | null) => void;
}) {
  const unscheduled = useMemo(() => {
    const wonBy = new Map<string, Deal>();
    for (const d of deals) if (d.stage === 'won' && d.contactId && (!wonBy.get(d.contactId) || (d.closedAt ?? '') > (wonBy.get(d.contactId)!.closedAt ?? ''))) wonBy.set(d.contactId, d);
    return contacts.filter((c) => !c.reorderDays && c.status !== 'archived' && wonBy.has(c.id)).map((c) => ({ c, last: wonBy.get(c.id)! }));
  }, [contacts, deals]);
  const due = items.filter((r) => r.status === 'due' && !r.inPipeline);
  const soon = items.filter((r) => r.status === 'soon' && !r.inPipeline);
  const later = items.filter((r) => r.status === 'later' && !r.inPipeline);
  const working = items.filter((r) => r.inPipeline);
  const g = { onStart, onOpenContact, onSetDays, now };

  return (
    <div className="space-y-5">
      {items.length === 0 && unscheduled.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-base font-semibold text-slate-900">No reorder schedules yet.</p>
          <p className="mt-1 text-sm text-slate-600">Win a deal, then set how often that customer reorders. They will show up here when their next order is near.</p>
        </Card>
      ) : null}
      <Group title="Due now" hint="Their next order is today or overdue." color="#dc2626" items={due} {...g} />
      <Group title="Coming up" hint="Due within the next two weeks." color="#f59e0b" items={soon} {...g} />
      <Group title="Later" hint="Further off." color="#64748b" items={later} {...g} />
      <Group title="Already in the pipeline" hint="A deal is open since their last order." color="#3f5fe0" items={working} {...g} />
      {unscheduled.length ? (
        <section aria-label="No schedule yet">
          <div className="mb-1.5 flex items-baseline gap-2" style={{ borderLeft: '4px solid #94a3b8', paddingLeft: 8 }}>
            <h3 className="text-[15px] font-semibold text-slate-900">No schedule yet</h3>
            <span className="text-xs text-slate-500">{unscheduled.length} · Customers you have won a deal with. Pick how often they reorder.</span>
          </div>
          <Card>
            <Table>
              <Thead><Tr><Th>Customer</Th><Th>Last order</Th><Th className="text-right">Last value</Th><Th>Reorders</Th></Tr></Thead>
              <Tbody>
                {unscheduled.map(({ c, last }) => (
                  <Tr key={c.id}>
                    <Td className="font-medium text-slate-900"><button type="button" className="text-left hover:underline" onClick={() => onOpenContact(c.id)}>{c.company ?? c.name}</button> <BusinessBadge business={last.business ?? c.business} /></Td>
                    <Td className="text-xs text-slate-600">{ago(last.closedAt ?? last.updatedAt, now)}</Td>
                    <Td className="text-right">{formatCurrency(last.value, last.currency)}</Td>
                    <Td><Cycle value={null} label={`Reorder cycle for ${c.company ?? c.name}`} onChange={(d) => onSetDays(c.id, d)} /></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
