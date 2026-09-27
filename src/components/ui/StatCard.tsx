import { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

interface StatCardProps {
  label: string;
  value: string;
  delta?: { value: string; positive: boolean };
  hint?: string;
  icon?: ReactNode;
}

export function StatCard({ label, value, delta, hint, icon }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        {icon ? <div className="text-slate-500">{icon}</div> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-50">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        {delta ? (
          <span
            className={cn(
              'text-xs font-medium',
              delta.positive ? 'text-emerald-400' : 'text-red-400',
            )}
          >
            {delta.positive ? '▲' : '▼'} {delta.value}
          </span>
        ) : null}
        {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
      </div>
    </Card>
  );
}
