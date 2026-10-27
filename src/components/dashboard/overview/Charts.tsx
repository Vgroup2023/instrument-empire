import type { SalesPoint } from '@/lib/dashboard/overview';

/** A round upper limit for a chart axis: 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * pow) return m * pow;
  return 10 * pow;
}

export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `$${+(v / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `$${+(v / 1_000).toFixed(a >= 10_000 ? 0 : 1)}K`;
  return `$${Math.round(v)}`;
}

/** Month-to-date sales, this month against last month, as a running total by day. Pure SVG, so it needs no script. */
export function SalesLineChart({ points, monthName }: { points: SalesPoint[]; monthName: string }) {
  const W = 560;
  const H = 290;
  const L = 52;
  const R = 12;
  const T = 12;
  const B = 28;
  const days = points.length;
  const max = niceMax(Math.max(...points.map((p) => Math.max(p.thisMonth ?? 0, p.lastMonth ?? 0)), 0));
  const x = (day: number) => L + ((day - 1) / Math.max(1, days - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const path = (get: (p: SalesPoint) => number | null) => {
    let d = '';
    for (const p of points) {
      const v = get(p);
      if (v === null) continue;
      d += `${d ? 'L' : 'M'}${x(p.day).toFixed(1)} ${y(v).toFixed(1)} `;
    }
    return d.trim();
  };
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const xTicks = [1, 8, 15, 22, days].filter((d, i, a) => a.indexOf(d) === i && d <= days);
  const lastThis = [...points].reverse().find((p) => p.thisMonth !== null);
  const empty = max <= 1 && !points.some((p) => (p.thisMonth ?? 0) > 0 || (p.lastMonth ?? 0) > 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sales this month compared with last month, running total by day`} className="h-auto w-full">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e8edf4" strokeWidth="1" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#7b8794">{empty ? '' : compact(t)}</text>
        </g>
      ))}
      {xTicks.map((d) => (
        <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize="11" fill="#7b8794">{d}</text>
      ))}
      <path d={path((p) => p.lastMonth)} fill="none" stroke="#c3cbd6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <path d={path((p) => p.thisMonth)} fill="none" stroke="#22b45a" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      {lastThis && lastThis.thisMonth !== null ? <circle cx={x(lastThis.day)} cy={y(lastThis.thisMonth)} r="4" fill="#22b45a" stroke="#fff" strokeWidth="2" /> : null}
      {empty ? <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="13" fill="#7b8794">No invoices yet in {monthName}</text> : null}
    </svg>
  );
}

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/** A ring of slices with the total in the middle. */
export function Donut({ slices, total, caption }: { slices: Slice[]; total: number; caption: string }) {
  const size = 190;
  const r = 70;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const sum = slices.reduce((a, s) => a + s.value, 0);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${total} ${caption}`} className="h-auto w-full max-w-[190px]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#edf1f6" strokeWidth="26" />
      {sum > 0
        ? slices.map((s) => {
            const len = (s.value / sum) * c;
            const el = (
              <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth="26"
                strokeDasharray={`${Math.max(0, len - (slices.filter((x) => x.value > 0).length > 1 ? 2 : 0))} ${c}`} strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`} />
            );
            offset += len;
            return el;
          })
        : null}
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fontSize="30" fontWeight="700" fill="#0f2447">{total}</text>
      <text x={size / 2} y={size / 2 + 24} textAnchor="middle" fontSize="11" fill="#7b8794">{caption}</text>
    </svg>
  );
}
