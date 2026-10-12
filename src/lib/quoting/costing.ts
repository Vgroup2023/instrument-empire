import { CERTIFICATIONS, canonicalMaterial, certKey } from './materials';
import type {
  CostedPart,
  Flag,
  MaterialPrice,
  PartCosting,
  PartInput,
  PriorJob,
  PriorMatch,
  QuoteContext,
  RfqCosted,
  RoutingRule,
} from './types';

// Prices a request from the shop's own rules. Every number carries a plain-language line saying where it
// came from, and anything shaky (a stale price, a missing routing rule, no history, a certification the
// shop doesn't hold) becomes a flag the estimator must see before approving. Nothing here sends anything.

const LB_PER_KG = 2.20462262;
const DAY = 86_400_000;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY);
}

const STOP = new Set(['the', 'and', 'for', 'with', 'part', 'assy', 'assembly', 'rev', 'per', 'drawing', 'dwg']);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOP.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Price per pound from a price-list row, or null when its unit can't be converted. */
function pricePerLb(p: MaterialPrice): number | null {
  const unit = p.unit.trim().toUpperCase();
  if (unit === 'LB' || unit === 'LBS' || unit === '/LB') return p.price;
  if (unit === 'KG' || unit === '/KG') return p.price / LB_PER_KG;
  return null;
}

/** The price to use: the cheapest fresh one, otherwise the most recent. */
export function pickPrice(canonical: string, prices: MaterialPrice[], today: string, staleDays: number): MaterialPrice | null {
  const usable = prices.filter((p) => canonicalMaterial(p.material) === canonical && pricePerLb(p) !== null);
  if (usable.length === 0) return null;
  const fresh = usable.filter((p) => daysBetween(p.priceDate, today) <= staleDays);
  const pool = fresh.length ? fresh : usable;
  return [...pool].sort((a, b) => (pricePerLb(a)! - pricePerLb(b)!) || b.priceDate.localeCompare(a.priceDate))[0];
}

function findRule(operation: string, routing: RoutingRule[]): RoutingRule | undefined {
  const o = operation.trim().toLowerCase();
  return routing.find((r) => r.operation.trim().toLowerCase() === o) ?? routing.find((r) => r.keywords.some((k) => k.trim().toLowerCase() === o));
}

export function matchPriorJobs(part: PartInput, jobs: PriorJob[]): PriorMatch[] {
  const pn = (part.partNumber ?? '').trim().toLowerCase();
  const canon = canonicalMaterial(part.material);
  const partTokens = tokens(part.description);
  const out: PriorMatch[] = [];
  for (const j of jobs) {
    let similarity = 0;
    let by: PriorMatch['matchedBy'] = 'description';
    if (pn && (j.partNumber ?? '').trim().toLowerCase() === pn) {
      similarity = 1;
      by = 'part-number';
    } else {
      const sameMaterial = !canon || !j.material || canonicalMaterial(j.material) === canon;
      const s = jaccard(partTokens, tokens(j.description));
      if (sameMaterial && s >= 0.5) similarity = s;
    }
    if (similarity > 0) {
      out.push({
        id: j.id,
        partNumber: j.partNumber,
        description: j.description,
        qty: j.qty,
        unitPrice: j.unitPrice,
        laborHoursPerPart: j.laborHoursPerPart,
        completedOn: j.completedOn,
        similarity: round2(similarity),
        matchedBy: by,
      });
    }
  }
  return out
    .sort((a, b) => b.similarity - a.similarity || (b.completedOn ?? '').localeCompare(a.completedOn ?? ''))
    .slice(0, 3);
}

function weightedAvg(rows: { v: number; w: number }[]): number | null {
  const total = rows.reduce((s, r) => s + r.w, 0);
  return total > 0 ? rows.reduce((s, r) => s + r.v * r.w, 0) / total : null;
}

