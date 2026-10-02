import type { AgentContext, Finding } from './types';
import { dayStart, hoursUntil, isActive } from './types';

// DocuPilot checks completeness and consistency of what is already recorded.
// It does not read PDFs; documents are ticked off as they arrive.

/** Every document type a file can carry, including ones only needed later in its life. */
export const ALL_DOCS: { key: string; label: string }[] = [
  { key: 'commercial_invoice', label: 'Commercial invoice' },
  { key: 'packing_list', label: 'Packing list' },
  { key: 'bill_of_lading', label: 'Bill of lading / air waybill' },
  { key: 'delivery_order', label: 'Delivery order' },
  { key: 'proof_of_delivery', label: 'Proof of delivery' },
];

export const REQUIRED_DOCS: Record<'import' | 'export', { key: string; label: string }[]> = {
  import: [
    { key: 'commercial_invoice', label: 'Commercial invoice' },
    { key: 'packing_list', label: 'Packing list' },
    { key: 'bill_of_lading', label: 'Bill of lading / air waybill' },
  ],
  export: [
    { key: 'commercial_invoice', label: 'Commercial invoice' },
    { key: 'packing_list', label: 'Packing list' },
  ],
};

export function runDocuPilot(ctx: AgentContext): Finding[] {
  const out: Finding[] = [];
  for (const s of ctx.shipments.filter(isActive)) {
    const missing = REQUIRED_DOCS[s.direction].filter((d) => !s.receivedDocs.includes(d.key));
    if (missing.length) {
      const deadline = s.loadingDate ?? s.arrivalDate;
      const h = deadline ? hoursUntil(dayStart(deadline), ctx.now) : Infinity;
      out.push({
        agent: 'docupilot',
        severity: h < 48 ? 'high' : 'medium',
        shipmentId: s.id,
        dedupeKey: `docs:missing:${s.id}`,
        title: `${s.reference}: ${missing.length} document${missing.length === 1 ? '' : 's'} missing`,
        detail: `Still needed: ${missing.map((m) => m.label).join(', ')}.`,
      });
    }
    if ((s.deliveredAt || s.events.some((e) => e.type === 'delivered')) && !s.receivedDocs.includes('proof_of_delivery')) {
      out.push({
        agent: 'docupilot',
        severity: 'medium',
        shipmentId: s.id,
        dedupeKey: `docs:pod:${s.id}`,
        title: `${s.reference}: delivered but no proof of delivery on file`,
        detail: 'Get the signed delivery receipt before invoicing. Clients dispute charges without it.',
      });
    }
    const incomplete = s.lines.filter((l) => !l.description.trim() || l.value === null);
    if (incomplete.length) {
      out.push({
        agent: 'docupilot',
        severity: 'medium',
        shipmentId: s.id,
        dedupeKey: `docs:lines:${s.id}`,
        title: `${s.reference}: ${incomplete.length} line${incomplete.length === 1 ? '' : 's'} missing a value`,
        detail: 'Every line needs a description and value before filing.',
      });
    }
    if (s.declaredValue !== null && s.lines.length && s.lines.every((l) => l.value !== null)) {
      const sum = s.lines.reduce((t, l) => t + (l.value ?? 0), 0);
      if (s.declaredValue > 0 && Math.abs(sum - s.declaredValue) / s.declaredValue > 0.01) {
        out.push({
          agent: 'docupilot',
          severity: 'high',
          shipmentId: s.id,
          dedupeKey: `docs:total:${s.id}`,
          title: `${s.reference}: line values don't match the declared total`,
          detail: `Lines add up to ${sum.toFixed(2)} but the declared value is ${s.declaredValue.toFixed(2)}.`,
        });
      }
    }
  }
  return out;
}
