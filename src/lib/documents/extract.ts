import type Anthropic from '@anthropic-ai/sdk';
import { askJson, str, type LlmClient } from '@/lib/llm/json';

// Reads a commercial invoice or packing list (PDF or image) with Claude and
// returns fields a person confirms before they touch a shipment. Nothing read
// here is trusted: numbers are re-checked, and the lines are cross-checked
// against the stated total.

export const ACCEPTED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type AcceptedMime = (typeof ACCEPTED_MIME)[number];
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

export interface ExtractedLine {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  htsCode: string | null;
  originCountry: string | null;
}

export interface ExtractedInvoice {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  seller: string | null;
  buyer: string | null;
  currency: string | null;
  total: number | null;
  lines: ExtractedLine[];
  /** Plain-language problems found when checking the numbers. */
  warnings: string[];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** Pure: validates what the model returned and cross-checks the arithmetic. */
export function validateInvoice(raw: unknown): ExtractedInvoice | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.lines)) return null;
  const lines: ExtractedLine[] = [];
  for (const l of r.lines.slice(0, 200)) {
    if (!l || typeof l !== 'object') continue;
    const x = l as Record<string, unknown>;
    const description = str(x.description, 300);
    if (!description) continue;
    lines.push({
      description,
      quantity: num(x.quantity),
      unitPrice: num(x.unit_price),
      amount: num(x.amount),
      htsCode: str(x.hts_code, 20) ?? null,
      originCountry: str(x.origin_country, 60) ?? null,
    });
  }
  const out: ExtractedInvoice = {
    invoiceNumber: str(r.invoice_number, 60) ?? null,
    invoiceDate: str(r.invoice_date, 20) ?? null,
    seller: str(r.seller, 200) ?? null,
    buyer: str(r.buyer, 200) ?? null,
    currency: str(r.currency, 6)?.toUpperCase() ?? null,
    total: num(r.total),
    lines,
    warnings: [],
  };
  if (!lines.length) out.warnings.push('No line items were found.');
  for (const l of lines) {
    if (l.quantity !== null && l.unitPrice !== null && l.amount !== null) {
      const expected = l.quantity * l.unitPrice;
      if (Math.abs(expected - l.amount) > Math.max(0.05, expected * 0.01)) {
        out.warnings.push(`"${l.description}": ${l.quantity} x ${l.unitPrice} is ${expected.toFixed(2)}, but the invoice says ${l.amount.toFixed(2)}.`);
      }
    }
  }
  const amounts = lines.map((l) => l.amount);
  if (out.total !== null && amounts.length && amounts.every((a): a is number => a !== null)) {
    const sum = amounts.reduce((t, a) => t + a, 0);
    if (Math.abs(sum - out.total) > Math.max(0.05, out.total * 0.01)) {
      out.warnings.push(`Line amounts add up to ${sum.toFixed(2)}, but the invoice total says ${out.total.toFixed(2)}.`);
    }
  }
  if (out.currency && out.currency !== 'USD') out.warnings.push(`The invoice is in ${out.currency}. Values were not converted to USD.`);
  return out;
}

export async function extractInvoice(bytes: Buffer, mime: AcceptedMime, client?: LlmClient): Promise<ExtractedInvoice | null> {
  const data = bytes.toString('base64');
  const file: Anthropic.ContentBlockParam =
    mime === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: mime, data } };
  const raw = await askJson(
    'You read commercial invoices for a customs broker and copy out exactly what the document says.',
    [
      file,
      {
        type: 'text',
        text: 'Read this commercial invoice. Return {"invoice_number": string|null, "invoice_date": "YYYY-MM-DD"|null, "seller": string|null, "buyer": string|null, "currency": ISO code|null, "total": number|null, "lines": [{"description": string, "quantity": number|null, "unit_price": number|null, "amount": number|null, "hts_code": string|null, "origin_country": string|null}]}. Copy numbers exactly as printed. Do not calculate or fix anything.',
      },
    ],
    { client, maxTokens: 8000, effort: 'medium' },
  );
  return validateInvoice(raw);
}
