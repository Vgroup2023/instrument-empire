// Name matching against the Consolidated Screening List. Pure, so it can be
// tested on its own. It reports possible matches for a person to look at; it
// is not a legal determination, and a clear result is not proof a party is clean.

export interface ScreeningEntry {
  id: string;
  source: string;
  type: string | null;
  name: string;
  altNames: string[];
  programs: string | null;
}

export interface ScreeningMatch {
  entry: ScreeningEntry;
  matchedName: string;
  /** 1 means the names are identical after tidying. */
  score: number;
  kind: 'exact' | 'close';
}

const LEGAL_SUFFIXES = new Set([
  'inc', 'incorporated', 'ltd', 'limited', 'llc', 'llp', 'lp', 'co', 'corp', 'corporation', 'company', 'plc', 'gmbh', 'ag', 'sa', 'sarl', 'srl', 'spa', 'bv', 'nv', 'oy', 'ab', 'as', 'pte', 'pty', 'sdn', 'bhd', 'jsc', 'ooo', 'zao', 'the', 'of', 'and',
]);

export function normalizeName(raw: string): string[] {
  const folded = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9Ѐ-ӿ؀-ۿ一-鿿 ]/g, ' ');
  return folded.split(/\s+/).filter((t) => t && !LEGAL_SUFFIXES.has(t));
}

function dice(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

interface IndexedName {
  entry: ScreeningEntry;
  name: string;
  tokens: Set<string>;
  key: string;
}

export class ScreeningIndex {
  private byToken = new Map<string, IndexedName[]>();
  private byKey = new Map<string, IndexedName[]>();
  readonly size: number;

  constructor(entries: ScreeningEntry[]) {
    let n = 0;
    for (const entry of entries) {
      for (const name of [entry.name, ...entry.altNames]) {
        const tokens = normalizeName(name);
        if (!tokens.length) continue;
        const item: IndexedName = { entry, name, tokens: new Set(tokens), key: [...new Set(tokens)].sort().join(' ') };
        n += 1;
        const k = this.byKey.get(item.key) ?? [];
        k.push(item);
        this.byKey.set(item.key, k);
        for (const t of item.tokens) {
          const list = this.byToken.get(t) ?? [];
          list.push(item);
          this.byToken.set(t, list);
        }
      }
    }
    this.size = n;
  }

  /**
   * Same words in any order is an exact match. Otherwise the names must share
   * most of their words (Dice score of at least `threshold`). One-word names
   * only ever match exactly, because a lone common word matches too much.
   */
  screen(name: string, threshold = 0.8): ScreeningMatch[] {
    const tokens = new Set(normalizeName(name));
    if (!tokens.size) return [];
    const key = [...tokens].sort().join(' ');
    const found = new Map<string, ScreeningMatch>();

    for (const item of this.byKey.get(key) ?? []) {
      found.set(item.entry.id, { entry: item.entry, matchedName: item.name, score: 1, kind: 'exact' });
    }
    if (tokens.size >= 2) {
      const seen = new Set<IndexedName>();
      for (const t of tokens) {
        for (const item of this.byToken.get(t) ?? []) {
          if (seen.has(item) || item.tokens.size < 2) continue;
          seen.add(item);
          const score = dice(tokens, item.tokens);
          if (score >= threshold && (found.get(item.entry.id)?.score ?? 0) < score) {
            found.set(item.entry.id, { entry: item.entry, matchedName: item.name, score, kind: score === 1 ? 'exact' : 'close' });
          }
        }
      }
    }
    return [...found.values()].sort((a, b) => b.score - a.score).slice(0, 5);
  }
}
