import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { htsCodes, referenceSyncs, screeningEntries } from '@/db/schema';
import { HtsIndex } from '@/lib/hts';
import { ScreeningIndex } from '@/lib/screening/match';

// Loading 26,000 screening entries and 30,000 tariff lines is the slow part, so
// the built indexes are kept until a newer sync lands.
const cache: { hts?: { at: number; index: HtsIndex }; csl?: { at: number; index: ScreeningIndex } } = {};

async function lastSync(dataset: 'hts' | 'csl') {
  const [row] = await getDb()
    .select()
    .from(referenceSyncs)
    .where(and(eq(referenceSyncs.dataset, dataset), isNull(referenceSyncs.error)))
    .orderBy(desc(referenceSyncs.syncedAt))
    .limit(1);
  return row ?? null;
}

export async function loadHtsIndex(): Promise<HtsIndex | null> {
  const s = await lastSync('hts');
  if (!s) return null;
  const at = s.syncedAt.getTime();
  if (cache.hts?.at === at) return cache.hts.index;
  const rows = await getDb().select().from(htsCodes);
  const index = new HtsIndex(rows.map((r) => ({ ...r, units: r.units })).sort((a, b) => a.htsno.localeCompare(b.htsno, 'en', { numeric: true })));
  cache.hts = { at, index };
  return index;
}

export async function loadScreeningIndex(): Promise<ScreeningIndex | null> {
  const s = await lastSync('csl');
  if (!s) return null;
  const at = s.syncedAt.getTime();
  if (cache.csl?.at === at) return cache.csl.index;
  const rows = await getDb().select().from(screeningEntries);
  const index = new ScreeningIndex(rows);
  cache.csl = { at, index };
  return index;
}

export async function syncStatus() {
  const [hts, csl] = await Promise.all([lastSync('hts'), lastSync('csl')]);
  return {
    hts: hts ? { at: hts.syncedAt.toISOString(), rows: hts.rowCount } : null,
    csl: csl ? { at: csl.syncedAt.toISOString(), rows: csl.rowCount } : null,
  };
}
