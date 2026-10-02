import { NextRequest, NextResponse } from 'next/server';
import { syncHts, syncScreeningList } from '@/lib/refdata/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Downloading and loading the lists takes a while. On hosts that cap function time,
// run `npm run refdata:sync` from a scheduled job instead (see the README).
export const maxDuration = 300;

/** Signed-in users refresh the official tariff and screening list. Body: { dataset: "hts" | "csl" | "all" }. */
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => ({}))) as { dataset?: string };
  const want = b.dataset ?? 'all';
  if (!['hts', 'csl', 'all'].includes(want)) return NextResponse.json({ error: 'dataset must be "hts", "csl" or "all".' }, { status: 400 });
  const results: unknown[] = [];
  const errors: string[] = [];
  for (const [name, fn] of [['hts', syncHts], ['csl', syncScreeningList]] as const) {
    if (want !== 'all' && want !== name) continue;
    try {
      results.push(await fn());
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }
  return NextResponse.json({ results, errors }, { status: errors.length && !results.length ? 502 : 200 });
}
