'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { BUSINESSES, OPEN_STAGES, followUpDue, type BusinessFinance, type Contact, type Deal } from '@/lib/crm/model';
import { formatCurrency } from '@/lib/format';
import { crmCall } from './api';

const NONE = 'none';

/**
 * The group view: every business side by side, from first lead to money collected. Click a row to look at just that
 * business everywhere in the CRM.
 */
export function BusinessBoard({
  contacts, deals, now, onPick,
}: {
  contacts: Contact[];
  deals: Deal[];
  now: number;
  onPick: (key: string) => void;
}) {
  const [fin, setFin] = useState<BusinessFinance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    crmCall<{ finance: BusinessFinance[] }>('/api/crm/businesses')
      .then((r) => { if (live) setFin(r.finance); })
      .catch((err) => { if (live) setError(err instanceof Error ? err.message : 'Could not load the invoice totals.'); });
    return () => { live = false; };
  }, []);

  const rows = useMemo(() => {
    const since = new Date(now - 90 * 86_400_000).toISOString();
    const keyOf = (b: string | null) => b ?? NONE;
    const list = [...BUSINESSES.map((b) => ({ key: b.key as string, name: b.name, color: b.color as string })), { key: NONE, name: 'Not tagged', color: '#94a3b8' }];
    return list.map((b) => {
      const cs = contacts.filter((c) => c.status !== 'archived' && keyOf(c.business) === b.key);
      const ds = deals.filter((d) => keyOf(d.business) === b.key);
      const withOpenDeal = new Set(ds.filter((d) => OPEN_STAGES.includes(d.stage) && d.contactId).map((d) => d.contactId));
      const leads = cs.filter((c) => c.status === 'lead' || c.status === 'qualified').length;
      const customers = cs.filter((c) => c.status === 'customer').length;
      const followUps = cs.filter((c) => {
        const days = c.followUpDays ?? (withOpenDeal.has(c.id) ? 7 : null);
        return days !== null && c.status !== 'customer' && followUpDue({ ...c, followUpDays: days }, now);
      }).length;
      const open = ds.filter((d) => OPEN_STAGES.includes(d.stage));
      const won = ds.filter((d) => d.stage === 'won' && d.closedAt && d.closedAt >= since);
      const lost = ds.filter((d) => d.stage === 'lost' && d.closedAt && d.closedAt >= since).length;
      const money = (fin ?? []).filter((f) => keyOf(f.business) === b.key);
      const usd = money.filter((f) => f.currency === 'USD');
      const sum = (k: 'billed' | 'paid' | 'overdue') => usd.reduce((s, f) => s + f[k], 0);
      return {
        ...b, people: cs.length, leads, customers, followUps,
        conversion: leads + customers > 0 ? Math.round((customers / (leads + customers)) * 100) : null,
        winRate: won.length + lost > 0 ? Math.round((won.length / (won.length + lost)) * 100) : null,
        openCount: open.length, openValue: open.reduce((s, d) => s + d.value, 0), wonValue: won.reduce((s, d) => s + d.value, 0),
        billed: sum('billed'), paid: sum('paid'), overdue: sum('overdue'), otherCurrency: money.some((f) => f.currency !== 'USD'),
      };
    }).filter((r) => r.key !== NONE || r.people > 0 || r.openCount > 0 || r.billed > 0);
  }, [contacts, deals, fin, now]);

  const total = (k: 'people' | 'leads' | 'customers' | 'followUps' | 'openValue' | 'wonValue' | 'billed' | 'paid' | 'overdue') => rows.reduce((s, r) => s + r[k], 0);

  return (
    <section aria-label="Businesses">
      <h3 className="mb-1 text-[15px] font-semibold text-slate-900">All businesses</h3>
      <p className="mb-2 text-xs text-slate-500">From first lead to money collected, for each business. Click a business to see only its clients, leads, deals and follow-ups. Won is the last 90 days; money is USD invoices.</p>
      <Card>
        {error ? <p className="p-4 text-sm text-red-600">{error}</p> : null}
        <Table>
          <Thead><Tr>
            <Th>Business</Th><Th className="text-right">Leads / customers</Th><Th className="text-right">Follow-ups due</Th>
            <Th className="text-right">Open pipeline</Th><Th className="text-right">Won (90d)</Th><Th className="text-right">Billed</Th><Th className="text-right">Overdue</Th>
          </Tr></Thead>
          <Tbody>
            {rows.map((r) => (
              <Tr key={r.key} className="cursor-pointer" onClick={() => onPick(r.key)}>
                <Td className="font-medium text-slate-900"><span className="inline-flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />{r.name}</span></Td>
                <Td className="text-right">{r.leads} / {r.customers}{r.conversion !== null ? <p className="text-[11px] font-normal text-slate-500">{r.conversion}% converted</p> : null}</Td>
                <Td className={`text-right ${r.followUps ? 'font-semibold text-amber-600' : ''}`}>{r.followUps}</Td>
                <Td className="text-right">{formatCurrency(r.openValue)}<p className="text-[11px] font-normal text-slate-500">{r.openCount} deal{r.openCount === 1 ? '' : 's'}</p></Td>
                <Td className="text-right">{formatCurrency(r.wonValue)}{r.winRate !== null ? <p className="text-[11px] font-normal text-slate-500">{r.winRate}% win rate</p> : null}</Td>
                <Td className="text-right">{fin === null ? '…' : formatCurrency(r.billed)}<p className="text-[11px] font-normal text-slate-500">{fin === null ? '' : `${formatCurrency(r.paid)} collected`}{r.otherCurrency ? ' · + other currency' : ''}</p></Td>
                <Td className={`text-right ${r.overdue ? 'font-semibold text-red-600' : ''}`}>{fin === null ? '…' : formatCurrency(r.overdue)}</Td>
              </Tr>
            ))}
            <Tr>
              <Td className="font-semibold text-slate-900">Whole group</Td>
              <Td className="text-right font-semibold">{total('leads')} / {total('customers')}</Td>
              <Td className="text-right font-semibold">{total('followUps')}</Td>
              <Td className="text-right font-semibold">{formatCurrency(total('openValue'))}</Td><Td className="text-right font-semibold">{formatCurrency(total('wonValue'))}</Td>
              <Td className="text-right font-semibold">{fin === null ? '…' : formatCurrency(total('billed'))}<p className="text-[11px] font-normal text-slate-500">{fin === null ? '' : `${formatCurrency(total('paid'))} collected`}</p></Td>
              <Td className="text-right font-semibold">{fin === null ? '…' : formatCurrency(total('overdue'))}</Td>
            </Tr>
          </Tbody>
        </Table>
      </Card>
    </section>
  );
}
