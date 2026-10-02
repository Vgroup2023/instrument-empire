import type { AgentContext, Finding } from './types';
import { dayStart, hoursUntil, isActive } from './types';

// ISF (10+2): importer security filing due at least 24 hours before cargo is
// loaded at the foreign port (19 CFR 149.2). Liquidated damages are up to
// $5,000 per violation. Entry: file within 15 calendar days of arrival
// (19 CFR 142.2). These are the ocean-cargo rules; air and rail differ.

export function runCbpSentinel(ctx: AgentContext): Finding[] {
  const out: Finding[] = [];
  for (const s of ctx.shipments.filter((x) => isActive(x) && x.direction === 'import')) {
    if (s.loadingDate) {
      const loading = dayStart(s.loadingDate);
      if (!s.isfFiledAt) {
        const h = hoursUntil(loading, ctx.now);
        if (h < 24) {
          out.push({
            agent: 'cbp-sentinel',
            severity: 'critical',
            shipmentId: s.id,
            dedupeKey: `isf:overdue:${s.id}`,
            title: `${s.reference}: ISF is past due`,
            detail: `Cargo loads ${s.loadingDate} and no ISF is on file. The 24-hour deadline has passed. Exposure is up to $5,000 per violation.`,
          });
        } else if (h < 96) {
          out.push({
            agent: 'cbp-sentinel',
            severity: 'high',
            shipmentId: s.id,
            dedupeKey: `isf:soon:${s.id}`,
            title: `${s.reference}: ISF due in ${Math.floor(h - 24)} hours`,
            detail: `Cargo loads ${s.loadingDate}. File the ISF before ${new Date(loading.getTime() - 24 * 3_600_000).toISOString().slice(0, 16)}Z.`,
          });
        }
      } else if (hoursUntil(loading, new Date(s.isfFiledAt)) < 24) {
        out.push({
          agent: 'cbp-sentinel',
          severity: 'high',
          shipmentId: s.id,
          dedupeKey: `isf:late:${s.id}`,
          title: `${s.reference}: ISF was filed late`,
          detail: `Filed ${s.isfFiledAt.slice(0, 16)}Z, less than 24 hours before loading on ${s.loadingDate}. Check the penalty exposure with the importer.`,
        });
      }
    }
    if (s.arrivalDate && !s.entryFiledAt) {
      const daysLeft = 15 - Math.floor((ctx.now.getTime() - dayStart(s.arrivalDate).getTime()) / 86_400_000);
      if (daysLeft < 0) {
        out.push({
          agent: 'cbp-sentinel',
          severity: 'critical',
          shipmentId: s.id,
          dedupeKey: `entry:overdue:${s.id}`,
          title: `${s.reference}: entry is ${-daysLeft} days past the 15-day window`,
          detail: `Arrived ${s.arrivalDate} with no entry filed. Cargo may go to general order.`,
        });
      } else if (daysLeft <= 5) {
        out.push({
          agent: 'cbp-sentinel',
          severity: daysLeft <= 2 ? 'high' : 'medium',
          shipmentId: s.id,
          dedupeKey: `entry:soon:${s.id}`,
          title: `${s.reference}: entry due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
          detail: `Arrived ${s.arrivalDate}. File the entry within 15 calendar days of arrival.`,
        });
      }
    }
  }
  return out;
}
