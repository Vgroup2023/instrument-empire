const COLORS = ['#3f5fe0', '#0e7490', '#6d28d9', '#b45309', '#15803d', '#be185d', '#0369a1', '#7c3aed'];

/** A round badge with a person's initials, in a colour that is the same for the same name every time. */
export function Avatar({ name, size = 22 }: { name: string | null | undefined; size?: number }) {
  const n = name?.trim();
  if (!n) return <span aria-label="Unassigned" title="Unassigned" className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-slate-400 text-[10px] text-slate-400" style={{ width: size, height: size }}>?</span>;
  const initials = n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span title={n} aria-label={n} className="inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ width: size, height: size, background: COLORS[h % COLORS.length] }}>{initials}</span>
  );
}
