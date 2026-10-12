import { CERTIFICATIONS, canonicalMaterial, densityOf, findMaterial } from './materials';
import type { PartInput, RoutingRule } from './types';

// Reads the text of an RFQ (an email, a pasted request, a spec sheet) into parts, a due date and
// required certifications, using plain rules. It is deliberately conservative: anything it cannot
// find is left blank and flagged for the estimator, never guessed. When an Anthropic key is set,
// src/lib/quoting/read.ts reads the attached drawings too and falls back to this.

export interface ExtractedRfq {
  parts: PartInput[];
  dueDate: string | null;
  certifications: string[];
}

/** Operation words used when the shop hasn't defined its own routing rules yet. */
export const DEFAULT_OPERATION_KEYWORDS: Record<string, string[]> = {
  Milling: ['milling', 'mill', 'cnc mill', 'machining', 'machine'],
  Turning: ['turning', 'lathe', 'turn'],
  Drilling: ['drilling', 'drill', 'bore', 'boring', 'reaming', 'ream'],
  Tapping: ['tapping', 'tap', 'threading', 'thread'],
  Finishing: ['finishing', 'deburr', 'deburring', 'polish', 'anodize', 'anodizing', 'passivate', 'plating', 'powder coat'],
  Grinding: ['grinding', 'grind'],
  Welding: ['welding', 'weld'],
  Inspection: ['inspection', 'cmm', 'fai'],
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** A real calendar date as YYYY-MM-DD, or null. */
export function toIsoDate(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Reads the first date written after the word "due" (or "needed by", "deliver by"). */
export function findDueDate(text: string): string | null {
  const m = /(?:due(?:\s+date)?|needed\s+by|deliver(?:y)?\s+by|respond\s+by|quote\s+by)\s*[:\-]?\s*([^\n]{0,30})/i.exec(text);
  if (!m) return null;
  const s = m[1];
  let r = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (r) return toIsoDate(Number(r[1]), Number(r[2]), Number(r[3]));
  r = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (r) {
    const y = Number(r[3]) < 100 ? 2000 + Number(r[3]) : Number(r[3]);
    return toIsoDate(y, Number(r[1]), Number(r[2]));
  }
  r = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(s);
  if (r) {
    const mi = MONTHS.indexOf(r[1].toLowerCase());
    if (mi >= 0) return toIsoDate(Number(r[3]), mi + 1, Number(r[2]));
  }
  return null;
}

export function findCertifications(text: string): string[] {
  return CERTIFICATIONS.filter((c) => c.pattern.test(text)).map((c) => {
    const m = c.pattern.exec(text);
    // Keep how the customer wrote it when it carries a year or revision (ISO 9001:2015, AS9100D).
    return m && /[:\d][a-z]?$/i.test(m[0].trim()) && m[0].trim().length > c.label.length - 2 ? m[0].trim().toUpperCase() : c.label;
  });
}

function keywordTable(routing: RoutingRule[]): { operation: string; words: string[] }[] {
  if (routing.length) {
    return routing.map((r) => ({ operation: r.operation, words: [r.operation, ...r.keywords].map((w) => w.toLowerCase()) }));
  }
  return Object.entries(DEFAULT_OPERATION_KEYWORDS).map(([operation, words]) => ({ operation, words }));
}

/** Operations named in a piece of text, using the shop's routing rules for the names. */
export function findOperations(text: string, routing: RoutingRule[]): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const { operation, words } of keywordTable(routing)) {
    if (words.some((w) => w && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower))) found.push(operation);
  }
  return found;
}

