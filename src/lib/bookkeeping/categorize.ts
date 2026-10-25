import { askJson, llmEnabled, str, type LlmClient } from '@/lib/llm/json';

// The rules behind the AI bookkeeping copilot. Everything here is a pure
// function except suggestWithAi, so it can be tested without a database.
// Order of trust: a rule the person wrote, then what they approved before for
// the same merchant, then Claude (when a key is set). Nothing here posts
// anything; it only says what it would book and how sure it is.

export type Source = 'rule' | 'history' | 'ai';

export interface Rule {
  id: string;
  pattern: string;
  accountId: string;
  vendorId: string | null;
  autoPost: boolean;
}

export interface HistoryRow {
  merchantKey: string;
  accountId: string;
  uses: number;
}

export interface Suggestion {
  accountId: string;
  vendorId: string | null;
  confidence: number;
  source: Source;
  reason: string;
  ruleId?: string;
  autoPost: boolean;
}

/** Highest confidence the model alone can reach. A person's rule or repeated approvals can go higher. */
export const AI_CONFIDENCE_CAP = 85;
/** Lines at or above this can be approved in one click. */
export const CONFIDENT = 90;

const NOISE = new Set([
  'POS', 'DEBIT', 'CREDIT', 'CARD', 'PURCHASE', 'PAYMENT', 'PMT', 'ACH', 'CHECKCARD', 'RECURRING', 'ONLINE', 'WEB', 'AUTOPAY', 'ID', 'REF', 'THE', 'INC', 'LLC', 'CO', 'CORP', 'LTD',
]);

/** A stable key for "the same merchant": upper case, numbers, dates and filler words removed. */
export function merchantKey(description: string): string {
  const words = description
    .toUpperCase()
    .replace(/[0-9]+/g, ' ')
    .replace(/[^A-Z&]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !NOISE.has(w));
  return words.slice(0, 3).join(' ') || 'UNKNOWN';
}

export function fingerprint(date: string, amount: number, description: string, occurrence: number): string {
  return `${date}|${amount.toFixed(2)}|${description.trim().toUpperCase().replace(/\s+/g, ' ')}|${occurrence}`;
}

export function matchRule(description: string, rules: Rule[]): Rule | null {
  const hay = description.toUpperCase();
  const key = merchantKey(description);
  let best: Rule | null = null;
  for (const r of rules) {
    const p = r.pattern.trim().toUpperCase();
    if (!p) continue;
    if (hay.includes(p) || key.includes(p)) {
      // The most specific (longest) pattern wins.
      if (!best || p.length > best.pattern.trim().length) best = r;
    }
  }
  return best;
}

export interface RuleIssue {
  kind: 'duplicate' | 'conflict' | 'overlap';
  message: string;
}

/**
 * Rules that step on each other, so the person can fix them instead of getting whichever matched first.
 * duplicate: same words, same account. conflict: same words, different accounts (the result depends on order).
 * overlap: one pattern sits inside another and they book differently (the longer one wins; worth knowing).
 */
export function findRuleIssues(rules: Pick<Rule, 'id' | 'pattern' | 'accountId'>[]): Map<string, RuleIssue[]> {
  const out = new Map<string, RuleIssue[]>();
  const add = (id: string, issue: RuleIssue) => out.set(id, [...(out.get(id) ?? []), issue]);
  const norm = (r: { pattern: string }) => r.pattern.trim().toUpperCase().replace(/\s+/g, ' ');
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i];
      const b = rules[j];
      const pa = norm(a);
      const pb = norm(b);
      if (!pa || !pb) continue;
      if (pa === pb) {
        const same = a.accountId === b.accountId;
        const issue: RuleIssue = same
          ? { kind: 'duplicate', message: `Duplicate: "${b.pattern.trim()}" already books to this account. Remove one.` }
          : { kind: 'conflict', message: `Conflict: "${b.pattern.trim()}" books to a different account, so which one applies depends on order. Keep one.` };
        add(a.id, issue);
        add(b.id, same ? { kind: 'duplicate', message: `Duplicate: "${a.pattern.trim()}" already books to this account. Remove one.` } : { kind: 'conflict', message: `Conflict: "${a.pattern.trim()}" books to a different account, so which one applies depends on order. Keep one.` });
      } else if (a.accountId !== b.accountId && (pa.includes(pb) || pb.includes(pa))) {
        const [long, short] = pa.length > pb.length ? [a, b] : [b, a];
        add(short.id, { kind: 'overlap', message: `Overlap: "${long.pattern.trim()}" is more specific and books elsewhere, so it wins when both match.` });
        add(long.id, { kind: 'overlap', message: `Overlap: "${short.pattern.trim()}" is broader and books elsewhere. This rule wins when both match.` });
      }
    }
  }
  return out;
}

