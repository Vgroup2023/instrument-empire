// The Harmonized Tariff Schedule as published by the USITC, held in memory for
// lookup and for finding candidate lines for a product description. Pure: rows
// come in from the database (or a test), nothing here touches the network.

export interface HtsRow {
  htsno: string;
  indent: number;
  description: string;
  path: string;
  general: string | null;
  special: string | null;
  other: string | null;
  units: string[];
  chapter: number;
}

interface RawHts {
  htsno?: string;
  indent?: string | number;
  description?: string;
  general?: string;
  special?: string;
  other?: string;
  units?: string[] | null;
}

export const digitsOf = (code: string) => code.replace(/\D/g, '');

/** 8507600010 -> 8507.60.00.10 */
export function formatHts(code: string): string {
  const d = digitsOf(code);
  const parts = [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean);
  return parts.join('.');
}

const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/**
 * Turns the USITC export (a flat list where indentation shows the hierarchy)
 * into rows that carry their full path and the duty rate they inherit. Statistical
 * suffix lines ("8507.60.00.10") leave the general rate blank; it lives on the line above.
 */
export function buildHtsRows(raw: RawHts[]): HtsRow[] {
  const stack: { desc: string; general: string }[] = [];
  const out: HtsRow[] = [];
  for (const r of raw) {
    const indent = Math.max(0, Number(r.indent ?? 0) || 0);
    const description = strip(r.description ?? '').replace(/:$/, '');
    stack.length = indent;
    stack[indent] = { desc: description, general: strip(r.general ?? '') };
    const htsno = (r.htsno ?? '').trim();
    if (!htsno) continue;
    let general = '';
    for (let i = indent; i >= 0 && !general; i--) general = stack[i]?.general ?? '';
    const digits = digitsOf(htsno);
    out.push({
      htsno,
      indent,
      description,
      path: stack
        .slice(0, indent + 1)
        .map((s) => s?.desc)
        .filter(Boolean)
        .join(' > '),
      general: general || null,
      special: strip(r.special ?? '') || null,
      other: strip(r.other ?? '') || null,
      units: r.units ?? [],
      chapter: Number(digits.slice(0, 2)),
    });
  }
  return out;
}

export type HtsLookup =
  | { status: 'exact'; row: HtsRow }
  | { status: 'suffix_unknown'; row: HtsRow }
  | { status: 'unknown' };

export interface HtsCandidate {
  row: HtsRow;
  score: number;
}

const STOP = new Set(['of', 'the', 'and', 'or', 'for', 'to', 'in', 'a', 'an', 'with', 'than', 'other', 'not', 'whether', 'nesoi', 'n', 'e', 's', 'o', 'i']);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export class HtsIndex {
  private byCode = new Map<string, HtsRow>();
  private leaves: { row: HtsRow; tokens: Set<string> }[] = [];
  private postings = new Map<string, number[]>();
  private idf = new Map<string, number>();
  readonly size: number;

  constructor(rows: HtsRow[]) {
    this.size = rows.length;
    for (const r of rows) this.byCode.set(digitsOf(r.htsno), r);
    // A leaf is a line nothing sits under. Chapters 98 and 99 are special
    // provisions, not places a product is classified, so they are not candidates.
    const sorted = rows;
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const d = digitsOf(r.htsno);
      if (d.length < 8 || r.chapter >= 98) continue;
      const next = sorted[i + 1];
      if (next && digitsOf(next.htsno).startsWith(d) && digitsOf(next.htsno).length > d.length) continue;
      this.leaves.push({ row: r, tokens: new Set(tokenize(`${r.path}`)) });
    }
    this.leaves.forEach((l, idx) => {
      for (const t of l.tokens) {
        const p = this.postings.get(t) ?? [];
        p.push(idx);
        this.postings.set(t, p);
      }
    });
    for (const [t, p] of this.postings) this.idf.set(t, Math.log(1 + this.leaves.length / p.length));
  }

  lookup(code: string): HtsLookup {
    const d = digitsOf(code);
    const exact = this.byCode.get(d);
    if (exact) return { status: 'exact', row: exact };
    if (d.length === 10) {
      const parent = this.byCode.get(d.slice(0, 8));
      if (parent) return { status: 'suffix_unknown', row: parent };
    }
    return { status: 'unknown' };
  }

  /** Whether a 4-digit heading (or longer prefix) exists in the schedule. */
  hasHeading(prefix: string): boolean {
    const d = digitsOf(prefix);
    return d.length >= 4 && this.byCode.has(d.slice(0, 4));
  }

  /**
   * Lines whose full description shares the most (rarest) words with the text.
   * With `headings`, only lines under those 4-digit headings are considered.
   */
  candidates(text: string, n = 25, headings?: string[]): HtsCandidate[] {
    const q = [...new Set(tokenize(text))];
    const scoped = headings?.length ? new Set(headings.map((h) => digitsOf(h).slice(0, 4))) : null;
    const scores = new Map<number, number>();
    if (scoped) {
      // Every leaf under the headings is a candidate, even with no word in common.
      this.leaves.forEach((l, idx) => {
        if (scoped.has(digitsOf(l.row.htsno).slice(0, 4))) scores.set(idx, 0);
      });
    }
    for (const t of q) {
      const w = this.idf.get(t);
      if (!w) continue;
      for (const idx of this.postings.get(t) ?? []) {
        if (scoped && !scores.has(idx)) continue;
        scores.set(idx, (scores.get(idx) ?? 0) + w);
      }
    }
    return [...scores]
      .map(([idx, s]) => ({ row: this.leaves[idx].row, score: s / Math.sqrt(this.leaves[idx].tokens.size) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  }
}
