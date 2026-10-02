import type { AgentContext, Finding } from './types';
import { dayStart, hoursUntil, isActive } from './types';

// Countries under comprehensive US embargo. Check current OFAC guidance before
// relying on this list; it is a safety net, not a legal determination.
const EMBARGOED = new Set(['CU', 'IR', 'KP', 'SY']);

// EEI is required for shipments over $2,500 per Schedule B number
// (15 CFR 30.37(a)), or when a license is needed. Ocean cargo: file at least
// 24 hours before loading.
const EEI_THRESHOLD = 2500;

function tokens(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length > 1);
}

export function matchesRestricted(party: string, list: string[]): string | null {
  const partyTokens = tokens(party).join(' ');
  if (!partyTokens) return null;
  for (const entry of list) {
    const e = tokens(entry).join(' ');
    if (e && (partyTokens.includes(e) || e.includes(partyTokens))) return entry;
  }
  return null;
}

export function runExportShield(ctx: AgentContext): Finding[] {
  const out: Finding[] = [];
  for (const s of ctx.shipments.filter(isActive)) {
    for (const [role, name] of [['Shipper', s.shipper], ['Consignee', s.consignee]] as const) {
      if (!name) continue;
      const hit = matchesRestricted(name, ctx.restrictedParties);
      const csl = ctx.screening?.screen(name) ?? [];
      if (hit || csl.length) {
        const exact = !!hit || csl.some((m) => m.kind === 'exact');
        const official = csl
          .slice(0, 3)
          .map((m) => `"${m.matchedName}" on ${m.entry.source}${m.entry.programs ? ` (${m.entry.programs})` : ''}, ${m.kind === 'exact' ? 'same name' : `${Math.round(m.score * 100)}% similar`}`)
          .join('; ');
        out.push({
          agent: 'export-shield',
          severity: exact ? 'critical' : 'high',
          shipmentId: s.id,
          dedupeKey: `screen:${role}:${s.id}`,
          title: `${s.reference}: ${role.toLowerCase()} "${name}" ${exact ? 'matches' : 'may match'} a restricted party`,
          detail: `${hit ? `Your own list has "${hit}". ` : ''}${official ? `Consolidated Screening List: ${official}. ` : ''}Hold the file until compliance clears it. Name matching is approximate: look at addresses and countries on the official list before deciding either way.`,
        });
      }
    }
    if (s.direction !== 'export') continue;

    const dest = s.destinationCountry?.toUpperCase() ?? '';
    if (EMBARGOED.has(dest)) {
      out.push({
        agent: 'export-shield',
        severity: 'critical',
        shipmentId: s.id,
        dedupeKey: `embargo:${s.id}`,
        title: `${s.reference}: destination ${dest} is embargoed`,
        detail: 'Exports to this destination generally need a license or are prohibited. Stop and escalate.',
      });
    }
    for (const line of s.lines) {
      if (line.eccn && line.eccn.toUpperCase() !== 'EAR99' && dest && dest !== 'CA') {
        out.push({
          agent: 'export-shield',
          severity: 'medium',
          shipmentId: s.id,
          dedupeKey: `eccn:${line.id}`,
          title: `${s.reference}: license check needed for ECCN ${line.eccn}`,
          detail: `"${line.description}" is controlled under ${line.eccn}. Confirm whether a license is required for ${dest}.`,
        });
      }
    }
    const needsEei = (s.declaredValue ?? 0) > EEI_THRESHOLD || s.lines.some((l) => (l.value ?? 0) > EEI_THRESHOLD);
    if (needsEei && !s.eeiFiledAt && s.loadingDate) {
      const h = hoursUntil(dayStart(s.loadingDate), ctx.now);
      if (h < 72) {
        out.push({
          agent: 'export-shield',
          severity: h < 24 ? 'critical' : 'high',
          shipmentId: s.id,
          dedupeKey: `eei:${s.id}`,
          title: `${s.reference}: EEI not filed${h < 24 ? ' and loading is imminent' : ''}`,
          detail: `Value exceeds $${EEI_THRESHOLD.toLocaleString()} and cargo loads ${s.loadingDate}. File EEI in AES at least 24 hours before loading.`,
        });
      }
    }
  }
  return out;
}