/** What the person approved before for this merchant. Needs a clear majority and grows with repetition. */
export function fromHistory(key: string, history: HistoryRow[]): Suggestion | null {
  const rows = history.filter((h) => h.merchantKey === key);
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.uses, 0);
  const top = [...rows].sort((a, b) => b.uses - a.uses)[0];
  const share = top.uses / total;
  if (share < 0.6) return null;
  const base = total >= 3 ? 92 : total === 2 ? 82 : 70;
  return {
    accountId: top.accountId,
    vendorId: null,
    confidence: Math.round(base * (share === 1 ? 1 : share)),
    source: 'history',
    reason: `You booked ${top.uses} of ${total} earlier ${key} payments to this account.`,
    autoPost: false,
  };
}

export interface ExpenseAccountOption {
  id: string;
  name: string;
  type: string;
}

const SYSTEM = `You are a bookkeeper's assistant. For each bank or card transaction, pick the single best expense account from the list provided, using only the description and amount.
Return JSON: {"results":[{"i":number,"accountId":string|null,"confidence":number,"reason":string}]} where i is the transaction index, accountId is exactly one id from the list or null when you cannot tell, confidence is 0-100, and reason is one short sentence. Never invent an account id.`;

export interface AiInput {
  i: number;
  description: string;
  amount: number;
}

/** Claude's best guess per line, checked against the real chart of accounts. Returns an empty map without a key or on any failure. */
export async function suggestWithAi(
  items: AiInput[],
  accounts: ExpenseAccountOption[],
  client?: LlmClient,
): Promise<Map<number, Suggestion>> {
  const out = new Map<number, Suggestion>();
  if (items.length === 0 || accounts.length === 0) return out;
  if (!client && !llmEnabled()) return out;
  const valid = new Set(accounts.map((a) => a.id));
  const payload = JSON.stringify({
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type })),
    transactions: items.map((t) => ({ i: t.i, description: t.description.slice(0, 160), amount: Math.abs(t.amount) })),
  });
  const raw = await askJson(SYSTEM, payload, { client, maxTokens: 2500 });
  const results = raw && typeof raw === 'object' ? (raw as { results?: unknown }).results : null;
  if (!Array.isArray(results)) return out;
  for (const r of results.slice(0, items.length)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const i = typeof o.i === 'number' ? o.i : -1;
    const accountId = typeof o.accountId === 'string' ? o.accountId : null;
    if (!accountId || !valid.has(accountId) || !items.some((t) => t.i === i)) continue;
    const conf = typeof o.confidence === 'number' && Number.isFinite(o.confidence) ? Math.max(0, Math.min(100, Math.round(o.confidence))) : 0;
    out.set(i, {
      accountId,
      vendorId: null,
      confidence: Math.min(conf, AI_CONFIDENCE_CAP),
      source: 'ai',
      reason: str(o.reason, 200) ?? 'Suggested from the description.',
      autoPost: false,
    });
  }
  return out;
}

/** The vendor whose name appears in the description, if exactly one does. */
export function vendorFromDescription(description: string, vendors: { id: string; name: string }[]): string | null {
  const hay = description.toUpperCase();
  const hits = vendors.filter((v) => v.name.trim().length >= 4 && hay.includes(v.name.trim().toUpperCase()));
  return hits.length === 1 ? hits[0].id : null;
}
