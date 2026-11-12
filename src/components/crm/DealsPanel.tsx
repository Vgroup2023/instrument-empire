'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { wonDealTotals, type WonDealLine } from '@/lib/crm/model';
import { formatCurrency } from '@/lib/format';
import { Avatar } from './Avatar';
import { BusinessBadge } from './BusinessBadge';
import { crmCall } from './api';

type Loaded = { key: string; lines: WonDealLine[]; truncated: boolean; error: string | null };

/** Every completed deal across the group, one row per line item, with a file to download. Follows the Business buttons above. */
export function DealsPanel({ business }: { business: string }) {
  const query = business === 'all' ? '' : `business=${encodeURIComponent(business)}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    let live = true;
    crmCall<{ lines: WonDealLine[]; truncated: boolean }>(`/api/crm/completed${query ? `?${query}` : ''}`)
      .then((r) => { if (live) setLoaded({ key: query, lines: r.lines, truncated: r.truncated, error: null }); })
      .catch((err) => { if (live) setLoaded({ key: query, lines: [], truncated: false, error: err instanceof Error ? err.message : 'Could not load the completed deals.' }); });
    return () => { live = false; };
  }, [query]);

  const ready = loaded && loaded.key === query ? loaded : null;
  const totals = useMemo(() => wonDealTotals(ready?.lines ?? []), [ready]);
  const downloadUrl = `/api/crm/completed?format=csv${query ? `&${query}` : ''}`;

  if (!ready) return <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Spinner /> Loading completed deals…</div>;
  if (ready.error) return <EmptyState title="Couldn't load the completed deals" description={ready.error} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700" aria-live="polite">
          <strong className="text-slate-900">{totals.deals}</strong> completed {totals.deals === 1 ? 'deal' : 'deals'}
          <span className="text-slate-400"> · </span><strong className="text-slate-900">{totals.items}</strong> {totals.items === 1 ? 'item' : 'items'}
          {totals.byCurrency.map((c) => <span key={c.currency}><span className="text-slate-400"> · </span><strong className="text-slate-900">{formatCurrency(c.amount, c.currency)}</strong></span>)}
        </p>
        {ready.lines.length === 0
          ? <Button disabled>Download file (CSV)</Button>
          : <a href={downloadUrl} download className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-royal-gradient px-3.5 py-2 text-sm font-medium text-white transition hover:brightness-110">Download file (CSV)</a>}
      </div>
      {ready.truncated ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Showing the first 5,000 items. Narrow by business to see the rest.</p> : null}
      {ready.lines.length === 0 ? (
        <EmptyState title="No completed deals yet" description="A deal appears here once it is moved to Won." />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <Thead>
              <Tr>
                <Th className="!px-3">Deal #</Th><Th className="!px-3">Item</Th><Th className="!px-3">Invoice</Th><Th className="!px-3">Customer</Th><Th className="!px-3">Product details</Th>
                <Th className="!px-3 text-right">Qty × price</Th><Th className="!px-3 text-right">Amount</Th><Th className="!px-3">Brought in by</Th>
              </Tr>
            </Thead>
            <Tbody>
              {ready.lines.map((l, i) => {
                const first = i === 0 || ready.lines[i - 1].dealId !== l.dealId;
                return (
                  <Tr key={`${l.dealId}-${l.item}`} className={first && i > 0 ? 'border-t-2 border-slate-200' : ''}>
                    <Td className="!px-3 font-semibold text-slate-900">{first ? l.dealNo : <span className="text-slate-300">{l.dealNo}</span>}</Td>
                    <Td className="!px-3 text-slate-500">{l.item}</Td>
                    <Td className="!px-3 whitespace-nowrap">
                      <span className="text-slate-700">{l.invoiceNo ?? <span className="text-slate-400">No invoice</span>}</span>
                      {l.closedAt ? <span className="block text-xs text-slate-500">{l.closedAt.slice(0, 10)}</span> : null}
                    </Td>
                    <Td className="!px-3"><span className="block font-medium text-slate-900">{l.customer}</span>{first ? <BusinessBadge business={l.business} /> : null}</Td>
                    <Td className="!px-3 max-w-[13rem] text-slate-700">{l.product}</Td>
                    <Td className="!px-3 whitespace-nowrap text-right tabular-nums text-slate-600">{l.qty} × {formatCurrency(l.unitPrice, l.currency)}</Td>
                    <Td className="!px-3 whitespace-nowrap text-right font-medium tabular-nums text-slate-900">{formatCurrency(l.amount, l.currency)}</Td>
                    <Td className="!px-3"><span className="inline-flex items-center gap-2 whitespace-nowrap"><Avatar name={l.broughtInBy} />{l.broughtInBy ?? <span className="text-slate-400">Unassigned</span>}</span></Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
