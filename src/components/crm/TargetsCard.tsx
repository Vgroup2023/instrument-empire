'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { monthOf, monthProgress, type Deal, type Target } from '@/lib/crm/model';
import { formatCurrency } from '@/lib/format';
import { crmCall } from './api';

const shift = (period: string, by: number) => {
  const [y, m] = period.split('-').map(Number);
  return monthOf(Date.UTC(y, m - 1 + by, 1));
};
const label = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

/** One editable target amount. Mounted fresh when the saved amount changes, so the box always shows what is saved. */
function TargetInput({ amount, onSave, disabled }: { amount: number | null; onSave: (n: number | null) => Promise<void>; disabled?: boolean }) {
  const [v, setV] = useState(amount === null ? '' : String(amount));
  const [busy, setBusy] = useState(false);
  const changed = v.trim() !== (amount === null ? '' : String(amount));
  const num = v.trim() === '' ? null : Number(v);
  const bad = num !== null && (!Number.isFinite(num) || num < 0);
  return (
    <form className="inline-flex items-center gap-1.5" onSubmit={async (e) => { e.preventDefault(); if (bad) return; setBusy(true); try { await onSave(num); } finally { setBusy(false); } }}>
      <Input className="w-28" type="number" min={0} step="100" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="No target" aria-label="Target" disabled={disabled} />
      {changed && !disabled ? <Button type="submit" loading={busy} disabled={bad}>Save</Button> : null}
    </form>
  );
}

/** Monthly sales targets, for the team and each person, against what has been won that month. */
export function TargetsCard({ deals, actor, now }: { deals: Deal[]; actor: string; now: number }) {
  const { notify } = useToast();
  const [period, setPeriod] = useState(() => monthOf(now));
  const [loaded, setLoaded] = useState<{ period: string; list: Target[] } | null>(null);
  const targets = loaded?.period === period ? loaded.list : null;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    crmCall<{ targets: Target[] }>(`/api/crm/targets?period=${period}`)
      .then((r) => { if (live) { setLoaded({ period, list: r.targets }); setError(null); } })
      .catch((err) => { if (live) setError(err instanceof Error ? err.message : 'Could not load the targets.'); });
    return () => { live = false; };
  }, [period]);

  const won = useMemo(() => {
    const by = new Map<string, number>();
    let total = 0;
    for (const d of deals) {
      if (d.stage !== 'won' || !d.closedAt || monthOf(d.closedAt) !== period) continue;
      const k = d.owner?.trim() || 'Unassigned';
      by.set(k, (by.get(k) ?? 0) + d.value);
      total += d.value;
    }
    return { by, total };
  }, [deals, period]);

  async function save(owner: string, amount: number | null) {
    try {
      const r = await crmCall<{ targets: Target[] }>('/api/crm/targets', 'PUT', { period, owner, amount, actor });
      setLoaded({ period, list: r.targets });
      notify(amount ? 'Target saved.' : 'Target cleared.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save the target.', 'error');
    }
  }

  const progress = monthProgress(period, now);
  const teamTarget = targets?.find((t) => t.owner === '')?.amount ?? null;
  const people = [...new Set([...won.by.keys(), ...(targets ?? []).filter((t) => t.owner).map((t) => t.owner)])].sort((a, b) => (won.by.get(b) ?? 0) - (won.by.get(a) ?? 0) || a.localeCompare(b));
  const rows: { key: string; name: string; owner: string; actual: number; target: number | null }[] = [
    { key: 'team', name: 'Whole team', owner: '', actual: won.total, target: teamTarget },
    ...people.map((p) => ({ key: p, name: p, owner: p, actual: won.by.get(p) ?? 0, target: targets?.find((t) => t.owner === p)?.amount ?? null })),
  ];

  return (
    <section aria-label="Monthly targets">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-semibold text-slate-900">Monthly targets</h3>
        <span className="ml-auto inline-flex items-center gap-1">
          <Button variant="secondary" onClick={() => setPeriod((p) => shift(p, -1))} aria-label="Previous month">‹</Button>
          <span className="min-w-[130px] text-center text-sm font-medium text-slate-800">{label(period)}</span>
          <Button variant="secondary" onClick={() => setPeriod((p) => shift(p, 1))} aria-label="Next month">›</Button>
        </span>
      </div>
      <p className="mb-2 text-xs text-slate-500">Progress is the value of deals won (closed) in the month, in each deal&apos;s own amount, against the target. A person&apos;s name must match the deal owner. The line on each bar is where you should be by today.</p>
      <Card>
        {error ? <p className="p-4 text-sm text-red-600">{error}</p> : (
          <Table>
            <Thead><Tr><Th>Who</Th><Th>Target</Th><Th className="text-right">Won</Th><Th className="w-[34%]">Progress</Th></Tr></Thead>
            <Tbody>
              {rows.map((r) => {
                const pct = r.target ? Math.round((r.actual / r.target) * 100) : null;
                const expected = r.target ? r.target * progress : 0;
                const gap = r.target ? r.actual - expected : 0;
                return (
                  <Tr key={r.key}>
                    <Td className="font-medium text-slate-900">{r.name}</Td>
                    <Td>{targets === null ? <span className="text-xs text-slate-400">…</span> : <TargetInput key={`${period}-${r.owner}-${r.target}`} amount={r.target} disabled={r.name === 'Unassigned'} onSave={(n) => save(r.owner, n)} />}</Td>
                    <Td className="text-right">{formatCurrency(r.actual)}</Td>
                    <Td>
                      {r.target && pct !== null ? (
                        <div>
                          <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${r.name} progress to target`}>
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: pct >= 100 ? '#16a34a' : gap >= 0 ? '#3f5fe0' : '#f59e0b' }} />
                            {progress > 0 && progress < 1 ? <div className="absolute inset-y-0 w-0.5 bg-slate-700/60" style={{ left: `${progress * 100}%` }} /> : null}
                          </div>
                          <p className="mt-1 text-xs text-slate-600">
                            {pct}% of target{progress < 1 && pct < 100 ? ` · ${gap >= 0 ? `${formatCurrency(gap)} ahead of pace` : `${formatCurrency(-gap)} behind pace`}` : ''}{pct >= 100 ? ' · target met' : ''}
                          </p>
                        </div>
                      ) : <span className="text-xs text-slate-400">Set a target to track progress.</span>}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </Card>
    </section>
  );
}
