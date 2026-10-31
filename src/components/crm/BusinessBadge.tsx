import { businessInfo } from '@/lib/crm/model';

/** A small coloured tag naming the business a record belongs to, or nothing when it is not tagged. */
export function BusinessBadge({ business, className = '' }: { business: string | null | undefined; className?: string }) {
  const b = businessInfo(business);
  if (!b) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold ${className}`} style={{ color: b.color, borderColor: `${b.color}55`, background: `${b.color}12` }}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: b.color }} />{b.name}
    </span>
  );
}
