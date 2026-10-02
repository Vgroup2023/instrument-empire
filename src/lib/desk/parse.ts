// Pure text reading for the customer desk: pulling an order out of free text,
// and working out what a customer is asking. No database, no network, so the
// rules can be tested directly. Customer text is untrusted input throughout.

export interface ParsedLine {
  sku?: string;
  description: string;
  quantity: number;
}

export interface ParsedAddress {
  line1?: string;
  city?: string;
  region?: string;
  postal?: string;
  country?: string;
}

export interface ParsedOrder {
  customerName?: string;
  email?: string;
  poNumber?: string;
  lines: ParsedLine[];
  shipTo: ParsedAddress;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const STREET_RE = /^\d+\s+.*\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|pkwy|parkway|hwy|suite|ste|unit|apt)\b\.?/i;
const LABEL_RE = /^\s*(ship(?:ping)?\s*to|deliver(?:y)?\s*to|address|name|customer|from|po|p\.o\.|purchase order|email|e-mail|phone|tel|date|subject|items?|order)\b\s*[:#]/i;
const SKU_RE = /^[A-Z0-9]{2,}(?:-[A-Z0-9]+)+$/;

export function normalizeCountry(raw: string): string {
  const c = raw.trim().replace(/\./g, '').toUpperCase();
  if (['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'].includes(c)) return 'US';
  if (['CA', 'CAN', 'CANADA'].includes(c)) return 'CA';
  if (['UK', 'GB', 'GBR', 'UNITED KINGDOM', 'ENGLAND'].includes(c)) return 'GB';
  if (['MX', 'MEXICO'].includes(c)) return 'MX';
  return c;
}

function parseAddressBlock(block: string[]): ParsedAddress {
  const lines = block.map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return {};
  // One comma-separated line: "123 Main St, Springfield, IL 62704"
  const parts = lines.length === 1 ? lines[0].split(',').map((p) => p.trim()).filter(Boolean) : lines;
  const addr: ParsedAddress = {};
  const tail = parts[parts.length - 1];

  // "Springfield, IL 62704" or "Springfield IL 62704 USA" on the last line.
  const cityLine = tail.match(/^(.*?),?\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)(?:\s+(.+))?$/);
  const regionOnly = tail.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (cityLine && cityLine[1]) {
    addr.city = cityLine[1].trim();
    addr.region = cityLine[2].toUpperCase();
    addr.postal = cityLine[3];
    addr.country = cityLine[4] ? normalizeCountry(cityLine[4]) : 'US';
    addr.line1 = parts.slice(0, -1).join(', ') || undefined;
  } else if (regionOnly && parts.length >= 2) {
    addr.region = regionOnly[1].toUpperCase();
    addr.postal = regionOnly[2];
    addr.country = 'US';
    addr.city = parts[parts.length - 2];
    addr.line1 = parts.slice(0, -2).join(', ') || undefined;
  } else {
    // A trailing country name on its own line, e.g. "Canada".
    if (parts.length >= 2 && /^[A-Za-z .]{2,}$/.test(tail) && !STREET_RE.test(tail)) {
      addr.country = normalizeCountry(tail);
      const rest = parts.slice(0, -1);
      const pc = rest[rest.length - 1]?.match(/^(.*?)\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}|\d{4,6})$/i);
      if (pc) {
        addr.city = pc[1].trim() || undefined;
        addr.postal = pc[2].toUpperCase();
        addr.line1 = rest.slice(0, -1).join(', ') || undefined;
      } else {
        addr.line1 = rest.join(', ');
      }
    } else {
      addr.line1 = parts.join(', ');
    }
  }
  return addr;
}

function findAddressBlock(lines: string[]): { block: string[]; from: number; to: number } | null {
  const start = lines.findIndex((l) => /^\s*(ship(?:ping)?\s*to|deliver(?:y)?\s*to|shipping address|address)\s*:?/i.test(l));
  if (start < 0) return null;
  const first = lines[start].replace(/^\s*(ship(?:ping)?\s*to|deliver(?:y)?\s*to|shipping address|address)\s*:?\s*/i, '');
  const block: string[] = first.trim() ? [first] : [];
  let i = start + 1;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || LABEL_RE.test(l)) break;
    block.push(l);
  }
  return { block, from: start, to: i };
}

