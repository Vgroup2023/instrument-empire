'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import type { Activity, CrmMetrics, Report } from '@/lib/crm/model';
import { formatCurrency } from '@/lib/format';
import { ReportsPanel } from './ReportsPanel';

/** Step 5, sales operations: how each person and the team are doing, then the daily and weekly reports. */
export function SalesOpsPanel({
  m, activities, reports, onReport, now,
}: {
  m: CrmMetrics;
  activities: Activity[];
  reports: Report[];
  onReport: (r: Report) => void;
  now: number;
}) {
  const people = useMemo(() => {
    const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
    const by = new Map<string, { touches: number; overdue: number }>();
    const row = (n: string) => { let r = by.get(n); if (!r) by.set(n, (r = { touches: 0, overdue: 0 })); return r; };
    for (const a of activities) {
      if (a.kind === 'task') { if (!a.doneAt && a.dueAt && Date.parse(a.dueAt) < now) row(a.actor).overdue += 1; continue; }
      if (['call', 'email', 'sms', 'meeting'].includes(a.kind) && a.createdAt >= weekAgo && a.direction !== 'in') row(a.actor).touches += 1;
    }
    const names = new Set([...m.owners.map((o) => o.owner), ...by.keys()]);
    return [...names].map((n) => {
      const o = m.owners.find((x) => x.owner === n);
      return { name: n, open: o?.open ?? 0, openValue: o?.openValue ?? 0, won: o?.won ?? 0, wonValue: o?.wonValue ?? 0, touches: by.get(n)?.touches ?? 0, overdue: by.get(n)?.overdue ?? 0 };
    }).sort((a, b) => b.wonValue + b.openValue - (a.wonValue + a.openValue));
  }, [m.owners, activities, now]);

  return (
    <div className="space-y-6">
      <section aria-label="Team performance">
        <h3 className="mb-1 text-[15px] font-semibold text-slate-900">Team performance</h3>
        <p className="mb-2 text-xs text-slate-500">Pipeline and wins are by deal owner (wins over the last 90 days). Outreach is calls, emails, texts and meetings sent or held this week, by who recorded them.</p>
        <Card>
          {people.length === 0 ? <p className="p-5 text-sm text-slate-500">Add deals and record activity to see the team here.</p> : (
            <Table>
              <Thead><Tr><Th>Person</Th><Th className="text-right">Open deals</Th><Th className="text-right">Open value</Th><Th className="text-right">Won</Th><Th className="text-right">Won value</Th><Th className="text-right">Outreach this week</Th><Th className="text-right">Overdue tasks</Th></Tr></Thead>
              <Tbody>
                {people.map((p) => (
                  <Tr key={p.name}>
                    <Td className="font-medium text-slate-900">{p.name}</Td>
                    <Td className="text-right">{p.open}</Td>
                    <Td className="text-right">{formatCurrency(p.openValue)}</Td>
                    <Td className="text-right">{p.won}</Td>
                    <Td className="text-right">{formatCurrency(p.wonValue)}</Td>
                    <Td className="text-right">{p.touches}</Td>
                    <Td className={`text-right ${p.overdue ? 'font-semibold text-red-600' : ''}`}>{p.overdue}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Card>
      </section>
      <section aria-label="Reports">
        <h3 className="mb-2 text-[15px] font-semibold text-slate-900">Reports</h3>
        <ReportsPanel reports={reports} onReport={onReport} />
      </section>
    </div>
  );
}
