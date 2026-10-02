import type { AgentContext, Finding, Severity } from './types';
import { SEVERITY_WEIGHT, dayStart } from './types';

const DAY = 86_400_000;

/**
 * Own checks for transport and warehouse exposure, then a 0-100 score per
 * shipment from everything the agents (including these) found in the run.
 */
export function runRiskRadar(ctx: AgentContext, others: Finding[]): Finding[] {
  const own: Finding[] = [];
  const today = Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth(), ctx.now.getUTCDate());

  for (const s of ctx.shipments) {
    if (s.status === 'cancelled') continue;
    const outOfPort = s.events.some((e) => e.type === 'gate_out' || e.type === 'delivered') || s.deliveredAt;
    if (s.lastFreeDate && !outOfPort) {
      const left = Math.floor((dayStart(s.lastFreeDate).getTime() - today) / DAY);
      if (left <= 2) {
        own.push({
          agent: 'risk-radar',
          severity: left < 0 ? 'critical' : 'high',
          shipmentId: s.id,
          dedupeKey: `risk:lfd:${s.id}`,
          title:
            left < 0
              ? `${s.reference}: last free day passed ${-left} day${left === -1 ? '' : 's'} ago`
              : `${s.reference}: last free day in ${left} day${left === 1 ? '' : 's'}`,
          detail: `${s.carrier ?? 'Carrier'}${s.containerNo ? ` container ${s.containerNo}` : ''} is still in port. Demurrage and per-diem charges ${left < 0 ? 'are accruing' : 'start after that date'}. Book the pickup or request an extension.`,
        });
      }
    }
    const w = s.warehouse;
    if (w?.receivedAt) {
      const short = w.expectedPieces !== null && w.receivedPieces !== null ? w.expectedPieces - w.receivedPieces : 0;
      if (short > 0 || w.damagedPieces > 0) {
        const parts = [short > 0 ? `${short} piece${short === 1 ? '' : 's'} short` : '', w.damagedPieces > 0 ? `${w.damagedPieces} damaged` : ''].filter(Boolean);
        own.push({
          agent: 'risk-radar',
          severity: 'high',
          shipmentId: s.id,
          dedupeKey: `risk:wh:${s.id}`,
          title: `${s.reference}: warehouse receipt discrepancy (${parts.join(', ')})`,
          detail: 'Photograph the damage, note it on the receiving record, and notify the carrier and client in writing now. Claim windows are short.',
        });
      }
    }
  }

  const all = [...others, ...own];
  const scores = new Map<string, { score: number; count: number }>();
  for (const f of all) {
    if (!f.shipmentId) continue;
    const cur = scores.get(f.shipmentId) ?? { score: 0, count: 0 };
    cur.score = Math.min(100, cur.score + SEVERITY_WEIGHT[f.severity]);
    cur.count += 1;
    scores.set(f.shipmentId, cur);
  }
  for (const s of ctx.shipments) {
    const r = scores.get(s.id);
    if (!r || r.score < 40) continue;
    const severity: Severity = r.score >= 80 ? 'critical' : r.score >= 60 ? 'high' : 'medium';
    own.push({
      agent: 'risk-radar',
      severity,
      shipmentId: s.id,
      dedupeKey: `risk:${s.id}`,
      title: `${s.reference}: exposure score ${r.score}/100`,
      detail: `${r.count} open issue${r.count === 1 ? '' : 's'} across the agents. Clear the critical items first.`,
    });
  }
  return own;
}
