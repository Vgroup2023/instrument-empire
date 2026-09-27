import { formatCurrency } from '@/lib/format';

export interface BarListItem {
  label: string;
  value: number;
  sublabel?: string;
}

/** Simple horizontal bar list — no charting library needed for this shape of data. */
export function BarList({ items, tone = 'brand' }: { items: BarListItem[]; tone?: 'brand' | 'red' | 'amber' }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const barColor =
    tone === 'brand' ? 'bg-brand-500' : tone === 'red' ? 'bg-red-500' : 'bg-amber-500';

  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">No data for this period.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-700">{item.label}</span>
            <span className="text-slate-500">
              {formatCurrency(item.value)}
              {item.sublabel ? <span className="ml-1 text-xs text-slate-400">{item.sublabel}</span> : null}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