export function parseOrderText(raw: string): ParsedOrder {
  const text = raw.replace(/\r/g, '');
  const lines = text.split('\n');
  const out: ParsedOrder = { lines: [], shipTo: {} };

  const email = text.match(EMAIL_RE);
  if (email) out.email = email[0].toLowerCase();

  const po = text.match(/\b(?:P\.?O\.?|purchase order)\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-/]{2,})/i);
  if (po) out.poNumber = po[1].toUpperCase();

  const name = text.match(/^\s*(?:name|customer|from)\s*:\s*([^\n<]+)/im);
  if (name) out.customerName = name[1].trim();

  const addr = findAddressBlock(lines);
  if (addr) out.shipTo = parseAddressBlock(addr.block);

  lines.forEach((rawLine, idx) => {
    if (addr && idx >= addr.from && idx < addr.to) return;
    const line = rawLine.replace(/^\s*[-*•]\s*/, '').trim();
    if (!line || LABEL_RE.test(line) && !/^\s*items?\s*:/i.test(line) || EMAIL_RE.test(line) && line.length < 60 && !/\d+\s*(x|×)/i.test(line)) return;
    const body = line.replace(/^\s*items?\s*:\s*/i, '');
    if (!body || STREET_RE.test(body)) return;

    // "2 x Blue widget", "10 pcs SKU-12 Blue widget", "3 Blue widget"
    let m = body.match(/^(\d{1,5})\s*(?:x|×|pcs?\.?|units?|ea\.?)?\s+(.*[A-Za-z].*)$/i);
    let qty: number | null = null;
    let desc = '';
    if (m) {
      qty = Number(m[1]);
      desc = m[2];
    } else if ((m = body.match(/^(.*[A-Za-z].*?)\s*(?:x|×)\s*(\d{1,5})$/i))) {
      desc = m[1];
      qty = Number(m[2]);
    } else if ((m = body.match(/^(.*[A-Za-z].*?)\s*[,\-–:]\s*(?:qty|quantity)\s*[:=]?\s*(\d{1,5})$/i))) {
      desc = m[1];
      qty = Number(m[2]);
    }
    if (qty === null || !desc.trim()) return;

    desc = desc.replace(/^[-–:]\s*/, '').trim();
    const first = desc.split(/\s+/)[0];
    let sku: string | undefined;
    if (SKU_RE.test(first.toUpperCase()) && /\d/.test(first)) {
      sku = first.toUpperCase();
      desc = desc.slice(first.length).replace(/^[\s\-–:]+/, '').trim() || first;
    }
    out.lines.push({ sku, description: desc, quantity: qty });
  });

  return out;
}

export type Intent = 'order_status' | 'cancel' | 'change_address' | 'return' | 'complaint' | 'other';

const INTENT_RULES: { intent: Intent; re: RegExp }[] = [
  { intent: 'complaint', re: /\b(lawyer|attorney|sue you|legal action|chargeback|dispute[ds]?|fraud|scam|unacceptable|furious|outraged|worst|terrible|disgusted|report you|bbb|never again)\b/i },
  { intent: 'cancel', re: /\b(cancel|cancell?ation|cancelling|do not ship|don'?t ship|stop (?:the |my )?order)\b/i },
  { intent: 'change_address', re: /\b(?:change|update|wrong|correct|different|new|incorrect)\b[^.\n]{0,30}\b(?:address|ship(?:ping)? to)\b|\baddress\b[^.\n]{0,30}\b(?:change|wrong|incorrect|update)\b/i },
  { intent: 'return', re: /\b(return|refund|exchange|replacement|replace|damaged|broken|defective|wrong item|missing item|doesn'?t work|not working)\b/i },
  { intent: 'order_status', re: /\b(where(?:'s| is| are)|status|track(?:ing)?|when (?:will|does|is|should)|eta|delivery (?:date|time)|has (?:it|my order) shipped|shipped yet|arrive|arrived|update on)\b/i },
];

export function classifyIntent(subject: string | null | undefined, body: string): { intent: Intent; confidence: number } {
  const text = `${subject ?? ''}\n${body}`;
  for (const rule of INTENT_RULES) {
    if (rule.re.test(text)) return { intent: rule.intent, confidence: 0.85 };
  }
  return { intent: 'other', confidence: 0.4 };
}

export const ORDER_NUMBER_RE = /\bSO-\d{6}-[A-Z0-9]{4}\b/i;

export function extractOrderNumber(text: string): string | null {
  const m = text.match(ORDER_NUMBER_RE);
  return m ? m[0].toUpperCase() : null;
}

/** Mail that must never get an automatic reply: bounces, no-reply senders, out-of-office. */
export function isAutoGenerated(from: string, subject: string | null | undefined, body: string): boolean {
  if (/(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce)/i.test(from)) return true;
  if (/^\s*(auto(matic)?[ -]?reply|out of office|undeliverable|delivery status|automatic reply)/i.test(subject ?? '')) return true;
  return /this is an automated (message|reply|email)/i.test(body.slice(0, 500));
}