export function costPart(part: PartInput, line: number, ctx: QuoteContext, marginPct: number): { costed: CostedPart; flags: Flag[] } {
  const { settings, prices, routing, priorJobs, today } = ctx;
  const flags: Flag[] = [];
  const basis: string[] = [];
  const flag = (code: string, severity: Flag['severity'], message: string) => flags.push({ code, severity, message, line });
  const label = part.partNumber ? `${part.partNumber}` : `line ${line}`;

  const priors = matchPriorJobs(part, priorJobs);
  const exact = priors.find((p) => p.matchedBy === 'part-number');
  const priorRows = priorJobs.filter((j) => priors.some((p) => p.id === j.id));
  const avgPriorPrice = weightedAvg(priors.filter((p) => p.unitPrice !== null).map((p) => ({ v: p.unitPrice!, w: p.similarity })));
  const avgPriorHours = weightedAvg(priors.filter((p) => p.laborHoursPerPart !== null).map((p) => ({ v: p.laborHoursPerPart!, w: p.similarity })));
  const avgPriorMaterial = weightedAvg(
    priorRows.filter((j) => j.materialCostPerPart !== null).map((j) => ({ v: j.materialCostPerPart!, w: priors.find((p) => p.id === j.id)!.similarity })),
  );

  // ---- material ----------------------------------------------------------
  const canonical = canonicalMaterial(part.material);
  const material: PartCosting['material'] = { canonical, costPerPart: null, source: 'none' };
  if (!canonical) {
    flag('NO_MATERIAL', 'high', `${label}: no material is stated, so material cost can't be priced.`);
  } else {
    const price = pickPrice(canonical, prices, today, settings.priceStaleDays);
    if (!price) {
      flag('NO_PRICE', 'high', `${label}: no price on file for ${canonical}. Add one under Quoting rules or enter the vendor quote.`);
    } else {
      const perLb = pricePerLb(price)!;
      const age = daysBetween(price.priceDate, today);
      material.vendor = price.vendor;
      material.pricePerLb = round4(perLb);
      material.priceDate = price.priceDate;
      material.ageDays = age;
      if (age > settings.priceStaleDays) {
        flag('STALE_PRICE', 'medium', `${label}: the ${canonical} price of $${perLb.toFixed(2)}/lb from ${price.vendor} was set ${price.priceDate} (${age} days ago; the limit is ${settings.priceStaleDays}). Confirm today's price.`);
      }
      if (part.weightLb && part.weightLb > 0) {
        const stockLb = part.weightLb * (1 + settings.scrapPct / 100);
        material.weightLb = round4(part.weightLb);
        material.costPerPart = round4(stockLb * perLb);
        material.source = 'price-list';
        basis.push(`Material: ${part.weightLb.toFixed(3)} lb finished + ${settings.scrapPct}% scrap × $${perLb.toFixed(2)}/lb (${price.vendor}, ${price.priceDate}).`);
        if (part.weightEstimated) {
          flag('WEIGHT_ESTIMATED', 'low', `${label}: weight was worked out from stock dimensions and the material's density, not stated. Check it against the drawing.`);
        }
      } else if (avgPriorMaterial !== null) {
        material.costPerPart = round4(avgPriorMaterial);
        material.source = 'prior-job';
        basis.push(`Material: no weight given, so the material cost of similar prior jobs ($${avgPriorMaterial.toFixed(2)}/part) is used.`);
        flag('NO_WEIGHT', 'medium', `${label}: no part weight given. Material cost is taken from similar prior jobs, not today's ${canonical} price.`);
      } else {
        flag('NO_WEIGHT', 'high', `${label}: no part weight or stock size given, so material cost is left out of this price.`);
      }
    }
  }
  const materialCost = material.costPerPart ?? 0;

  // ---- operations and labor ---------------------------------------------
  const operations: PartCosting['operations'] = [];
  let labor = 0;
  const rated = routing.filter((r) => r.ratePerHour > 0);
  const avgRate = rated.length ? rated.reduce((s, r) => s + r.ratePerHour, 0) / rated.length : 0;
  if (part.operations.length === 0) {
    if (avgPriorHours !== null && avgRate > 0) {
      labor = avgPriorHours * avgRate;
      basis.push(`Labor: no operations listed, so ${avgPriorHours.toFixed(2)} h/part from similar prior jobs at the average shop rate $${avgRate.toFixed(2)}/h.`);
      flag('NO_OPERATIONS', 'medium', `${label}: no operations listed. Labor is taken from similar prior jobs.`);
    } else {
      flag('NO_OPERATIONS', 'high', `${label}: no operations listed, so labor is left out of this price.`);
    }
  }
  for (const op of part.operations) {
    const rule = findRule(op, routing);
    if (!rule) {
      operations.push({ operation: op, found: false, setupHours: 0, runMinutes: 0, ratePerHour: 0, costPerPart: 0 });
      flag('NO_ROUTING', 'medium', `${label}: no routing rule for "${op}", so it adds no labor. Add its setup, run time and rate under Quoting rules.`);
      continue;
    }
    const hours = rule.setupHours / part.qty + rule.runMinutes / 60;
    const cost = hours * rule.ratePerHour;
    operations.push({ operation: rule.operation, found: true, setupHours: rule.setupHours, runMinutes: rule.runMinutes, ratePerHour: rule.ratePerHour, costPerPart: round4(cost) });
    labor += cost;
    basis.push(`${rule.operation}: ${rule.setupHours} h setup ÷ ${part.qty} + ${rule.runMinutes} min run, at $${rule.ratePerHour.toFixed(2)}/h = $${cost.toFixed(2)}/part.`);
    if (rule.ratePerHour === 0) flag('NO_RATE', 'medium', `${label}: the "${rule.operation}" rule has no hourly rate, so it adds no cost.`);
  }

  // ---- roll up -------------------------------------------------------------
  const direct = materialCost + labor;
  const overhead = direct * (settings.overheadPct / 100);
  const unitCost = direct + overhead;
  const unitPrice = marginPct >= 100 ? unitCost : unitCost / (1 - marginPct / 100);
  basis.push(`Overhead ${settings.overheadPct}% on direct cost; price set for a ${marginPct}% margin.`);

  if (priors.length === 0) {
    flag('NO_PRIOR', 'low', `${label}: no similar prior jobs on file, so this price rests on your rules alone.`);
  } else {
    basis.push(`${priors.length} similar prior job${priors.length === 1 ? '' : 's'} found${exact ? ' (including this part number)' : ''}.`);
    if (avgPriorPrice !== null && avgPriorPrice > 0 && unitPrice > 0) {
      const diff = (unitPrice - avgPriorPrice) / avgPriorPrice;
      if (Math.abs(diff) > 0.25) {
        flag(
          'VARIANCE',
          'medium',
          `${label}: the computed price $${unitPrice.toFixed(2)} is ${Math.abs(Math.round(diff * 100))}% ${diff > 0 ? 'above' : 'below'} the $${avgPriorPrice.toFixed(2)} charged on similar prior jobs. Check cycle times, quantity and recent price moves.`,
        );
      }
    }
  }

  // Confidence: how many of the inputs came from real data rather than gaps.
  const gaps = flags.filter((f) => f.severity === 'high').length;
  const softGaps = flags.filter((f) => f.severity === 'medium').length;
  const confidence: PartCosting['confidence'] = gaps > 0 ? 'low' : softGaps > 0 || priors.length === 0 ? 'medium' : 'high';

  const costing: PartCosting = {
    material,
    operations,
    laborCostPerPart: round4(labor),
    materialCostPerPart: round4(materialCost),
    overheadCostPerPart: round4(overhead),
    priorJobs: priors,
    avgPriorUnitPrice: avgPriorPrice === null ? null : round4(avgPriorPrice),
    unitCost: round4(unitCost),
    unitPrice: round2(unitPrice),
    confidence,
    basis,
  };
  return { costed: { ...part, line, costing }, flags };
}

