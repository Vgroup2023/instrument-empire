import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { describeError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { loadContext } from '@/lib/agents/runner';
import { openCountByDepartment } from '@/lib/agents/queries';
import { DEPARTMENTS, STAGES, stageOf, type ShipmentCtx } from '@/lib/agents/types';

export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  let data: [Awaited<ReturnType<typeof loadContext>>, Record<string, number>] | null = null;
  let loadError: unknown = null;
  try {
    data = await Promise.all([loadContext(), openCountByDepartment()]);
  } catch (err) {
    loadError = err;
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Operations board" description="Every file, by stage, with each department's open work." />
        <EmptyState title="Couldn't load the board" description={describeError(loadError, 'Please try again.')} />
      </div>
    );
  }

  const [ctx, deptCounts] = data;
  const active = ctx.shipments.filter((s) => s.status !== 'cancelled');
  const byStage = new Map<string, ShipmentCtx[]>();
  for (const s of active) {
    const st = stageOf(s, ctx.now);
    byStage.set(st, [...(byStage.get(st) ?? []), s]);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Operations board" description="Customs, shipping, logistics, warehouse and accounts all work from the same file. Each file moves left to right." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DEPARTMENTS.map((d) => {
          const n = deptCounts[d.id] ?? 0;
          return (
            <Link prefetch={false} key={d.id} href={`/dashboard/agents?dept=${d.id}`} className="rounded-xl2 border border-slate-200 bg-surface p-4 shadow-card transition hover:border-brand-400">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">{d.name}</span>
                <Badge tone={n ? 'warning' : 'success'}>{n} open</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">{n ? 'Items waiting on this team.' : 'Nothing waiting.'}</p>
            </Link>
          );
        })}
      </div>

      {active.length === 0 ? (
        <Card>
          <EmptyState title="No shipments yet" description="Add a shipment to see it move across the board." />
        </Card>
      ) : (
        <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-2">
          {STAGES.map((st) => {
            const items = byStage.get(st.id) ?? [];
            return (
              <div key={st.id} className="w-60 shrink-0 rounded-xl2 border border-slate-200 bg-surface-muted p-2">
                <div className="flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {st.name}
                  <span>{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((s) => (
                    <Link prefetch={false} key={s.id} href={`/dashboard/shipments/${s.id}`} className="block">
                      <Card>
                        <CardBody className="space-y-1 px-3 py-2.5">
                          <div className="text-sm font-medium text-slate-900">{s.reference}</div>
                          <div className="text-xs text-slate-500">
                            {s.direction}
                            {s.carrier ? ` · ${s.carrier}` : ''}
                          </div>
                          {s.lastFreeDate && st.id !== 'delivered' && st.id !== 'invoiced' ? (
                            <div className="text-xs text-slate-500">Last free day {formatDate(s.lastFreeDate)}</div>
                          ) : null}
                        </CardBody>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