const QTY_PATTERNS = [
  /\b(?:qty|quantity)\s*[:=]?\s*([\d,]{1,9})\b/i,
  /\b([\d,]{1,9})\s*(?:pcs|pieces|piece|ea|each|units|off)\b/i,
  /(?:^|\s)[x×]\s*([\d,]{1,9})\b/i,
  /\b([\d,]{1,9})\s*[x×](?=\s|$)/i,
];
const PN_PATTERNS = [
  /\b(?:p\/n|pn|part\s*(?:number|no\.?|#))\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]{2,})/i,
  /\b([A-Z0-9]{2,}-[A-Z0-9-]{2,})\b/,
];

function parseQty(line: string): number | null {
  for (const p of QTY_PATTERNS) {
    const m = p.exec(line);
    if (m) {
      const n = Number(m[1].replace(/,/g, ''));
      if (Number.isInteger(n) && n > 0 && n <= 9_999_999) return n;
    }
  }
  return null;
}

function parsePartNumber(line: string): string | null {
  for (const p of PN_PATTERNS) {
    const m = p.exec(line);
    // A bare token such as 6061-T6 is a material, not a part number.
    if (m && /\d/.test(m[1]) && !findMaterial(m[1]) && !/^(?:iso|as)-?\d/i.test(m[1])) return m[1].toUpperCase();
  }
  return null;
}

function parseWeight(line: string): { weightLb: number | null; estimated: boolean } {
  const w = /(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kg)\b/i.exec(line);
  if (w) {
    const n = Number(w[1]);
    return { weightLb: /kg/i.test(w[2]) ? n * 2.20462262 : n, estimated: false };
  }
  const d = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:in\b|inch|inches|")/i.exec(line);
  if (d) {
    const density = densityOf(findMaterial(line));
    if (density) return { weightLb: Number(d[1]) * Number(d[2]) * Number(d[3]) * density, estimated: true };
  }
  return { weightLb: null, estimated: false };
}

function headerValue(text: string, label: RegExp): string | null {
  const m = new RegExp(`^\\s*(?:${label.source})\\s*[:\\-]\\s*(.+)$`, 'im').exec(text);
  return m ? m[1].trim() : null;
}

export function extractRfqText(text: string, routing: RoutingRule[]): ExtractedRfq {
  const certifications = findCertifications(text);
  const dueDate = findDueDate(text);

  // Request-wide statements ("Material: 6061-T6 aluminum", "Operations: milling, drilling") apply to every
  // part that doesn't say otherwise.
  const globalMaterialText = headerValue(text, /material|materials|alloy/);
  const globalMaterial = globalMaterialText ? canonicalMaterial(globalMaterialText) : null;
  const globalOpsText = headerValue(text, /operations?|processes|process|routing/);
  const globalOps = globalOpsText ? findOperations(globalOpsText, routing) : [];
  const globalFinish = headerValue(text, /finish|finishing|coating/);

  const parts: PartInput[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
    if (line.length < 4 || line.length > 400) continue;
    // Header-style lines describe the whole request, not a part.
    if (/^(?:material|materials|alloy|operations?|processes|process|routing|finish|finishing|coating|due|due date|certifications?|subject|from|to|date|customer|re|rfq|part count|files?)\s*[:\-]/i.test(line)) continue;
    const qty = parseQty(line);
    const partNumber = parsePartNumber(line);
    if (!qty || !partNumber) continue; // both are needed to call a line a part
    const material = findMaterial(line);
    const ops = findOperations(line, routing);
    const { weightLb, estimated } = parseWeight(line);
    const description = line
      .replace(partNumber, '')
      .replace(/\b(?:p\/n|pn|part\s*(?:number|no\.?|#))\s*[:#]?/gi, '')
      .replace(/\b(?:qty|quantity)\s*[:=]?\s*[\d,]+/gi, '')
      .replace(/[\s,;:|-]+$/g, '')
      .replace(/^[\s,;:|-]+/g, '')
      .trim();
    parts.push({
      partNumber,
      description: (description || partNumber).slice(0, 200),
      material: material ?? globalMaterial,
      qty,
      operations: ops.length ? ops : globalOps,
      weightLb,
      weightEstimated: estimated,
      finish: globalFinish,
    });
  }
  return { parts: parts.slice(0, 200), dueDate, certifications };
}
