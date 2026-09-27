import { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl2 border border-dashed border-steel-600 bg-steel-700/60 px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {description ? <p className="max-w-sm text-sm text-slate-400">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
