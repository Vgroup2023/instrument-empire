import { askJson, llmEnabled, str, type LlmClient } from '@/lib/llm/json';
import { ORDER_NUMBER_RE, type Intent, type ParsedOrder } from './parse';

// The model only reads text and returns structured fields. It never writes the
// reply (replies come from templates filled with order-record facts) and never
// triggers an action: policy.ts decides what happens next. Customer text is
// untrusted, so the system prompt treats it as data and anything the model
// returns is validated before use. With no ANTHROPIC_API_KEY, or on any error,
// the desk falls back to the plain rules in parse.ts.

export { llmEnabled, type LlmClient };

const INTENTS: Intent[] = ['order_status', 'cancel', 'change_address', 'return', 'complaint', 'other'];

export interface LlmMessageReading {
  intent: Intent;
  orderNumber?: string;
  newAddress?: string;
}

export async function readMessageWithLlm(subject: string | null, body: string, client?: LlmClient): Promise<LlmMessageReading | null> {
  const raw = await askJson(
    'You read customer emails for an order desk.',
    `Classify this customer email. Return {"intent": one of ${INTENTS.join(' | ')}, "order_number": string|null (format SO-123456-AB12), "new_address": string|null (only if they give a new delivery address)}.\n\nSubject: ${subject ?? ''}\n\n${body.slice(0, 6000)}`,
    { client },
  );
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.intent !== 'string' || !INTENTS.includes(r.intent as Intent)) return null;
  const orderNumber = str(r.order_number, 40)?.toUpperCase();
  return {
    intent: r.intent as Intent,
    orderNumber: orderNumber && ORDER_NUMBER_RE.test(orderNumber) ? orderNumber : undefined,
    newAddress: str(r.new_address, 300),
  };
}

export async function readOrderWithLlm(text: string, client?: LlmClient): Promise<ParsedOrder | null> {
  const raw = await askJson(
    'You read customer orders for an order desk.',
    `Extract the order from this text. Return {"customer_name": string|null, "email": string|null, "po_number": string|null, "lines": [{"sku": string|null, "description": string, "quantity": integer}], "ship_to": {"line1": string|null, "city": string|null, "region": string|null, "postal": string|null, "country": string|null}}. Use an empty lines array if there is no order.\n\n${text.slice(0, 8000)}`,
    { client },
  );
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.lines)) return null;
  const lines: ParsedOrder['lines'] = [];
  for (const l of r.lines.slice(0, 100)) {
    if (!l || typeof l !== 'object') continue;
    const x = l as Record<string, unknown>;
    const description = str(x.description, 200);
    const quantity = typeof x.quantity === 'number' ? Math.trunc(x.quantity) : NaN;
    if (!description || Number.isNaN(quantity)) continue;
    lines.push({ description, quantity, sku: str(x.sku, 60)?.toUpperCase() });
  }
  const s = (r.ship_to && typeof r.ship_to === 'object' ? r.ship_to : {}) as Record<string, unknown>;
  return {
    customerName: str(r.customer_name, 120),
    email: str(r.email, 200)?.toLowerCase(),
    poNumber: str(r.po_number, 60)?.toUpperCase(),
    lines,
    shipTo: { line1: str(s.line1), city: str(s.city, 100), region: str(s.region, 50), postal: str(s.postal, 20), country: str(s.country, 60) },
  };
}
