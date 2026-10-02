import type { AgentContext, Finding, Severity } from './types';
import { SEVERITY_WEIGHT } from './types';

/** Scores each shipment 0-100 from the findings other agents produced in the same run. */
export function runRiskRadar(ctx: AgentContext, others: Finding[]): Finding[] {
  const scores = new Map<string, { score: number; count: number }>();
  for (const f of others) {
    if (!f.shipmentId) continue;
    const cur = scores.get(f.shipmentId) ?? { score: 0, count: 0 };
    cur.score = Math.min(100, cur.score + SEVERITY_WEIGHT[f.severity]);
    cur.count += 1;
    scores.set(f.shipmentId, cur);
  }
  const out: Finding[] = [];
  for (const s of ctx.shipments) {
    const r = scores.get(s.id);
    if (!r || r.score < 40) continue;
    const severity: Severity = r.score >= 80 ? 'critical' : r.score >= 60 ? 'high' : 'medium';
    out.push({
      agent: 'risk-radar',
      severity,
      shipmentId: s.id,
      dedupeKey: `risk:${s.id}`,
      title: `${s.reference}: exposure score ${r.score}/100`,
      detail: `${r.count} open issue${r.count === 1 ? '' : 's'} from the other agents. Clear the critical items first.`,
    });
  }
  return out;
}
