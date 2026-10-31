'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { ago, type Activity, type Contact, type Deal } from '@/lib/crm/model';
import { formatCurrency } from '@/lib/format';

type Phase = 'pending' | 'progress' | 'active';
const PHASES: { key: Phase; title: string; hint: string; color: string }[] = [
  { key: 'pending', title: 'Pending onboarding', hint: 'Won, but no onboarding task yet. Add one so nothing slips.', color: '#f59e0b' },
  { key: 'progress', title: 'Onboarding in progress', hint: 'Has open tasks.', color: '#3f5fe0' },
  { key: 'active', title: 'Active customers', hint: 'Every task done.', color: '#16a34a' },
];

/** Step 4, post-sales: what happens after a deal is won, in the order a customer moves through it. */
export function PostSalesPanel({
  deals, contacts, activities, onOpenDeal,
}: {
  deals: Deal[];
  contacts: Contact[];
  activities: Activity[];
  onOpenDeal: (id: string) => void;
}) {
  const rows = useMemo(() => deals.filter((d) => d.stage === 'won').map((d) => {
    const tasks = activities.filter((a) => a.dealId === d.id && a.kind === 'task');
    const open = tasks.filter((t) => !t.doneAt);
    const phase: Phase = tasks.length === 0 ? 'pending' : open.length > 0 ? 'progress' : 'active';
    const contact = contacts.find((c) => c.id === d.contactId) ?? null;
    return { d, contact, tasks: tasks.length, open: open.length, phase };
  }).sort((a, b) => ((a.d.closedAt ?? a.d.updatedAt) < (b.d.closedAt ?? b.d.updatedAt) ? 1 : -1)), [deals, contacts, activities]);

  const wonValue = rows.reduce((s, r) => s + r.d.value, 0);
  const openTasks = rows.reduce((s, r) => s + r.open, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs font-medium text-slate-500">Customers won</p><p className="mt-1.5 text-[26px] font-bold leading-none text-[#0f2059]">{rows.length}</p></Card>
        <Card className="p-4"><p className="text-xs font-medium text-slate-500">Value won</p><p className="mt-1.5 text-[26px] font-bold leading-none text-[#0f2059]">{formatCurrency(wonValue)}</p></Card>
        <Card className="p-4"><p className="text-xs font-medium text-slate-500">Open onboarding tasks</p><p className="mt-1.5 text-[26px] font-bold leading-none text-[#0f2059]">{openTasks}</p></Card>
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-[220px] flex-1">
          <h3 className="text-sm font-semibold text-slate-900">Billing and collections</h3>
          <p className="text-xs text-slate-600">Winning a deal drafts its invoice and sends Finance a task. Review, send and track payment in Invoices.</p>
        </div>
        <Link prefetch={false} href="/dashboard/invoices"><Button variant="secondary">Open invoices</Button></Link>
        <Link prefetch={false} href="/dashboard/inbox"><Button variant="secondary">Team inbox</Button></Link>
      </Card>

      {PHASES.map((p) => {
        const list = rows.filter((r) => r.phase === p.key);
        return (
          <section key={p.key} aria-label={p.title}>
            <div className="mb-1.5 flex items-baseline gap-2" style={{ borderLeft: `4px solid ${p.color}`, paddingLeft: 8 }}>
              <h3 className="text-[15px] font-semibold text-slate-900">{p.title}</h3>
              <span className="text-xs text-slate-500">{list.length} · {p.hint}</span>
            </div>
            <Card>
              {list.length === 0 ? <p className="p-5 text-sm text-slate-500">Nothing here.</p> : (
                <Table>
                  <Thead><Tr><Th>Deal</Th><Th>Customer</Th><Th className="text-right">Value</Th><Th>Won</Th><Th>Owner</Th><Th>Tasks</Th></Tr></Thead>
                  <Tbody>
                    {list.map(({ d, contact, tasks, open }) => (
                      <Tr key={d.id} className="cursor-pointer" onClick={() => onOpenDeal(d.id)}>
                        <Td className="font-medium text-slate-900">{d.title}</Td>
                        <Td>{contact ? `${contact.name}${contact.company ? ` · ${contact.company}` : ''}` : '—'}</Td>
                        <Td className="text-right">{formatCurrency(d.value, d.currency)}</Td>
                        <Td className="text-xs text-slate-600">{d.closedAt ? ago(d.closedAt) : '—'}</Td>
                        <Td className="text-xs text-slate-600">{d.owner ?? '—'}</Td>
                        <Td>{tasks === 0 ? <Badge tone="warning">none yet</Badge> : <Badge tone={open ? 'brand' : 'success'}>{tasks - open}/{tasks} done</Badge>}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </Card>
          </section>
        );
      })}
    </div>
  );
}