/** Does the shop hold what the customer asks for? Compares by family (AS9100D satisfies AS9100). */
export function missingCertifications(required: string[], held: string[]): string[] {
  const have = new Set(held.map(certKey));
  return required.filter((r) => !have.has(certKey(r)));
}

export function costRfq(
  input: { parts: PartInput[]; dueDate: string | null; certifications: string[]; hasDrawing: boolean; marginPct?: number | null },
  ctx: QuoteContext,
): RfqCosted {
  const marginPct = input.marginPct ?? ctx.settings.targetMarginPct;
  const flags: Flag[] = [];
  const parts: CostedPart[] = [];
  input.parts.forEach((p, i) => {
    const { costed, flags: f } = costPart(p, i + 1, ctx, marginPct);
    parts.push(costed);
    flags.push(...f);
  });

  if (input.parts.length === 0) {
    flags.push({ code: 'NO_PARTS', severity: 'high', message: 'No parts could be read from this request. Add them by hand below.' });
  }
  for (const c of missingCertifications(input.certifications, ctx.settings.certifications)) {
    const known = CERTIFICATIONS.find((k) => k.key === certKey(c))?.label ?? c;
    flags.push({ code: 'CERT_GAP', severity: 'high', message: `The customer asks for ${known}, which isn't on your list of held certifications. Confirm you can meet it before quoting.` });
  }
  if (input.dueDate) {
    const left = daysBetween(ctx.today, input.dueDate);
    if (left < 0) flags.push({ code: 'PAST_DUE', severity: 'high', message: `The due date ${input.dueDate} has already passed.` });
    else if (left < ctx.settings.minLeadDays) {
      flags.push({ code: 'TIGHT_DUE', severity: 'medium', message: `The due date ${input.dueDate} is ${left} day${left === 1 ? '' : 's'} away; your minimum lead time is ${ctx.settings.minLeadDays}.` });
    }
  } else {
    flags.push({ code: 'NO_DUE', severity: 'low', message: 'No due date found in the request.' });
  }
  if (!input.hasDrawing) {
    flags.push({ code: 'NO_DRAWING', severity: 'medium', message: 'No drawing or model is attached, so tolerances and requirements could not be checked against it.' });
  }
  if (marginPct < ctx.settings.targetMarginPct) {
    flags.push({ code: 'LOW_MARGIN', severity: 'medium', message: `This quote is set at ${marginPct}% margin, below your ${ctx.settings.targetMarginPct}% target.` });
  }

  const costTotal = parts.reduce((s, p) => s + p.costing.unitCost * p.qty, 0);
  const priceTotal = parts.reduce((s, p) => s + p.costing.unitPrice * p.qty, 0);
  const order = { high: 0, medium: 1, low: 2 } as const;
  flags.sort((a, b) => order[a.severity] - order[b.severity]);
  return { parts, flags, costTotal: round2(costTotal), priceTotal: round2(priceTotal), marginPct };
}
