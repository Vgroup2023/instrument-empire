import { getDb } from '@/db/client';
import { htsCodes, referenceSyncs, screeningEntries } from '@/db/schema';
import { buildHtsRows } from '@/lib/hts';
import { parseCsvObjects } from './csv';

// Downloads the public datasets and replaces the local copy in one transaction.
// Both are keyless: the USITC HTS export and the trade.gov bulk CSV of the
// Consolidated Screening List. A download that looks truncated or wrong is
// refused, so a bad day upstream cannot empty the tables.

export const HTS_URL = 'https://hts.usitc.gov/reststop/exportList?from=0101&to=9999&format=JSON&styles=false';
export const CSL_URL = 'https://data.trade.gov/downloadable_consolidated_screening_list/v1/consolidated.csv';
const MIN_HTS_ROWS = 20_000;
const MIN_CSL_ROWS = 5_000;
const CHUNK = 500;

export type Dataset = 'hts' | 'csl';
export interface SyncResult {
  dataset: Dataset;
  rows: number;
}

async function download(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Download failed: ${url} returned ${res.status}.`);
  return res.text();
}

async function record(dataset: Dataset, rowCount: number, error?: string) {
  await getDb().insert(referenceSyncs).values({ dataset, rowCount, error: error ?? null });
}

export async function syncHts(): Promise<SyncResult> {
  try {
    const raw = JSON.parse(await download(HTS_URL));
    if (!Array.isArray(raw)) throw new Error('The HTS export was not a list.');
    const rows = buildHtsRows(raw);
    if (rows.length < MIN_HTS_ROWS) throw new Error(`Only ${rows.length} HTS lines came back (expected more than ${MIN_HTS_ROWS}). Keeping the existing copy.`);
    const seen = new Set<string>();
    const unique = rows.filter((r) => (seen.has(r.htsno) ? false : seen.add(r.htsno)));
    await getDb().transaction(async (tx) => {
      await tx.delete(htsCodes);
      for (let i = 0; i < unique.length; i += CHUNK) await tx.insert(htsCodes).values(unique.slice(i, i + CHUNK));
    });
    await record('hts', unique.length);
    return { dataset: 'hts', rows: unique.length };
  } catch (err) {
    await record('hts', 0, err instanceof Error ? err.message : 'Sync failed.').catch(() => {});
    throw err;
  }
}

export async function syncScreeningList(): Promise<SyncResult> {
  try {
    const rows = parseCsvObjects(await download(CSL_URL)).filter((r) => r._id && r.name);
    if (rows.length < MIN_CSL_ROWS) throw new Error(`Only ${rows.length} screening entries came back (expected more than ${MIN_CSL_ROWS}). Keeping the existing copy.`);
    const seen = new Set<string>();
    const entries = rows
      .filter((r) => (seen.has(r._id) ? false : seen.add(r._id)))
      .map((r) => ({
        id: r._id,
        source: r.source,
        type: r.type || null,
        name: r.name,
        altNames: (r.alt_names || '').split(';').map((s) => s.trim()).filter(Boolean),
        programs: r.programs || null,
      }));
    await getDb().transaction(async (tx) => {
      await tx.delete(screeningEntries);
      for (let i = 0; i < entries.length; i += CHUNK) await tx.insert(screeningEntries).values(entries.slice(i, i + CHUNK));
    });
    await record('csl', entries.length);
    return { dataset: 'csl', rows: entries.length };
  } catch (err) {
    await record('csl', 0, err instanceof Error ? err.message : 'Sync failed.').catch(() => {});
    throw err;
  }
}
